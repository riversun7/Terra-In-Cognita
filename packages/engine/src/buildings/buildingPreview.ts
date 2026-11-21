// 건물 하나 미리 보기(건물 편집기 "2차맵 모습" — docs/adr/2026-11-08-building-art.md "바뀜 (2026-11-09)").
// 2차맵과 같은 그리기(BuildingView: 시설 종류별 로우폴리 조각, 도형별 InstancedMesh)와 같은 고정 낮 빛(FIXED_SECOND_MAP_LIGHT)으로
// 바닥 칸(배치 칸 가로 × 세로) 위에 건물 하나를 세운다. 평평한 땅, 칸 금, 앞면(문 쪽) 표시.
// - 돌려 보기: 끌기(포인터) = 돌림·기울임, 휠·두 손가락 = 가까이·멀리, 키는 화면이 rotate·zoom을 부른다. 바뀔 때만 그린다(프레임 고리 없음).
// - 따로 진입점(@terra/engine/buildingPreview)이라 개발자 도구 조각만 가져온다(첫 화면·지도 묶음과 상관없다).
import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from "three";
import { FIXED_SECOND_MAP_LIGHT } from "../lighting/secondMapLight.ts";
import { type BuildingLook, resolveLook } from "./buildingLook.ts";
import { buildingModel } from "./buildingModels.ts";
import { BuildingView } from "./buildingView.ts";

/** 배치 칸 한 변(m, 2차맵 기본 약 5.86m — 행성마다 조금 다르다) */
export const PREVIEW_CELL_M = 5.86;

export interface BuildingPreviewInput {
  /** 바닥 칸(배치 칸): 돌리기 전 가로·세로 */
  readonly widthCells: number;
  readonly depthCells: number;
  /** 겉모습(시설 ID·레벨·상태·국가 색·겉모습 자료) */
  readonly look: BuildingLook;
  /** 씨앗(좌우 뒤집기·지붕 색 고르기). 없으면 1 */
  readonly seed?: number | undefined;
}

export interface BuildingPreviewStats {
  /** 조각 수(바닥 판 포함) */
  readonly parts: number;
  /** 바닥 판 크기(m) */
  readonly widthM: number;
  readonly depthM: number;
  /** 가장 높은 조각 꼭대기(m, 바닥에서) */
  readonly heightM: number;
}

const MIN_PITCH = 0.12;
const MAX_PITCH = 1.45;
const DEFAULT_YAW = -0.7;
const DEFAULT_PITCH = 0.55;
/** 땅(풀) 색·칸 금 색(세계 색, 테마와 상관없다) */
const GROUND_COLOR = new Color().setRGB(0.56, 0.66, 0.44, SRGBColorSpace);
const GRID_COLOR = new Color().setRGB(0.32, 0.38, 0.26, SRGBColorSpace);
const FRONT_COLOR = new Color().setRGB(0.95, 0.85, 0.3, SRGBColorSpace);

