// 1차맵 구름 — GPU에서 굽는 구름 큐브 하나 + 껍질 하나. ADR 2026-10-29-primary-map-sky 6절.
// - 굽기: R8 큐브 렌더 타깃(면 512², 밉맵, 깊이 없음, JS 사본 없음). 전체 화면 삼각형 하나로 면을 그린다(면 방향은 cloudClimate.ts와
//   같은 식). 쉬는 프레임마다 면 하나(cloudSchedule.ts), 밉맵은 여섯째 면 뒤에 한 번.
// - 덮임 = 3D 노이즈 텍스처(64³ R8, 행성 시드 createRng, cloudNoise.ts)로 읽는 값 노이즈 fbm 6옥타브. 낮은 옥타브만 휜다
//   (3옥타브 fbm 3개로 자리를 휘고 6옥타브를 읽는다 — 텍셀당 노이즈 15번). 여기에 기후 치우침(바다 위도 띠, 땅 습도 — 기후 큐브)을
//   곱하고 문턱을 뺀다. 날씨 창이 바뀌면 노이즈를 읽는 자리를 옮긴다.
// - 껍질: 구 하나(128×64)를 R + 높이로 키워 그린다. 큐브를 화소당 2번 읽는다(덮임, 해 쪽으로 조금 옮긴 자리 = 두께 음영).
//   밤 쪽은 라벤더로 어둡고 옅게(땅이 보이게), 가장자리는 옅게(대기 띠와 하얀 고리가 겹치지 않게), 고른 칸 둘레는 비운다.
//   거리로 걷힌다(sky.ts cloudFade: 1.2R 안쪽 없음). 그림자는 넣지 않는다(사용자 결정 U2).
// - 끄는 곳: 기후 레이어(굽지도 그리지도 않는다), 하늘 off, 틈 찾기, 요소 끔. R8 렌더 타깃이 안 되면 구름만 끄고 한 번 알린다.
// - 셰이더 설명 주석은 GLSL 문자열 밖에 둔다(문자열 안 주석은 압축 뒤에도 사용자에게 간다).
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  CubeTexture,
  Data3DTexture,
  DataTexture,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  RGFormat,
  RedFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector2,
  Vector3,
  type Vector4,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from "three";
import { climateAt, climateCubeSize, climateFaces } from "./cloudClimate.ts";
import { CLOUD_NOISE_SIZE, cloudNoiseLattice, weatherOffset, weatherWindowIndex } from "./cloudNoise.ts";
import { CLOUD_LOOK, CLOUD_TIMING, CloudSchedule, cloudLiftM } from "./cloudSchedule.ts";
import { DAY_NIGHT_GLSL, type SkyLightUniforms } from "./planetMaterials.ts";
import type { DecodedTile } from "./planetTypes.ts";
import { cloudFade } from "./sky.ts";
import type { CloudFrame, SkyCloudLayer } from "./skyController.ts";
import type { TileLayout } from "./tileTree.ts";

/** 노이즈 크기(행성 지름에 견준 무늬 크기)·땅 습도 비중·적도 수렴대 위도(시제품 값) */
const NOISE_SCALE = 4.2;
const LAND_WEIGHT = 0.75;
const ITCZ_LAT_DEG = 0;
/** 껍질 구 마디(가로·세로) */
const SHELL_SEGMENTS = [128, 64] as const;
/** 대기 띠(renderOrder 0) 다음에 그린다 */
const SHELL_RENDER_ORDER = 10;

// 면 방향(cloudClimate.ts glCubeDirection과 같은 식)
const FACE_DIR = /* glsl */ `
uniform int uFace;
uniform float uSize;
vec3 faceDir(int face, vec2 st) {
  float sc = 2.0 * st.x - 1.0;
  float tc = 2.0 * st.y - 1.0;
  if (face == 0) return vec3(1.0, -tc, -sc);
  if (face == 1) return vec3(-1.0, -tc, sc);
  if (face == 2) return vec3(sc, 1.0, tc);
  if (face == 3) return vec3(sc, -1.0, -tc);
  if (face == 4) return vec3(sc, -tc, 1.0);
  return vec3(-sc, -tc, -1.0);
}`;

