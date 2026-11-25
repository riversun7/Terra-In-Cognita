// 게임형 3D 캐릭터 스튜디오 뷰어(V2) — PBR 환경 반사 + 3점 시네마틱 조명 + 홀로그램 턴테이블 + 실시간 V1(기존 로우폴리) 비교.
// 개발자 시안 모음(/dev/mockups?tab=character)에서 테스트하고, 확정되면 캐릭터 생성 화면을 이 엔진으로 대체할 수 있게 독립 설계한다.
import type { CharacterLook } from "@terra/shared/characterLook";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FIXED_SECOND_MAP_LIGHT } from "../../lighting/secondMapLight.ts";
import { REST_POSE, compileCharacter } from "../characterCompile.ts";
import { CharacterMeshes } from "../characterMeshes.ts";
import { characterModel } from "../characterModel.ts";
import { type HeroPoseId, type HeroRig, buildHeroRig } from "./heroRig.ts";

export type StudioLighting = "studio" | "day" | "night";
export type StudioCameraPreset = "full" | "upper" | "head" | "back";
export type StudioModelMode = "hero" | "legacy";

export interface CharacterStudioStats {
  readonly mode: StudioModelMode;
  readonly parts: number;
  readonly triangles: number;
  readonly heightM: number;
  readonly frames: number;
}

const CAMERA_TARGETS: Readonly<
  Record<
    StudioCameraPreset,
    { readonly yaw: number; readonly pitch: number; readonly zoom: number; readonly targetK: number }
  >
> = {
  full: { yaw: 0.36, pitch: 0.14, zoom: 1.0, targetK: 0.51 },
  upper: { yaw: 0.28, pitch: 0.1, zoom: 0.64, targetK: 0.68 },
  head: { yaw: 0.18, pitch: 0.06, zoom: 0.38, targetK: 0.84 },
  back: { yaw: Math.PI - 0.34, pitch: 0.16, zoom: 0.96, targetK: 0.56 },
};

