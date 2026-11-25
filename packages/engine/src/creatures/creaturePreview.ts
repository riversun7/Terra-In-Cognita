// 크리쳐 하나 3D 미리 보기(크리쳐 편집기 /dev/creatures 상세) — docs/adr/2026-11-25-creature-codex-groups.md 3절.
// 캐릭터 미리 보기(characters/characterPreview.ts)와 같은 조작·같은 낮 빛으로 둥근 받침 위에 세운다.
// - 모델: GLB 파일(showModel)이 있으면 그것을 그린다. 없거나 읽지 못하면 임시 몸(showPlaceholder — 2차맵 큰 유닛과 같은 네 발 짐승,
//   characters/unitBodies.ts)을 그린다. 임시 몸은 크기 등급 배율로 키만 다르다.
// - GLB는 원래 크기 그대로 두고 카메라·받침을 모델 크기에 맞춘다(발이 받침에 닿게 내리고 가운데로 옮긴다). 애니메이션이 있으면 첫 클립을 돌린다.
// - 조작: 끌기 = 돌림·기울임, 휠·두 손가락 = 가까이·멀리, 키는 화면이 rotate·zoom을 부른다. 돌림판·움직임이 켜져 있을 때만 프레임 고리를 돈다.
// - 따로 진입점(@terra/engine/creaturePreview)이라 개발자 도구 조각만 가져온다.
import {
  AmbientLight,
  AnimationMixer,
  Box3,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Material,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PMREMGenerator,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type CompiledCharacter, compileCharacter } from "../characters/characterCompile.ts";
import { CharacterMeshes } from "../characters/characterMeshes.ts";
import { unitBodyModel } from "../characters/unitBodies.ts";
import { FIXED_SECOND_MAP_LIGHT } from "../lighting/secondMapLight.ts";

export interface CreaturePreviewStats {
  /** 지금 그리는 것: GLB 모델·임시 몸·아직 없음 */
  readonly kind: "model" | "placeholder" | "none";
  readonly triangles: number;
  readonly heightM: number;
  /** GLB에 든 애니메이션 클립 수(임시 몸은 0) */
  readonly clips: number;
  /** 지금까지 그린 프레임 수(시험이 그렸는지 본다) */
  readonly frames: number;
}

const MIN_PITCH = -0.1;
const MAX_PITCH = 1.2;
const DEFAULT_YAW = 0.6;
const DEFAULT_PITCH = 0.22;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.6;
const TURNTABLE_RAD_PER_S = 0.6;
const WALK_CYCLES_PER_S = 1.4;
const WALK_SWING = 0.55;
const WALK_BOB_M = 0.03;
/** 받침(풀) 색 — 세계 색이라 화면 테마와 상관없다 */
const GROUND_COLOR = new Color().setRGB(0.56, 0.66, 0.44, SRGBColorSpace);

/** 모델이 쓰던 GPU 자원(도형·재질·텍스처)을 버린다 */
function disposeObject(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const materials: readonly unknown[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!(material instanceof Material)) continue;
      for (const value of Object.values(material)) if (value instanceof Texture) value.dispose();
      material.dispose();
    }
  });
}

/** 삼각형 수(인덱스가 있으면 인덱스 수 ÷ 3) */
function countTriangles(root: Object3D): number {
  let triangles = 0;
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const index = node.geometry.getIndex();
    const position = node.geometry.getAttribute("position");
    triangles += Math.floor((index ? index.count : (position?.count ?? 0)) / 3);
  });
  return triangles;
}

