// 캐릭터 하나 미리 보기(사이보그 만들기 "외형" 단계) + 썸네일 — docs/adr/2026-11-11-character-3d.md 3절.
// 2차맵과 같은 그리기(CharacterMeshes: 로우폴리 조각, 도형별 InstancedMesh)와 같은 낮 빛(FIXED_SECOND_MAP_LIGHT)으로 둥근 받침 위에 세운다.
// - 돌려 보기: 끌기(포인터) = 돌림·기울임, 휠·두 손가락 = 가까이·멀리, 키는 화면이 rotate·zoom을 부른다.
// - 움직임: 돌림판(천천히 돈다)·걷기·숨쉬기(서 있을 때 살짝 오르내림)가 켜져 있을 때만 프레임 고리를 돈다. 모두 끄면 바뀔 때만 그린다.
//   숨긴 탭에서는 쉰다. 동작 줄이기면 화면이 돌림판·숨쉬기를 끈다(setMotion).
// - 썸네일: 따로 작은 렌더러 하나로 외형마다 한 장씩 그려 PNG data URL로 준다(끝나면 렌더러를 버린다).
// - 따로 진입점(@terra/engine/characterPreview)이라 만들기 화면이 지연 로딩한다(첫 화면·지도 묶음과 상관없다).
import type { CharacterLook } from "@terra/shared/characterLook";
import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from "three";
import { FIXED_SECOND_MAP_LIGHT } from "../lighting/secondMapLight.ts";
import { type CharacterPose, type CompiledCharacter, compileCharacter } from "./characterCompile.ts";
import { CharacterMeshes } from "./characterMeshes.ts";
import { type CharacterLod, characterModel } from "./characterModel.ts";

export interface CharacterPreviewStats {
  /** 조각·삼각형 수와 키(m) */
  readonly parts: number;
  readonly triangles: number;
  readonly heightM: number;
  /** 지금까지 그린 프레임 수(시험이 그렸는지 본다) */
  readonly frames: number;
}