const MIN_PITCH = -0.22;
const MAX_PITCH = 1.15;
const MIN_ZOOM = 0.32;
const MAX_ZOOM = 2.1;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export class CharacterStudio {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 100);
  private readonly pmrem: PMREMGenerator;
  private readonly envRT: ReturnType<PMREMGenerator["fromScene"]>;

  // 조명(키·림·필·반구·환경)
  private readonly hemi = new HemisphereLight(0x88b4e8, 0x162032, 0.9);
  private readonly keyLight = new DirectionalLight(0xfff4e6, 2.2);
  private readonly rimLight = new DirectionalLight(0x38e8d6, 1.8);
  private readonly fillLight = new DirectionalLight(0x7ca2ff, 0.8);
  private readonly ambient = new AmbientLight(0x1f2b42, 0.35);

  // 홀로그램 스튜디오 받침대
  private readonly pedestal = new Group();
  private readonly holoRing: Mesh;
  private readonly outerRing: Mesh;
  private readonly pedestalDisposables: (() => void)[] = [];

  // 캐릭터 두 모드(신규 V2 + 기존 V1 로우폴리 비교용)
  private heroRig: HeroRig | null = null;
  private readonly legacyMeshes = new CharacterMeshes();
  private legacyCompiled: ReturnType<typeof compileCharacter> | null = null;
  private currentLook: CharacterLook | null = null;
  private mode: StudioModelMode = "hero";

  // 카메라·애니메이션 상태
  private yaw = CAMERA_TARGETS.full.yaw;
  private pitch = CAMERA_TARGETS.full.pitch;
  private zoom = CAMERA_TARGETS.full.zoom;
  private targetK = CAMERA_TARGETS.full.targetK;
  private goalYaw = CAMERA_TARGETS.full.yaw;
  private goalPitch = CAMERA_TARGETS.full.pitch;
  private goalZoom = CAMERA_TARGETS.full.zoom;
  private goalTargetK = CAMERA_TARGETS.full.targetK;
  private pose: HeroPoseId = "idle";
  private lighting: StudioLighting = "studio";
  private turntable = false;
  private animate = true;

  private clock = 0;
  private lastTime = 0;
  private frame = 0;
  private frames = 0;
  private disposed = false;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    // 프로시저럴 스튜디오 환경 반사(금속·바이저 하이라이트)
    this.pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envRT = this.pmrem.fromScene(room, 0.04);
    room.dispose();
    this.scene.environment = this.envRT.texture;

    // 키 라이트 그림자 설정
    this.keyLight.position.set(1.8, 3.4, 2.4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 10;
    this.keyLight.shadow.camera.left = -1.6;
    this.keyLight.shadow.camera.right = 1.6;
    this.keyLight.shadow.camera.top = 2.4;
    this.keyLight.shadow.camera.bottom = -0.8;
    this.keyLight.shadow.bias = -0.0005;

    this.rimLight.position.set(-2.2, 2.4, -2.0);
    this.fillLight.position.set(-1.6, 1.4, 1.8);

    // SF 홀로그램 턴테이블 받침대
    const baseGeo = new CylinderGeometry(0.78, 0.88, 0.08, 36);
    const baseMat = new MeshStandardMaterial({ color: 0x101928, roughness: 0.34, metalness: 0.78 });
    const baseMesh = new Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.045;
    baseMesh.receiveShadow = true;

    const deckGeo = new CircleGeometry(0.72, 36);
    const deckMat = new MeshStandardMaterial({ color: 0x162336, roughness: 0.42, metalness: 0.55 });
    const deckMesh = new Mesh(deckGeo, deckMat);
    deckMesh.rotation.x = -Math.PI / 2;
    deckMesh.position.y = -0.003;
    deckMesh.receiveShadow = true;

    const holoGeo = new RingGeometry(0.68, 0.72, 48);
    const holoMat = new MeshBasicMaterial({ color: 0x26e0b8, transparent: true, opacity: 0.72 });
    this.holoRing = new Mesh(holoGeo, holoMat);
    this.holoRing.rotation.x = -Math.PI / 2;
    this.holoRing.position.y = 0.001;

    const outerGeo = new RingGeometry(0.84, 0.86, 48, 1, 0, Math.PI * 1.45);
    const outerMat = new MeshBasicMaterial({ color: 0x52b6ff, transparent: true, opacity: 0.42 });
    this.outerRing = new Mesh(outerGeo, outerMat);
    this.outerRing.rotation.x = -Math.PI / 2;
    this.outerRing.position.y = -0.002;

    this.pedestal.add(baseMesh, deckMesh, this.holoRing, this.outerRing);
    this.pedestalDisposables.push(() => {
      baseGeo.dispose();
      baseMat.dispose();
      deckGeo.dispose();
      deckMat.dispose();
      holoGeo.dispose();
      holoMat.dispose();
      outerGeo.dispose();
      outerMat.dispose();
    });

    this.legacyMeshes.group.visible = false;
    this.scene.add(
      this.hemi,
      this.keyLight,
      this.rimLight,
      this.fillLight,
      this.ambient,
      this.pedestal,
      this.legacyMeshes.group,
    );

    this.applyLighting();
    this.listen();
  }

  setLook(look: CharacterLook): CharacterStudioStats {
    this.currentLook = look;
    if (this.heroRig) {
      this.scene.remove(this.heroRig.root);
      this.heroRig.dispose();
      this.heroRig = null;
    }
    this.heroRig = buildHeroRig(look);
    this.heroRig.root.visible = this.mode === "hero";
    this.scene.add(this.heroRig.root);

    this.legacyCompiled = compileCharacter(characterModel(look, 0));
    this.legacyMeshes.group.visible = this.mode === "legacy";
    this.redraw();
    return this.stats();
  }

  setMode(mode: StudioModelMode): CharacterStudioStats {
    this.mode = mode;
    if (this.heroRig) this.heroRig.root.visible = mode === "hero";
    this.legacyMeshes.group.visible = mode === "legacy";
    this.redraw();
    return this.stats();
  }

  setPose(pose: HeroPoseId): void {
    this.pose = pose;
    this.redraw();
  }

  setLighting(lighting: StudioLighting): void {
    this.lighting = lighting;
    this.applyLighting();
    this.redraw();
  }

  setTurntable(on: boolean): void {
    this.turntable = on;
    this.lastTime = 0;
    this.redraw();
  }

  setAnimate(on: boolean): void {
    this.animate = on;
    this.lastTime = 0;
    this.redraw();
  }

  focusCamera(preset: StudioCameraPreset): void {
    const target = CAMERA_TARGETS[preset];
    this.goalYaw = target.yaw;
    this.goalPitch = target.pitch;
    this.goalZoom = target.zoom;
    this.goalTargetK = target.targetK;
    this.redraw();
  }

  rotate(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.goalYaw = this.yaw;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dPitch));
    this.goalPitch = this.pitch;
    this.redraw();
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.goalZoom = this.zoom;
    this.redraw();
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.redraw();
  }

  stats(): CharacterStudioStats {
    if (this.mode === "legacy") {
      return {
        mode: "legacy",
        parts: this.legacyCompiled?.count ?? 0,
        triangles: this.legacyCompiled?.triangles ?? 0,
        heightM: this.legacyCompiled?.heightM ?? 0,
        frames: this.frames,
      };
    }
    return {
      mode: "hero",
      parts: this.heroRig?.partCount ?? 0,
      triangles: this.heroRig?.triangleCount ?? 0,
      heightM: this.heroRig?.heightM ?? 0,
      frames: this.frames,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    for (const off of this.cleanup) off();
    if (this.heroRig) {
      this.scene.remove(this.heroRig.root);
      this.heroRig.dispose();
      this.heroRig = null;
    }
    this.legacyMeshes.dispose();
    for (const off of this.pedestalDisposables) off();
    this.envRT.dispose();
    this.pmrem.dispose();
    this.hemi.dispose();
    this.keyLight.dispose();
    this.rimLight.dispose();
    this.fillLight.dispose();
    this.ambient.dispose();
    this.renderer.dispose();
  }

  private applyLighting(): void {
    if (this.lighting === "studio") {
      this.scene.background = new Color(0x09111c);
      this.hemi.color.setHex(0xa8caff);
      this.hemi.groundColor.setHex(0x132033);
      this.hemi.intensity = 0.85;
      this.keyLight.color.setHex(0xfff4e8);
      this.keyLight.intensity = 2.25;
      this.rimLight.color.setHex(0x2ce8c8);
      this.rimLight.intensity = 2.1;
      this.fillLight.color.setHex(0x7ca2ff);
      this.fillLight.intensity = 0.78;
      this.ambient.intensity = 0.25;
      this.legacyMeshes.setNightLift(0.05);
      this.holoRing.visible = true;
      this.outerRing.visible = true;
      return;
    }
    if (this.lighting === "day") {
      const light = FIXED_SECOND_MAP_LIGHT;
      this.scene.background = new Color().setRGB(...light.background);
      this.hemi.color.setRGB(...light.hemisphereSky);
      this.hemi.groundColor.setRGB(...light.hemisphereGround);
      this.hemi.intensity = light.hemisphereIntensity * 1.1;
      this.keyLight.color.setRGB(...light.directColor);
      this.keyLight.intensity = light.directIntensity * 1.35;
      this.rimLight.color.setHex(0x9be2ff);
      this.rimLight.intensity = 0.75;
      this.fillLight.color.setHex(0xdce8ff);
      this.fillLight.intensity = 0.45;
      this.ambient.intensity = 0.2;
      this.legacyMeshes.setNightLift(0);
      this.holoRing.visible = true;
      this.outerRing.visible = false;
      return;
    }
    // night
    this.scene.background = new Color(0x060b14);
    this.hemi.color.setHex(0x3a5a8c);
    this.hemi.groundColor.setHex(0x09101b);
    this.hemi.intensity = 0.45;
    this.keyLight.color.setHex(0x9dc0ff);
    this.keyLight.intensity = 0.72;
    this.rimLight.color.setHex(0x30f0d0);
    this.rimLight.intensity = 2.2;
    this.fillLight.color.setHex(0x4f74c9);
    this.fillLight.intensity = 0.4;
    this.ambient.intensity = 0.35;
    this.legacyMeshes.setNightLift(0.32);
    this.holoRing.visible = true;
    this.outerRing.visible = true;
  }

  private redraw(): void {
    if (this.disposed || this.frame !== 0) return;
    this.frame = requestAnimationFrame((time) => {
      this.frame = 0;
      this.draw(time);
    });
  }

  private draw(time: number): void {
    const delta = this.lastTime === 0 ? 0 : Math.min(80, time - this.lastTime) / 1000;
    this.lastTime = time;
    if (this.animate) this.clock += delta;

    if (this.turntable) {
      this.yaw += 0.62 * delta;
      this.goalYaw = this.yaw;
    } else {
      const k = Math.min(1, delta * 9);
      if (k > 0) {
        this.yaw += shortestAngle(this.yaw, this.goalYaw) * k;
        this.pitch += (this.goalPitch - this.pitch) * k;
        this.zoom += (this.goalZoom - this.zoom) * k;
        this.targetK += (this.goalTargetK - this.targetK) * k;
      }
    }

    // 홀로그램 링 회전
    this.outerRing.rotation.z = this.clock * 0.45;

    if (this.mode === "hero" && this.heroRig) {
      this.heroRig.applyPose(this.pose, this.clock);
    } else if (this.mode === "legacy" && this.legacyCompiled) {
      const swing = this.pose === "walk" ? Math.sin(this.clock * 8) * 0.6 : 0;
      const bob =
        this.pose === "walk"
          ? Math.abs(Math.sin(this.clock * 8)) * 0.035
          : (Math.sin(this.clock * 2.4) + 1) * 0.012;
      this.legacyMeshes.begin();
      this.legacyMeshes.add(this.legacyCompiled, IDENTITY, { swing, bob, chop: 0 });
      this.legacyMeshes.end();
    }

    const height =
      this.mode === "hero" ? (this.heroRig?.heightM ?? 1.82) : (this.legacyCompiled?.heightM ?? 1.8);
    const targetY = height * this.targetK;
    const fit = (height * 0.64) / Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    const r = fit * this.zoom;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      Math.sin(this.yaw) * cp * r,
      targetY + Math.sin(this.pitch) * r,
      Math.cos(this.yaw) * cp * r,
    );
    this.camera.lookAt(0, targetY, 0);

    this.renderer.render(this.scene, this.camera);
    this.frames += 1;

    const settling =
      Math.abs(shortestAngle(this.yaw, this.goalYaw)) > 0.002 ||
      Math.abs(this.pitch - this.goalPitch) > 0.002 ||
      Math.abs(this.zoom - this.goalZoom) > 0.002 ||
      Math.abs(this.targetK - this.goalTargetK) > 0.002;

    if ((this.animate || this.turntable || settling) && document.visibilityState === "visible") {
      this.redraw();
    } else {
      this.lastTime = 0;
    }
  }

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
        if (this.pinch > 0 && next > 0) this.zoomBy(this.pinch / next);
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
        this.zoomBy(event.deltaY > 0 ? 1.09 : 1 / 1.09);
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

  /** 현재 외형 확인(디버그·비교용) */
  get look(): CharacterLook | null {
    return this.currentLook;
  }
}