// 값 노이즈: 격자값을 하드웨어 삼선형으로 읽되 칸 안 위치를 smoothstep으로 바꿔 격자 자국을 줄인다.
// zonal: 위도 띠(적도 수렴대·중위도 폭풍대 흐림, 아열대 맑음) — 생성기 zonalPrecipitation과 같은 모양(임시 값).
// 땅은 기후 큐브를 밉 1.5단계(textureLod)로, 노이즈로 흔든 자리에서 읽어 해안선 모양이 찍히지 않게 한다.
// texture(…, 1.5)의 셋째 값은 계산한 LOD에 더하는 치우침이라, 32칸 큐브를 512칸 면에서 읽는 확대(LOD 약 −4)에서는 기본 단계 그대로였다
// (헤드리스 사진에서 구름 가장자리가 곧은 해안선을 따랐다).
const BAKE_FRAGMENT = /* glsl */ `
uniform highp sampler3D uNoise;
uniform samplerCube uClimate;
uniform vec3 uOffset;
${FACE_DIR}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return texture(uNoise, (i + f + 0.5) * ${(1 / CLOUD_NOISE_SIZE).toFixed(8)}).r;
}
float fbm(vec3 p, int octaves) {
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int o = 0; o < 6; o++) {
    if (o >= octaves) break;
    s += a * vnoise(p);
    n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / n;
}
float zonal(vec3 d) {
  float lat = degrees(asin(clamp(d.z, -1.0, 1.0)));
  float itcz = exp(-pow((lat - ${ITCZ_LAT_DEG.toFixed(1)}) / 9.0, 2.0));
  float storm = exp(-pow((abs(lat) - 55.0) / 13.0, 2.0));
  float dry = exp(-pow((abs(lat) - 27.0) / 8.0, 2.0));
  return clamp(0.42 + 0.42 * itcz + 0.34 * storm - 0.26 * dry, 0.0, 1.0);
}
void main() {
  vec3 d = normalize(faceDir(uFace, gl_FragCoord.xy / uSize));
  vec3 p = d * ${NOISE_SCALE.toFixed(2)} + uOffset;
  vec3 w = vec3(fbm(p * 0.5, 3), fbm(p * 0.5 + vec3(5.2, 1.3, 2.8), 3), fbm(p * 0.5 + vec3(1.7, 9.2, 4.4), 3));
  float n = fbm(p + 1.2 * (w - 0.5), 6);
  vec2 cl = textureLod(uClimate, normalize(d + 0.035 * (w - 0.5)), 1.5).rg;
  float land = smoothstep(0.15, 0.85, cl.g);
  float bias = mix(zonal(d), clamp(0.15 + 0.95 * cl.r, 0.0, 1.0), land * ${LAND_WEIGHT.toFixed(2)});
  float c = clamp(n * (0.55 + 0.75 * bias) + 0.32 * (bias - 0.5), 0.0, 1.0);
  gl_FragColor = vec4(c, 0.0, 0.0, 1.0);
}`;

const BAKE_VERTEX = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SHELL_VERTEX = /* glsl */ `
varying vec3 vDir;
varying vec3 vViewPosition;
varying vec3 vNormalView;
void main() {
  vDir = normalize(position);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = viewPosition.xyz;
  vNormalView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewPosition;
}`;

