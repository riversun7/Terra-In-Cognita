// 1차맵 달 — ADR 2026-10-29-primary-map-sky 5절. 달마다 구 하나(32×16, 지오메트리는 함께 쓴다), 텍스처 없음.
// - 빛: 공용 uSunDirView(항성 방향, 보기 공간)라 위상이 저절로 맞는다. 어두운 쪽은 라벤더 행성빛 + 가장자리 빛으로 실루엣이 남는다(삭에도).
// - 배경으로 그린다: 깊이 시험·쓰기 끔, renderOrder < 0(먼 달부터), frustumCulled false, 꼭짓점 셰이더 끝에서 z = 0.5·w.
//   WebGL 자르기 범위 [−w, w]·WebGPU [0, w] 둘 다 안쪽이라 near·far에 잘리지 않는다. 타일·바탕 구가 늘 그 위에 그리므로 달은
//   하늘과 행성 가장자리 뒤에서만 보이고 지도를 가리지 못한다(CesiumJS 달과 같은 방법). 엔진의 near·far는 그대로다.
// - 표면: 파스텔 장난감 톤(D-064) — 바다 3개·크레이터 15개를 물체 공간 원판(uniform 배열)으로. 모습 시드는 createRng라 모든 기기에서 같다.
// - 켜지는 동안(uFade < 1) 우주색과 섞어 나타난다(우주색 바탕 위에 깊이 없이 그리므로 알파 없이 섞는다).
// - 보임 판정(가드·옆 평면·행성 원판 뒤)은 skyController가 하고, 이 모듈은 받은 달만 놓는다.
import { createRng } from "@terra/shared";
import {
  BufferGeometry,
  Color,
  FrontSide,
  Matrix4,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  Vector4,
} from "three";
import type { SkyLightUniforms } from "./planetMaterials.ts";
import type { PlanetMoonDescription } from "./sky.ts";
import type { MoonPlacement, SkyMoonLayer } from "./skyController.ts";
import type { Vec3 } from "./vec3.ts";

/** 바다(어두운 넓은 얼룩) 수와 크레이터 수 */
const MARIA = 3;
const CRATERS = 15;
const SPOTS = MARIA + CRATERS;
/** 구 마디(가로·세로): 삼각형 960개 */
const WIDTH_SEGMENTS = 32;
const HEIGHT_SEGMENTS = 16;
/** 같은 화면에 그리는 달 수 상한(먼 것부터) */
export const MAX_MOONS = 4;
/** 맨 먼 달의 renderOrder(타일 0~, 바탕 구 1,000,000보다 앞) */
const FIRST_RENDER_ORDER = -20;

// 꼭짓점: 물체 공간 위치(크레이터 원판)·보기 공간 법선·보기 위치. 끝에서 z = 0.5·w(배경)
const MOON_VERTEX = /* glsl */ `
varying vec3 vObject;
varying vec3 vNormalView;
varying vec3 vViewPosition;
void main() {
  vObject = position;
  vNormalView = normalize(normalMatrix * normal);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
  gl_Position.z = 0.5 * gl_Position.w;
}
`;

// 조각: 원판 거리 = √(2(1 − cos)) (작은 각에서 각과 같다). 바다는 w < 0(어둡게), 크레이터는 바닥 어둡게 + 테두리 밝게.
// 명암 경계는 부드럽게(장난감 톤), 어두운 쪽 = 알베도 × 행성빛, 가장자리 빛은 어두운 쪽에서 더 세다.
const MOON_FRAGMENT = /* glsl */ `
uniform vec3 uSunDirView;
uniform vec4 uSpots[${SPOTS}];
uniform vec3 uAlbedo;
uniform vec3 uMare;
uniform vec3 uShine;
uniform vec3 uRim;
uniform vec3 uSpace;
uniform float uFade;
varying vec3 vObject;
varying vec3 vNormalView;
varying vec3 vViewPosition;
void main() {
  vec3 o = normalize(vObject);
  vec3 albedo = uAlbedo;
  for (int k = 0; k < ${SPOTS}; k++) {
    vec4 c = uSpots[k];
    float r = abs(c.w);
    float d = sqrt(max(0.0, 2.0 * (1.0 - dot(o, c.xyz))));
    if (c.w < 0.0) {
      albedo = mix(albedo, uMare, 1.0 - smoothstep(r * 0.75, r, d));
    } else {
      float x = d / r;
      albedo = mix(albedo, albedo * 0.8, 1.0 - smoothstep(0.7, 0.85, x));
      albedo += 0.09 * smoothstep(0.8, 0.95, x) * (1.0 - smoothstep(1.0, 1.25, x));
    }
  }
  vec3 n = normalize(vNormalView);
  float ndl = dot(n, uSunDirView);
  float lit = smoothstep(-0.06, 0.22, ndl) * (0.62 + 0.38 * max(ndl, 0.0));
  vec3 color = mix(albedo * uShine, albedo, lit);
  float facing = abs(dot(n, normalize(-vViewPosition)));
  color += uRim * pow(1.0 - facing, 3.0) * (1.0 - 0.7 * lit);
  gl_FragColor = vec4(mix(uSpace, color, uFade), 1.0);
}
`;