export class BuildingPreview {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(35, 1, 0.5, 2000);
  private readonly view = new BuildingView();
  private readonly hemisphere = new HemisphereLight();
  private readonly sun = new DirectionalLight();
  private readonly ambient = new AmbientLight(0xffffff, 0);
  private readonly ground: Mesh;
  private readonly gridMaterial = new LineBasicMaterial({ color: GRID_COLOR });
  private readonly frontMaterial = new LineBasicMaterial({ color: FRONT_COLOR });
  private grid: LineSegments | null = null;
  private front: LineSegments | null = null;
  private readonly canvas: HTMLCanvasElement;
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private zoomK = 1;
  private radius = 40;
  private targetY = 3;
  private frame = 0;
  private night = 0;
  private lastStats: BuildingPreviewStats = { parts: 0, widthM: 0, depthM: 0, heightM: 0 };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private readonly cleanup: (() => void)[] = [];
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    const light = FIXED_SECOND_MAP_LIGHT;
    this.scene.background = new Color().setRGB(...light.background);
    this.ground = new Mesh(new PlaneGeometry(1, 1), new MeshLambertMaterial({ color: GROUND_COLOR }));
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.hemisphere, this.sun, this.ambient, this.ground, this.view.group);
    this.applyLight();
    this.listen();
  }

  /** 건물을 바꾼다(바닥 크기·겉모습). 바뀐 모양의 크기를 돌려준다 */
  set(input: BuildingPreviewInput): BuildingPreviewStats {
    const w = Math.max(1, Math.round(input.widthCells));
    const d = Math.max(1, Math.round(input.depthCells));
    const widthM = w * PREVIEW_CELL_M;
    const depthM = d * PREVIEW_CELL_M;
    const seed = input.seed ?? 1;
    this.view.set(
      [{ id: seed, cellX: 0, cellY: 0, width: w, depth: d, rotation: 0, heightM: 0, look: input.look }],
      PREVIEW_CELL_M,
      () => 0,
    );
    // 판 가운데를 원점에(BuildingView는 칸 0,0이 세계 원점)
    this.view.group.position.set(-widthM / 2, 0, -depthM / 2);
    // 크기 셈(같은 입력이면 같은 조각 — 그리기와 따로 한 번 더 만든다, 조각 수백 개라 싸다)
    const look = resolveLook(input.look);
    const parts = buildingModel({
      kind: look.kind,
      widthM,
      depthM,
      level: look.level,
      state: look.state,
      upgrading: look.upgrading,
      accent: look.accent,
      accentColor: look.accentColor,
      emblem: look.emblem,
      seed,
      wall: look.wall,
      roof: look.roof,
      heightPm: look.heightPm,
    });
    const heightM = parts.reduce((top, part) => Math.max(top, part.y + part.sy), 0);
    this.lastStats = { parts: parts.length, widthM, depthM, heightM };
    this.layoutGround(w, d);
    this.radius = Math.max(widthM, depthM, heightM) * 2.1 + 8;
    this.targetY = Math.min(heightM * 0.35, 8);
    this.redraw();
    return this.lastStats;
  }

  stats(): BuildingPreviewStats {
    return this.lastStats;
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
    this.zoomK = Math.min(3, Math.max(0.35, this.zoomK * factor));
    this.redraw();
  }

  /** 처음 보던 각도·거리로 */
  reset(): void {
    this.yaw = DEFAULT_YAW;
    this.pitch = DEFAULT_PITCH;
    this.zoomK = 1;
    this.redraw();
  }

  /** 밤 정도(0 = 낮, 1 = 밤): 창문 불빛·건물 밤 빛을 본다 */
  setNight(amount: number): void {
    this.night = Math.min(1, Math.max(0, amount));
    this.applyLight();
    this.redraw();
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    for (const off of this.cleanup) off();
    this.view.dispose();
    this.grid?.geometry.dispose();
    this.front?.geometry.dispose();
    this.gridMaterial.dispose();
    this.frontMaterial.dispose();
    this.ground.geometry.dispose();
    if (this.ground.material instanceof MeshLambertMaterial) this.ground.material.dispose();
    this.hemisphere.dispose();
    this.sun.dispose();
    this.ambient.dispose();
    this.renderer.dispose();
  }

  private applyLight(): void {
    const light = FIXED_SECOND_MAP_LIGHT;
    const day = 1 - this.night;
    this.hemisphere.color.setRGB(...light.hemisphereSky);
    this.hemisphere.groundColor.setRGB(...light.hemisphereGround);
    this.hemisphere.intensity = light.hemisphereIntensity * (0.35 + 0.65 * day);
    this.sun.color.setRGB(...light.directColor);
    this.sun.intensity = light.directIntensity * day;
    this.sun.position.set(...light.direction);
    // 밤에는 달빛 대신 약한 푸른 빛
    this.ambient.color.setRGB(0.35, 0.42, 0.62);
    this.ambient.intensity = 0.4 * this.night;
    const bg = light.background;
    const k = 0.25 + 0.75 * day;
    if (this.scene.background instanceof Color) this.scene.background.setRGB(bg[0] * k, bg[1] * k, bg[2] * k);
    this.view.setNight(this.night);
  }

  /** 땅 판(판 둘레로 넉넉히)·칸 금·앞면 표시 */
  private layoutGround(w: number, d: number): void {
    const cell = PREVIEW_CELL_M;
    const span = (Math.max(w, d) + 6) * cell;
    this.ground.scale.set(span, span, 1);
    this.ground.position.y = -0.02;
    const points: number[] = [];
    const x0 = (-w * cell) / 2;
    const z0 = (-d * cell) / 2;
    const y = 0.03;
    for (let i = 0; i <= w; i++) points.push(x0 + i * cell, y, z0, x0 + i * cell, y, -z0);
    for (let j = 0; j <= d; j++) points.push(x0, y, z0 + j * cell, -x0, y, z0 + j * cell);
    this.grid?.geometry.dispose();
    if (this.grid) this.scene.remove(this.grid);
    const gridGeometry = new BufferGeometry();
    gridGeometry.setAttribute("position", new Float32BufferAttribute(points, 3));
    this.grid = new LineSegments(gridGeometry, this.gridMaterial);
    this.scene.add(this.grid);
    // 앞면(+z, 문 쪽): 판 앞 가장자리 밖에 화살표
    const fz = -z0 + cell * 0.35;
    const a = Math.min(cell * 0.5, (w * cell) / 4);
    // 선분 셋(x, z 짝): 가로 막대, 왼쪽 빗금, 오른쪽 빗금
    const tip = fz + a * 0.6;
    const ends: readonly (readonly [number, number])[] = [
      [-a, fz],
      [a, fz],
      [-a * 0.5, fz],
      [0, tip],
      [a * 0.5, fz],
      [0, tip],
    ];
    const front = ends.flatMap(([x, z]) => [x, y, z]);
    this.front?.geometry.dispose();
    if (this.front) this.scene.remove(this.front);
    const frontGeometry = new BufferGeometry();
    frontGeometry.setAttribute("position", new Float32BufferAttribute(front, 3));
    this.front = new LineSegments(frontGeometry, this.frontMaterial);
    this.scene.add(this.front);
  }

  private redraw(): void {
    if (this.disposed || this.frame !== 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const r = this.radius * this.zoomK;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      Math.sin(this.yaw) * cp * r,
      this.targetY + Math.sin(this.pitch) * r,
      Math.cos(this.yaw) * cp * r,
    );
    this.camera.lookAt(0, this.targetY, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** 끌기·휠·두 손가락(캔버스에만) */
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
      if (this.pointers.size >= 2) {
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const next = this.pinchDistance();
        if (this.pinch > 0 && next > 0) this.zoom(this.pinch / next);
        this.pinch = next;
        return;
      }
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.rotate(-dx * 0.01, dy * 0.008);
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
  }

  private pinchDistance(): number {
    const list = [...this.pointers.values()];
    const a = list[0];
    const b = list[1];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