const MIN_PITCH = -0.1;
const MAX_PITCH = 1.2;
const DEFAULT_YAW = 0.45;
const DEFAULT_PITCH = 0.2;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.2;
/** 돌림판 빠르기(라디안/초)·걷기 빠르기(걸음 바퀴/초)·숨쉬기(바퀴/초, m) */
const TURNTABLE_RAD_PER_S = 0.7;
const WALK_CYCLES_PER_S = 1.5;
const WALK_SWING = 0.6;
const WALK_BOB_M = 0.035;
const BREATH_CYCLES_PER_S = 0.45;
const BREATH_M = 0.012;
/** 받침(풀)·밤 받침 빛(세계 색, 테마와 상관없다) */
const GROUND_COLOR = new Color().setRGB(0.56, 0.66, 0.44, SRGBColorSpace);
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** 장면(빛·받침·캐릭터 하나) — 미리 보기와 썸네일이 함께 쓴다 */
class CharacterStage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.1, 100);
  readonly meshes = new CharacterMeshes();
  private readonly hemisphere = new HemisphereLight();
  private readonly sun = new DirectionalLight();
  private readonly ambient = new AmbientLight(0xffffff, 0);
  private readonly ground: Mesh;
  private compiled: CompiledCharacter | null = null;
  night = 0;

  constructor(withGround: boolean) {
    this.ground = new Mesh(new CircleGeometry(0.9, 24), new MeshLambertMaterial({ color: GROUND_COLOR }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.005;
    this.ground.visible = withGround;
    this.scene.add(this.hemisphere, this.sun, this.ambient, this.ground, this.meshes.group);
    this.applyLight();
  }

  set(look: CharacterLook, lod: CharacterLod = 0): CompiledCharacter {
    this.compiled = compileCharacter(characterModel(look, lod));
    return this.compiled;
  }

  get model(): CompiledCharacter | null {
    return this.compiled;
  }

  /** 자세를 넣고 카메라를 놓는다(가운데 = 키의 중간, 거리 = 키에 맞춤 × zoom) */
  pose(pose: CharacterPose, yaw: number, pitch: number, zoom: number): void {
    const compiled = this.compiled;
    this.meshes.begin();
    if (compiled) this.meshes.add(compiled, IDENTITY, pose);
    this.meshes.end();
    const height = compiled?.heightM ?? 1.8;
    const targetY = height * 0.5;
    const fit = (height * 0.62) / Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    const r = fit * zoom;
    const cp = Math.cos(pitch);
    this.camera.position.set(Math.sin(yaw) * cp * r, targetY + Math.sin(pitch) * r, Math.cos(yaw) * cp * r);
    this.camera.lookAt(0, targetY, 0);
  }

  setNight(amount: number): void {
    this.night = Math.min(1, Math.max(0, amount));
    this.applyLight();
  }

  dispose(): void {
    this.meshes.dispose();
    this.ground.geometry.dispose();
    if (this.ground.material instanceof MeshLambertMaterial) this.ground.material.dispose();
    this.hemisphere.dispose();
    this.sun.dispose();
    this.ambient.dispose();
  }

  /** 배경 색(낮 하늘 ~ 밤). 썸네일은 투명 배경이라 쓰지 않는다 */
  background(): Color {
    const bg = FIXED_SECOND_MAP_LIGHT.background;
    const k = 0.22 + 0.78 * (1 - this.night);
    return new Color().setRGB(bg[0] * k, bg[1] * k, bg[2] * k);
  }

  private applyLight(): void {
    const light = FIXED_SECOND_MAP_LIGHT;
    const day = 1 - this.night;
    this.hemisphere.color.setRGB(...light.hemisphereSky);
    this.hemisphere.groundColor.setRGB(...light.hemisphereGround);
    this.hemisphere.intensity = light.hemisphereIntensity * (0.3 + 0.7 * day);
    this.sun.color.setRGB(...light.directColor);
    this.sun.intensity = light.directIntensity * day;
    // 앞 왼쪽 위에서 비춘다(얼굴이 밝게)
    this.sun.position.set(-0.5, 1, 0.8);
    // 밤에는 달빛 대신 약한 푸른 빛 + 몸 밤 빛(2차맵 유닛과 같은 방식)
    this.ambient.color.setRGB(0.35, 0.42, 0.62);
    this.ambient.intensity = 0.45 * this.night;
    this.meshes.setNightLift(0.3 * this.night);
  }
}

export class CharacterPreview {
  private readonly renderer: WebGLRenderer;
  private readonly stage = new CharacterStage(true);
  private readonly canvas: HTMLCanvasElement;
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private zoomK = 1;
  private turntable = false;
  private walking = false;
  private breathing = true;
  private frame = 0;
  private lastTime = 0;
  private clock = 0;
  private frames = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private readonly cleanup: (() => void)[] = [];
  private disposed = false;
  private readonly pose = { swing: 0, bob: 0 };

  /** WebGL을 쓸 수 없으면 던진다(화면이 2D 그림으로 바꾼다) */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.stage.scene.background = this.stage.background();
    this.listen();
  }

  /** 외형을 바꾼다 */
  set(look: CharacterLook): CharacterPreviewStats {
    this.stage.set(look, 0);
    this.redraw();
    return this.stats();
  }

  stats(): CharacterPreviewStats {
    const model = this.stage.model;
    return {
      parts: model?.count ?? 0,
      triangles: model?.triangles ?? 0,
      heightM: model?.heightM ?? 0,
      frames: this.frames,
    };
  }

  /** 캔버스 크기(CSS px)와 픽셀 비율 */
  resize(width: number, height: number, pixelRatio: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)));
    this.renderer.setSize(width, height, false);
    this.stage.camera.aspect = width / height;
    this.stage.camera.updateProjectionMatrix();
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

  /** 밤 정도(0 = 낮, 1 = 밤): 눈·등불 빛을 본다 */
  setNight(amount: number): void {
    this.stage.setNight(amount);
    this.stage.scene.background = this.stage.background();
    this.redraw();
  }

  /** 움직임: 돌림판(천천히 돈다)·걷기·숨쉬기. 빠진 값은 그대로 둔다 */
  setMotion(motion: { turntable?: boolean; walking?: boolean; breathing?: boolean }): void {
    if (motion.turntable !== undefined) this.turntable = motion.turntable;
    if (motion.walking !== undefined) this.walking = motion.walking;
    if (motion.breathing !== undefined) this.breathing = motion.breathing;
    this.lastTime = 0;
    this.redraw();
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    for (const off of this.cleanup) off();
    this.stage.dispose();
    this.renderer.dispose();
  }

  private get animating(): boolean {
    return this.turntable || this.walking || this.breathing;
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
    if (this.walking) {
      const phase = this.clock * WALK_CYCLES_PER_S * Math.PI * 2;
      this.pose.swing = Math.sin(phase) * WALK_SWING;
      this.pose.bob = Math.abs(Math.sin(phase)) * WALK_BOB_M;
    } else {
      this.pose.swing = 0;
      this.pose.bob = this.breathing
        ? (Math.sin(this.clock * BREATH_CYCLES_PER_S * Math.PI * 2) + 1) * BREATH_M
        : 0;
    }
    this.stage.pose(this.pose, this.yaw, this.pitch, this.zoomK);
    this.renderer.render(this.stage.scene, this.stage.camera);
    this.frames += 1;
    // 움직임이 켜져 있고 탭이 보이면 이어서 그린다
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

/**
 * 외형마다 썸네일 한 장(정사각 sizePx × pixelRatio, 투명 배경 PNG data URL). 같은 그리기(가까운 단계 모델)로 조금 옆에서 본 모습이다.
 * 작은 렌더러 하나를 만들어 차례로 그리고 버린다. WebGL을 쓸 수 없으면 던진다
 */
export function renderCharacterThumbnails(
  looks: readonly CharacterLook[],
  sizePx: number,
  pixelRatio = 1,
): string[] {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  const stage = new CharacterStage(false);
  try {
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)));
    renderer.setSize(sizePx, sizePx, false);
    stage.camera.aspect = 1;
    stage.camera.updateProjectionMatrix();
    return looks.map((look) => {
      stage.set(look, 0);
      stage.pose({ swing: 0, bob: 0 }, DEFAULT_YAW, 0.12, 0.98);
      renderer.render(stage.scene, stage.camera);
      // 그린 바로 뒤(같은 작업 안)에 읽는다 — 그리기 버퍼를 남겨 두지 않아도 된다
      return canvas.toDataURL("image/png");
    });
  } finally {
    stage.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