// 껍질: 덮임 문턱을 거리로 올려 걷히고(uShift), 해 쪽으로 옮겨 읽은 값과의 차로 가장자리를 밝게, 두꺼운 곳은 조금 어둡게.
// 밤: 라벤더로 어둡고 불투명도 × 0.55(땅이 보이게). 가장자리(시선과 거의 직각)는 옅게. 고른 칸 둘레(uPickClear)는 비운다.
const SHELL_FRAGMENT = /* glsl */ `
uniform samplerCube uCloud;
uniform float uOpacity;
uniform vec2 uCover;
uniform float uShift;
uniform vec3 uSunDir;
uniform vec4 uPickClear;
uniform float uPickEdge;
${DAY_NIGHT_GLSL}
varying vec3 vDir;
varying vec3 vViewPosition;
varying vec3 vNormalView;
void main() {
  vec3 d = normalize(vDir);
  float c = texture(uCloud, d).r;
  float a = smoothstep(uCover.x + uShift, uCover.y + uShift, c);
  float toward = texture(uCloud, normalize(d + uSunDir * 0.012), 1.0).r;
  vec3 color = vec3(1.0 - 0.16 * smoothstep(uCover.x, 1.0, c)) + 0.06 * max(c - toward, 0.0);
  float day = smoothstep(uNight.y, uNight.z, dot(d, uSunDir));
  vec3 light = mix(uNightTint * (uNight.x * 0.95), vec3(1.0), day);
  light *= mix(vec3(1.0), uTwilight.rgb * vec3(1.0, 0.96, 0.92), uTwilight.a * 4.0 * day * (1.0 - day));
  color *= mix(vec3(1.0), light, uNight.w);
  a *= mix(1.0, mix(0.55, 1.0, day), uNight.w);
  a *= smoothstep(0.02, 0.25, abs(dot(normalize(vNormalView), normalize(-vViewPosition))));
  a *= 1.0 - smoothstep(uPickEdge, uPickClear.w, dot(d, uPickClear.xyz));
  gl_FragColor = vec4(color, a * uOpacity);
}`;

/** 고른 칸 둘레 비우기 uniform(planetView가 고친다): xyz 고른 칸 방향, w 안쪽 cos / 바깥 cos. 없으면 cos 3·2(닿지 않음) */
export interface PickClearUniforms {
  uPickClear: { value: Vector4 };
  uPickEdge: { value: number };
}

export interface CloudLayerOptions {
  readonly renderer: WebGLRenderer;
  readonly radiusM: number;
  readonly layout: TileLayout;
  /** 구름 시드(u32, 정의 해시 앞 8자리) */
  readonly seed: number;
  readonly shared: SkyLightUniforms;
  readonly pick: PickClearUniforms;
  /** 풀어 둔 타일(첫 단계 타일로 기후 큐브를 만든다) */
  readonly decoded: (key: number) => DecodedTile | null;
  /** 첫 단계 타일을 다 받았나 */
  readonly climateReady: () => boolean;
  readonly requestFrame: () => void;
  /** 구름만 끌 때 한 번 알린다 */
  readonly report: (error: unknown) => void;
  /** [재기 모드] GPU 끝까지 기다리기(면 굽기 시간을 GPU 끝까지 잰다) */
  readonly sync?: () => void;
}

/** 텍스처 바이트 × 밉맵(4/3) */
const mipBytes = (bytes: number): number => Math.round((bytes * 4) / 3);

export class CloudLayer implements SkyCloudLayer {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly options: CloudLayerOptions;
  private readonly target: WebGLCubeRenderTarget;
  private readonly noise: Data3DTexture;
  private climate: CubeTexture<DataTexture> | null = null;
  private readonly climateSize: number;
  private readonly bakeScene = new Scene();
  private readonly bakeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly bakeMaterial: ShaderMaterial;
  private readonly bakeGeometry: BufferGeometry;
  private readonly schedule = new CloudSchedule();
  private readonly faceMs: number[] = Array.from({ length: 6 }, () => 0);
  private wake: ReturnType<typeof setTimeout> | null = null;
  private checked = false;
  private failed = false;
  private disposed = false;
  private lastOpacity = 0;
  private lastBakeMaxMs: number | null = null;
  /** 큐브 렌더 타깃·텍스처를 GPU에 올렸다(첫 굽기부터. 컨텍스트 복구 뒤 다시 굽기 전까지는 아니다) */
  private allocated = false;