export class CreaturePreview {
  private readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.05, 2000);
  private readonly meshes = new CharacterMeshes();
  private readonly hemisphere = new HemisphereLight();
  private readonly sun = new DirectionalLight();
  private readonly fill = new AmbientLight(0xffffff, 0.25);
  private readonly ground: Mesh;
  private readonly loader = new GLTFLoader();
  private readonly environment: Texture;
  private placeholder: CompiledCharacter | null = null;
  private placeholderScale = 1;
  private model: Object3D | null = null;
  private mixer: AnimationMixer | null = null;
  private modelTriangles = 0;
  private modelClips = 0;
  /** 지금 모델의 키·반지름(m) — 카메라·받침을 맞춘다 */
  private heightM = 1.6;
  private radiusM = 1;
  /** 마지막 showModel 요청(늦게 온 옛 응답을 버린다) */
  private request = 0;
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private zoomK = 1;
  private turntable = false;
  private moving = false;
  private frame = 0;
  private lastTime = 0;
  private clock = 0;
  private frames = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private readonly cleanup: (() => void)[] = [];
  private disposed = false;
  private readonly pose = { swing: 0, bob: 0, chop: 0 };
  private readonly root = new Float32Array(16);

  /** WebGL을 쓸 수 없으면 던진다(화면이 일러스트만 보인다) */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    const light = FIXED_SECOND_MAP_LIGHT;
    this.hemisphere.color.setRGB(...light.hemisphereSky);
    this.hemisphere.groundColor.setRGB(...light.hemisphereGround);
    this.hemisphere.intensity = light.hemisphereIntensity;
    this.sun.color.setRGB(...light.directColor);
    this.sun.intensity = light.directIntensity;
    this.sun.position.set(-0.5, 1, 0.8);
    this.scene.background = new Color().setRGB(...light.background);
    // GLB의 PBR 재질(금속·거칠기)이 검게 뜨지 않게 방 환경 빛을 준다(임시 몸 재질은 쓰지 않는다)
    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.6;
    this.ground = new Mesh(new CircleGeometry(1, 32), new MeshLambertMaterial({ color: GROUND_COLOR }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.005;
    this.scene.add(this.hemisphere, this.sun, this.fill, this.ground, this.meshes.group);
    this.listen();
  }

  /** 임시 몸(네 발 짐승)을 세운다. seed = 색 고르기, scale = 크기 배율(크기 등급) */
  showPlaceholder(seed: number, scale: number): CreaturePreviewStats {
    this.request += 1;
    this.clearModel();
    this.placeholder = compileCharacter(unitBodyModel({ kind: "beast", seed }));
    this.placeholderScale = Math.max(0.1, scale);
    this.heightM = this.placeholder.heightM * this.placeholderScale;
    // 짐승 몸은 앞뒤로 길다(길이 약 2m, 키 약 1.5m — 모델은 옆 너비만 알려 준다) → 키의 0.85배를 반지름으로 본다
    this.radiusM = Math.max(this.placeholder.halfWidthM * this.placeholderScale, this.heightM * 0.85);
    this.redraw();
    return this.stats();
  }

  /** GLB 모델을 받아 세운다. 읽지 못하면 던지고, 그리던 것은 그대로 둔다 */
  async showModel(url: string): Promise<CreaturePreviewStats> {
    const request = ++this.request;
    const gltf = await this.loader.loadAsync(url);
    const root = gltf.scene;
    if (this.disposed || request !== this.request) {
      disposeObject(root);
      return this.stats();
    }
    this.clearModel();
    this.placeholder = null;
    // 발이 받침에 닿고 가운데에 서게 옮긴다
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    this.heightM = Math.max(0.01, size.y);
    this.radiusM = Math.max(0.01, Math.hypot(size.x, size.z) / 2, size.y / 2);
    this.model = root;
    this.modelTriangles = countTriangles(root);
    this.modelClips = gltf.animations.length;
    const clip = gltf.animations[0];
    if (clip) {
      this.mixer = new AnimationMixer(root);
      this.mixer.clipAction(clip).play();
    }
    this.scene.add(root);
    this.redraw();
    return this.stats();
  }

  stats(): CreaturePreviewStats {
    return {
      kind: this.model ? "model" : this.placeholder ? "placeholder" : "none",
      triangles: this.model ? this.modelTriangles : (this.placeholder?.triangles ?? 0),
      heightM: this.heightM,
      clips: this.model ? this.modelClips : 0,
      frames: this.frames,
    };
  }

  /** 캔버스 크기(CSS px)와 픽셀 비율 */
  resize(width: number, height: number, pixelRatio: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.redraw();
  }

  /** 돌림(라디안): 가로 = 세로축, 세로 = 기울임 */
  rotate(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dPitch));
    this.redraw();
  }

  /** 가까이(< 1)·멀리(> 1) */
  zoom(factor: number): void {
    this.zoomK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoomK * factor));
    this.redraw();
  }

  /** 처음 보던 각도·거리로 */
  reset(): void {
    this.yaw = DEFAULT_YAW;
    this.pitch = DEFAULT_PITCH;
    this.zoomK = 1;
    this.redraw();
  }

  /** 움직임: 돌림판(천천히 돈다)·움직임(임시 몸 = 걷기, GLB = 첫 애니메이션 클립). 빠진 값은 그대로 둔다 */
  setMotion(motion: { turntable?: boolean; moving?: boolean }): void {
    if (motion.turntable !== undefined) this.turntable = motion.turntable;
    if (motion.moving !== undefined) this.moving = motion.moving;
    this.lastTime = 0;
    this.redraw();
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    for (const off of this.cleanup) off();
    this.clearModel();
    this.meshes.dispose();
    this.ground.geometry.dispose();
    if (this.ground.material instanceof Material) this.ground.material.dispose();
    this.environment.dispose();
    this.hemisphere.dispose();
    this.sun.dispose();
    this.fill.dispose();
    this.renderer.dispose();
    // 크리쳐를 바꿀 때마다 칸을 새로 만든다 → 컨텍스트를 바로 돌려준다(브라우저의 WebGL 컨텍스트 수 상한)
    this.renderer.forceContextLoss();
  }

  private clearModel(): void {
    if (!this.model) return;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.scene.remove(this.model);
    disposeObject(this.model);
    this.model = null;
    this.modelTriangles = 0;
    this.modelClips = 0;
  }

  private get animating(): boolean {
    return this.turntable || (this.moving && (this.placeholder !== null || this.mixer !== null));
  }

  private redraw(): void {
    if (this.disposed || this.frame !== 0) return;
    this.frame = requestAnimationFrame((time) => {
      this.frame = 0;
      this.draw(time);
    });
  }

  private draw(time: number): void {
    const delta = this.lastTime === 0 ? 0 : Math.min(100, time - this.lastTime) / 1000;
    this.lastTime = time;
    this.clock += delta;
    if (this.turntable) this.yaw += TURNTABLE_RAD_PER_S * delta;
    this.meshes.begin();
    if (this.placeholder) {
      const phase = this.clock * WALK_CYCLES_PER_S * Math.PI * 2;
      this.pose.swing = this.moving ? Math.sin(phase) * WALK_SWING : 0;
      this.pose.bob = this.moving ? Math.abs(Math.sin(phase)) * WALK_BOB_M : 0;
      const s = this.placeholderScale;
      this.root.fill(0);
      this.root[0] = s;
      this.root[5] = s;
      this.root[10] = s;
      this.root[15] = 1;
      this.meshes.add(this.placeholder, this.root, this.pose);
    }
    this.meshes.end();
    if (this.mixer && this.moving) this.mixer.update(delta);
    // 받침은 모델 반지름보다 조금 크게, 카메라는 키·너비가 다 들어오게
    this.ground.scale.setScalar(this.radiusM * 1.25);
    const targetY = this.heightM * 0.5;
    const reach = Math.max(this.heightM * 0.62, this.radiusM * 1.05);
    const r = (reach / Math.tan(((this.camera.fov / 2) * Math.PI) / 180)) * this.zoomK;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      Math.sin(this.yaw) * cp * r,
      targetY + Math.sin(this.pitch) * r,
      Math.cos(this.yaw) * cp * r,
    );
    this.camera.near = Math.max(0.01, r / 200);
    this.camera.far = r * 20 + this.radiusM * 4;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, targetY, 0);
    this.renderer.render(this.scene, this.camera);
    this.frames += 1;
    if (this.animating && document.visibilityState === "visible") this.redraw();
    else this.lastTime = 0;
  }

  /** 끌기·휠·두 손가락(캔버스에만), 탭이 다시 보이면 이어 그리기 */
  private listen(): void {
    const canvas = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ): void => {
      canvas.addEventListener(type, handler, options);
      this.cleanup.push(() => canvas.removeEventListener(type, handler, options));
    };
    on("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.pinch = this.pinchDistance();
    });
    on("pointermove", (event) => {
      const last = this.pointers.get(event.pointerId);
      if (!last) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size >= 2) {
        const next = this.pinchDistance();
        if (this.pinch > 0 && next > 0) this.zoom(this.pinch / next);
        this.pinch = next;
        return;
      }
      this.rotate(-(event.clientX - last.x) * 0.012, (event.clientY - last.y) * 0.008);
    });
    const release = (event: PointerEvent): void => {
      this.pointers.delete(event.pointerId);
      this.pinch = this.pinchDistance();
    };
    on("pointerup", release);
    on("pointercancel", release);
    on(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom(event.deltaY > 0 ? 1.1 : 1 / 1.1);
      },
      { passive: false },
    );
    const onVisible = (): void => {
      if (document.visibilityState === "visible") this.redraw();
    };
    document.addEventListener("visibilitychange", onVisible);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", onVisible));
  }

  private pinchDistance(): number {
    const list = [...this.pointers.values()];
    const a = list[0];
    const b = list[1];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