/** 모습 시드로 정한 바다·크레이터(물체 공간 방향, 각 반지름. 음수 = 바다). +x = 앞면(행성 쪽)에 바다 3개·큰 크레이터 5개 */
export function moonSpots(seed: number): Vector4[] {
  const rng = createRng(seed);
  const unit = (): number => rng.nextU32() / 0x1_0000_0000;
  const spots: Vector4[] = [];
  for (let k = 0; k < SPOTS; k++) {
    const z = 2 * unit() - 1;
    const angle = unit() * 2 * Math.PI;
    const ring = Math.sqrt(1 - z * z);
    const direction = new Vector3(ring * Math.cos(angle), ring * Math.sin(angle), z);
    const mare = k < MARIA;
    const large = k < MARIA + 5;
    if (large && direction.x < 0.2) direction.x = Math.abs(direction.x) + 0.4;
    direction.normalize();
    const radius = mare ? 0.22 + 0.16 * unit() : large ? 0.09 + 0.07 * unit() : 0.04 + 0.03 * unit();
    spots.push(new Vector4(direction.x, direction.y, direction.z, mare ? -radius : radius));
  }
  return spots;
}

/** 달 재질(달마다 하나: 모습이 다르다). 항성 방향은 공용 uniform 객체 */
export function createMoonMaterial(
  shared: Pick<SkyLightUniforms, "uSunDirView">,
  seed: number,
  spaceColor: number,
): ShaderMaterial {
  const space = new Color(spaceColor);
  return new ShaderMaterial({
    uniforms: {
      uSunDirView: shared.uSunDirView,
      uSpots: { value: moonSpots(seed) },
      uAlbedo: { value: new Vector3(0.93, 0.91, 0.96) },
      uMare: { value: new Vector3(0.7, 0.69, 0.83) },
      uShine: { value: new Vector3(0.2, 0.21, 0.33) },
      uRim: { value: new Vector3(0.36, 0.38, 0.62) },
      uSpace: { value: new Vector3(space.r, space.g, space.b) },
      uFade: { value: 1 },
    },
    vertexShader: MOON_VERTEX,
    fragmentShader: MOON_FRAGMENT,
    side: FrontSide,
    depthTest: false,
    depthWrite: false,
  });
}

const basis = new Matrix4();
const toPlanet = new Vector3();
const pole = new Vector3();
const side = new Vector3();

/** 달 메시를 놓는다: 가운데 − 카메라(실수 64비트 뺄셈), 반지름, 조석 고정(+x = 행성 쪽, +z = 궤도 극) */
function placeMesh(mesh: Mesh, placement: MoonPlacement, cameraPosition: Vec3): void {
  const [cx, cy, cz] = placement.center;
  mesh.position.set(cx - cameraPosition[0], cy - cameraPosition[1], cz - cameraPosition[2]);
  mesh.scale.setScalar(placement.radiusM);
  toPlanet.set(-cx, -cy, -cz).normalize();
  pole.set(placement.orbitPole[0], placement.orbitPole[1], placement.orbitPole[2]);
  pole.addScaledVector(toPlanet, -pole.dot(toPlanet)).normalize();
  side.crossVectors(pole, toPlanet);
  basis.makeBasis(toPlanet, side, pole);
  mesh.quaternion.setFromRotationMatrix(basis);
}

export class MoonLayer implements SkyMoonLayer {
  readonly meshes: readonly Mesh<BufferGeometry, ShaderMaterial>[];
  private readonly geometry: SphereGeometry;
  private readonly materials: readonly ShaderMaterial[];

  constructor(
    shared: Pick<SkyLightUniforms, "uSunDirView">,
    moons: readonly PlanetMoonDescription[],
    spaceColor: number,
  ) {
    this.geometry = new SphereGeometry(1, WIDTH_SEGMENTS, HEIGHT_SEGMENTS);
    this.materials = moons
      .slice(0, MAX_MOONS)
      .map((moon) => createMoonMaterial(shared, moon.lookSeed, spaceColor));
    this.meshes = this.materials.map((material) => {
      const mesh = new Mesh<BufferGeometry, ShaderMaterial>(this.geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = FIRST_RENDER_ORDER;
      mesh.visible = false;
      mesh.matrixAutoUpdate = true;
      return mesh;
    });
  }

  /** 지오메트리 하나(위치·법선·uv + 인덱스) — 달 수와 상관없다 */
  get gpuBytes(): number {
    const attributes = this.geometry.attributes;
    let bytes = this.geometry.index ? this.geometry.index.array.byteLength : 0;
    for (const name of Object.keys(attributes)) bytes += attributes[name]?.array.byteLength ?? 0;
    return bytes;
  }

  place(moons: readonly MoonPlacement[], cameraPosition: Vec3, fade: number): void {
    for (const mesh of this.meshes) mesh.visible = false;
    const distance = (placement: MoonPlacement): number =>
      Math.hypot(
        placement.center[0] - cameraPosition[0],
        placement.center[1] - cameraPosition[1],
        placement.center[2] - cameraPosition[2],
      );
    // 깊이가 없으므로 먼 달부터 그린다(가까운 달이 먼 달을 덮는다)
    const ordered = moons.filter((moon) => this.meshes[moon.index]);
    // oxlint-disable-next-line unicorn/no-array-sort -- filter가 만든 사본이다(toSorted는 지원 하한 Firefox 114에 없다)
    ordered.sort((a, b) => distance(b) - distance(a));
    ordered.forEach((placement, order) => {
      const mesh = this.meshes[placement.index];
      if (!mesh) return;
      placeMesh(mesh, placement, cameraPosition);
      mesh.renderOrder = FIRST_RENDER_ORDER + order;
      const uniform = mesh.material.uniforms.uFade;
      if (uniform) uniform.value = fade;
      mesh.visible = true;
    });
  }

  hide(): void {
    for (const mesh of this.meshes) mesh.visible = false;
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.removeFromParent();
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