function shortestAngle(from: number, to: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** 신규 V2 게임형 캐릭터 프리셋 썸네일 일괄 렌더링(투명 PNG data URL) */
export function renderHeroThumbnails(
  looks: readonly CharacterLook[],
  sizePx: number,
  pixelRatio = 1,
): string[] {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  room.dispose();
  const hemi = new HemisphereLight(0xa8caff, 0x162032, 0.9);
  const key = new DirectionalLight(0xfff4e8, 2.1);
  key.position.set(1.6, 3.0, 2.2);
  const rim = new DirectionalLight(0x2ce8c8, 1.9);
  rim.position.set(-2.0, 2.2, -1.8);
  scene.environment = envRT.texture;
  scene.add(hemi, key, rim);

  try {
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)));
    renderer.setSize(sizePx, sizePx, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();

    return looks.map((look) => {
      const rig = buildHeroRig(look);
      rig.applyPose("idle", 0);
      scene.add(rig.root);
      const targetY = rig.heightM * 0.56;
      const fit = (rig.heightM * 0.58) / Math.tan(((camera.fov / 2) * Math.PI) / 180);
      const yaw = 0.34;
      const pitch = 0.1;
      const cp = Math.cos(pitch);
      camera.position.set(
        Math.sin(yaw) * cp * fit,
        targetY + Math.sin(pitch) * fit,
        Math.cos(yaw) * cp * fit,
      );
      camera.lookAt(0, targetY, 0);
      renderer.render(scene, camera);
      const url = canvas.toDataURL("image/png");
      scene.remove(rig.root);
      rig.dispose();
      return url;
    });
  } finally {
    envRT.dispose();
    pmrem.dispose();
    hemi.dispose();
    key.dispose();
    rim.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

export { REST_POSE };