  constructor(options: CloudLayerOptions) {
    this.options = options;
    const size = CLOUD_LOOK.cubeSize;
    this.target = new WebGLCubeRenderTarget(size, {
      format: RedFormat,
      type: UnsignedByteType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.noise = new Data3DTexture(
      cloudNoiseLattice(options.seed),
      CLOUD_NOISE_SIZE,
      CLOUD_NOISE_SIZE,
      CLOUD_NOISE_SIZE,
    );
    this.noise.format = RedFormat;
    this.noise.type = UnsignedByteType;
    this.noise.minFilter = LinearFilter;
    this.noise.magFilter = LinearFilter;
    this.noise.wrapS = RepeatWrapping;
    this.noise.wrapT = RepeatWrapping;
    this.noise.wrapR = RepeatWrapping;
    this.noise.unpackAlignment = 1;
    this.noise.needsUpdate = true;
    this.climateSize = climateCubeSize(options.layout);

    this.bakeMaterial = new ShaderMaterial({
      uniforms: {
        uFace: { value: 0 },
        uSize: { value: size },
        uNoise: { value: this.noise },
        uClimate: { value: null },
        uOffset: { value: new Vector3() },
      },
      vertexShader: BAKE_VERTEX,
      fragmentShader: BAKE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.bakeGeometry = new BufferGeometry();
    this.bakeGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    const bakeMesh = new Mesh(this.bakeGeometry, this.bakeMaterial);
    bakeMesh.frustumCulled = false;
    this.bakeScene.add(bakeMesh);

    const material = new ShaderMaterial({
      uniforms: {
        uCloud: { value: this.target.texture },
        uOpacity: { value: 0 },
        uCover: { value: new Vector2(CLOUD_LOOK.coverLow, CLOUD_LOOK.coverHigh) },
        uShift: { value: 0 },
        ...options.shared,
        ...options.pick,
      },
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      side: FrontSide,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, SHELL_SEGMENTS[0], SHELL_SEGMENTS[1]), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = SHELL_RENDER_ORDER;
    this.mesh.visible = false;
  }

  get opacity(): number {
    return this.lastOpacity;
  }

  get bakes(): number {
    return this.schedule.bakes;
  }

  get bakeMaxMs(): number | null {
    return this.lastBakeMaxMs;
  }

  /** 구름 큐브(밉맵 포함) + 노이즈 + 기후 큐브 + 껍질 지오메트리. 굽기 전(가까이서만 쓴 세션)에는 0 */
  get gpuBytes(): number {
    if (!this.allocated) return 0;
    const size = CLOUD_LOOK.cubeSize;
    const geometry = this.mesh.geometry;
    let shell = geometry.index ? geometry.index.array.byteLength : 0;
    for (const name of Object.keys(geometry.attributes))
      shell += geometry.attributes[name]?.array.byteLength ?? 0;
    return (
      mipBytes(size * size * 6) +
      CLOUD_NOISE_SIZE * CLOUD_NOISE_SIZE * CLOUD_NOISE_SIZE +
      mipBytes(this.climateSize * this.climateSize * 6 * 2) +
      shell
    );
  }

  /** 굽기 셰이더를 미리 컴파일한다(껍질은 skyLayers.ts가 장면 빛으로 따로 컴파일한다) */
  precompile(compile: (scene: Scene, camera: Camera) => void): void {
    compile(this.bakeScene, this.bakeCamera);
  }

  update(input: CloudFrame): boolean {
    const { frame, sky } = input;
    if (this.failed || this.disposed || frame.layer !== "terrain") {
      this.hide();
      return false;
    }
    const busy = frame.gestureActive || frame.cameraMoving || frame.tilesBusy;
    const settling = !busy && frame.msSinceGesture < CLOUD_TIMING.settleMs;
    // 걷히기(거리): 보이지 않는 거리(1.2R 안)면 굽지도 않는다
    const fade = cloudFade(frame.distanceM, this.options.radiusM);
    const step = this.schedule.step({
      nowMs: frame.nowMs,
      windowIndex: weatherWindowIndex(sky.calendar.msSinceEpoch),
      climateReady: this.options.climateReady(),
      idle: !busy && !settling,
      visible: fade.visible,
      msUntilIdle: settling ? CLOUD_TIMING.settleMs - frame.msSinceGesture : null,
    });
    if (step.bakeFace !== null && !this.bakeFace(step.bakeFace, step.windowIndex)) return false;

    const opacity = CLOUD_LOOK.maxOpacity * step.fade * fade.opacityScale;
    const visible = fade.visible && opacity > 0.001;
    this.mesh.visible = visible;
    this.lastOpacity = visible ? opacity : 0;
    if (visible) {
      const [x, y, z] = frame.pose.position;
      this.mesh.position.set(-x, -y, -z);
      this.mesh.scale.setScalar(this.options.radiusM + cloudLiftM(this.options.radiusM, frame.exaggeration));
      const uniforms = this.mesh.material.uniforms;
      if (uniforms.uOpacity) uniforms.uOpacity.value = opacity;
      if (uniforms.uShift) uniforms.uShift.value = fade.thresholdShift;
    }
    this.armWake(step.wakeInMs);
    return step.animating;
  }

  hide(): void {
    this.mesh.visible = false;
    this.lastOpacity = 0;
    this.armWake(null);
  }

  invalidate(): void {
    this.checked = false;
    this.allocated = false;
    this.schedule.invalidate();
    this.options.requestFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.armWake(null);
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.bakeGeometry.dispose();
    this.bakeMaterial.dispose();
    this.target.dispose();
    this.noise.dispose();
    this.climate?.dispose();
  }

  /** 면 하나를 굽는다. 면 0이면 기후 큐브를 다시 만들고 날씨 창 오프셋을 정한다. 렌더 타깃을 쓸 수 없으면 false(구름 끔) */
  private bakeFace(face: number, windowIndex: number): boolean {
    const { renderer } = this.options;
    if (face === 0) {
      this.rebuildClimate();
      const offset = weatherOffset(this.options.seed, windowIndex);
      const uniform = this.bakeMaterial.uniforms.uOffset;
      if (uniform) uniform.value = new Vector3(offset[0], offset[1], offset[2]);
    }
    const started = performance.now();
    const previous = renderer.getRenderTarget();
    this.target.texture.generateMipmaps = face === 5;
    renderer.setRenderTarget(this.target, face);
    this.allocated = true;
    if (!this.checked) {
      // R8 색 렌더 타깃(WebGL2는 늘 된다고 본다, Assumed). 안 되면 구름만 끄고 알린다(RGBA8 대체 경로는 두지 않는다)
      const gl = renderer.getContext();
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        renderer.setRenderTarget(previous);
        this.target.texture.generateMipmaps = true;
        this.fail(new Error(`cloud render target is not complete: 0x${status.toString(16)}`));
        return false;
      }
      this.checked = true;
    }
    const uniform = this.bakeMaterial.uniforms.uFace;
    if (uniform) uniform.value = face;
    renderer.render(this.bakeScene, this.bakeCamera);
    renderer.setRenderTarget(previous);
    this.target.texture.generateMipmaps = true;
    this.options.sync?.();
    this.faceMs[face] = performance.now() - started;
    if (face === 5) this.lastBakeMaxMs = Math.max(...this.faceMs);
    return true;
  }

  /** 첫 단계 타일 → RG8 기후 큐브(없는 타일은 바다) */
  private rebuildClimate(): void {
    const { layout, decoded } = this.options;
    const size = this.climateSize;
    const faces = climateFaces(size, (direction) => climateAt(direction, layout, decoded)).map((data) => {
      const face = new DataTexture(data, size, size, RGFormat, UnsignedByteType);
      face.unpackAlignment = 1;
      return face;
    });
    const cube = new CubeTexture<DataTexture>(faces);
    cube.format = RGFormat;
    cube.type = UnsignedByteType;
    cube.generateMipmaps = true;
    cube.minFilter = LinearMipmapLinearFilter;
    cube.magFilter = LinearFilter;
    cube.needsUpdate = true;
    this.climate?.dispose();
    this.climate = cube;
    const uniform = this.bakeMaterial.uniforms.uClimate;
    if (uniform) uniform.value = cube;
  }

  private armWake(ms: number | null): void {
    if (this.wake !== null) clearTimeout(this.wake);
    this.wake = null;
    if (ms === null || this.disposed) return;
    this.wake = setTimeout(
      () => {
        this.wake = null;
        if (!this.disposed) this.options.requestFrame();
      },
      Math.max(0, ms),
    );
  }

  private fail(error: unknown): void {
    this.failed = true;
    this.hide();
    this.options.report(error);
  }
}
