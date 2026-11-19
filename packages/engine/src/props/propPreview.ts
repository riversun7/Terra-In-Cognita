// 지형 오브젝트 3D 로우폴리 미리 보기(PropPreview)와 표 썸네일 렌더러(PropThumbnailRenderer) — 개발자 2차맵·지형 오브젝트 통합 화면용.
// - 2차맵 엔진과 같은 부품 기하(propParts.ts: stem·cone·blade·rock·blob·chip)와 조형 규칙(buildShape·buildKit), 같은 고정 낮 빛(FIXED_SECOND_MAP_LIGHT)을 쓴다.
// - 어군(fish_school·fish_school_big·whale_pod)은 schoolView.ts와 같은 늘인 팔면체 무리로 그린다.
// - 따로 진입점(@terra/engine/propPreview)이라 개발자 도구 조각만 가져온다(첫 화면·지도 미리 캐시와 무관).
import { mapPropArtCode } from "@terra/shared";
import {
  Box3,
  BufferGeometry,
  Color,
  ColorManagement,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { FIXED_SECOND_MAP_LIGHT } from "../lighting/secondMapLight.ts";
import { propLook } from "./propLook.ts";
import { PARTS, type Part, type ShapeContext, buildShape, partGeometry } from "./propParts.ts";

ColorManagement.enabled = false;

/** 2차맵 배치 칸 한 변(m, 기준 눈금) */
export const PROP_PREVIEW_CELL_M = 5.86;

/** 부품 종류(일반 소품 6종 + 움직이는 어군 몸체) */
export type PreviewPartKind = Part | "fish";

export type PropGroundKind = "grass" | "sand" | "snow" | "rock" | "water" | "swamp";

export interface PropPreviewPart {
  readonly part: PreviewPartKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly yaw: number;
  readonly tilt: number;
  readonly color: readonly [number, number, number];
}

export interface PropPreviewStats {
  readonly parts: number;
  readonly triangles: number;
  readonly widthM: number;
  readonly depthM: number;
  readonly heightM: number;
  readonly float: boolean;
}

export interface PropPreviewBuild {
  readonly parts: readonly PropPreviewPart[];
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly stats: PropPreviewStats;
  readonly isWater: boolean;
}

export interface PropPreviewInput {
  /** 그림 이름(@terra/shared MAP_PROP_ARTS) */
  readonly art: string;
  /** 변형 씨앗(0 이상의 정수). 없으면 0 */
  readonly seed?: number | undefined;
  /** 눈·얼음 지표 효과 */
  readonly snowy?: boolean | undefined;
  /** 바탕 땅 색 종류(없으면 그림·물 여부로 자동 고름) */
  readonly ground?: PropGroundKind | undefined;
}

/** 어군 겉모습(schoolView.ts LOOKS와 같은 규격) */
const SCHOOL_SPECS: Readonly<
  Record<
    string,
    {
      readonly count: number;
      readonly lengthM: number;
      readonly radiusM: number;
      readonly color: readonly [number, number, number];
    }
  >
> = {
  fish_school: { count: 9, lengthM: 0.7, radiusM: 2.2, color: [0.62, 0.7, 0.78] },
  fish_school_big: { count: 12, lengthM: 1.4, radiusM: 4, color: [0.42, 0.5, 0.62] },
  whale_pod: { count: 3, lengthM: 9, radiusM: 9, color: [0.26, 0.3, 0.36] },
};

/** 부품별 삼각형 수(지형 소품 예산 계산과 같은 기준) */
const PART_TRIANGLES: Readonly<Record<PreviewPartKind, number>> = {
  stem: 20,
  cone: 12,
  blade: 3,
  rock: 36,
  blob: 20,
  chip: 8,
  fish: 8,
};

/** 부품별 로컬 경계 상자(기하 원점·크기 기준) */
const PART_LOCAL_BOUNDS: Readonly<
  Record<PreviewPartKind, readonly [number, number, number, number, number, number]>
> = {
  stem: [-1, 0, -1, 1, 1, 1],
  cone: [-1, 0, -1, 1, 1, 1],
  blade: [-1, 0, -1, 1, 1, 1],
  rock: [-1, -1, -1, 1, 1, 1],
  blob: [-1, -1, -1, 1, 1, 1],
  chip: [-1, -1, -1, 1, 1, 1],
  fish: [-0.5, -0.16, -0.13, 0.5, 0.16, 0.13],
};

/** 바탕 종류별 땅·격자 색(선형 색 공간, 2차맵 지표 색감과 맞춤) */
const GROUND_PALETTE: Readonly<
  Record<
    PropGroundKind,
    { readonly ground: readonly [number, number, number]; readonly grid: readonly [number, number, number] }
  >
> = {
  grass: { ground: [0.46, 0.58, 0.36], grid: [0.3, 0.4, 0.24] },
  sand: { ground: [0.76, 0.68, 0.48], grid: [0.54, 0.46, 0.32] },
  snow: { ground: [0.84, 0.89, 0.94], grid: [0.58, 0.66, 0.74] },
  rock: { ground: [0.52, 0.5, 0.48], grid: [0.36, 0.35, 0.34] },
  water: { ground: [0.18, 0.42, 0.64], grid: [0.34, 0.58, 0.78] },
  swamp: { ground: [0.34, 0.44, 0.32], grid: [0.22, 0.3, 0.22] },
};

const UP = new Vector3(0, 1, 0);
const SIDE = new Vector3(0, 0, 1);

/** 바이옴·그림 이름으로 어울리는 바탕 종류를 고른다 */
export function defaultGroundForArt(art: string, biomeId?: string | null): PropGroundKind {
  const code = mapPropArtCode(art);
  const look = code > 0 ? propLook(code) : undefined;
  if (look?.float || art in SCHOOL_SPECS) return "water";
  switch (biomeId) {
    case "ocean_deep":
    case "ocean_shelf":
    case "ocean_coastal":
    case "lake":
      return "water";
    case "ice_sheet":
    case "tundra":
      return "snow";
    case "desert":
    case "savanna":
      return "sand";
    case "alpine":
      return "rock";
    case "wetland":
      return "swamp";
    default:
      return "grass";
  }
}

/** 변형 씨앗용 결정적 해시(0~1) */
function previewRandom(seed: number, k: number): number {
  let h = Math.imul((seed + 1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 17, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4_294_967_296;
}

/** 그림 이름 → 부품 목록·경계 상자·통계(WebGL 없이 실행 가능, 시험 대상) */
export function collectPropParts(
  art: string,
  options?: { readonly seed?: number | undefined; readonly snowy?: boolean | undefined },
): PropPreviewBuild {
  const seed = options?.seed ?? 0;
  const snowy = options?.snowy ?? false;
  const parts: PropPreviewPart[] = [];
  const school = SCHOOL_SPECS[art];
  let isWater = false;

  if (school) {
    isWater = true;
    const baseAngle = seed * 0.85;
    for (let k = 0; k < school.count; k++) {
      const phase = (k * Math.PI * 2) / school.count + baseAngle;
      const ring = school.radiusM * (0.35 + 0.65 * (((k * 7) % school.count) / school.count));
      const fx = Math.cos(phase) * ring;
      const fz = Math.sin(phase) * ring;
      const s = school.lengthM * (0.8 + 0.4 * (((k * 5) % school.count) / school.count));
      parts.push({
        part: "fish",
        x: fx,
        y: school.lengthM * 0.14,
        z: fz,
        sx: s,
        sy: s,
        sz: s,
        yaw: -phase + Math.PI / 2,
        tilt: 0,
        color: school.color,
      });
    }
  } else {
    const code = mapPropArtCode(art);
    const look = code > 0 ? propLook(code) : undefined;
    if (look) {
      isWater = look.float === true;
      const ctx: ShapeContext = {
        x: 0,
        y: 0,
        z: 0,
        size: 1,
        turn: 0.45 + seed * 0.7,
        shade: 1,
        snowy,
        r: (k) => previewRandom(seed, k),
        ground: () => 0,
      };
      buildShape(
        (part, x, y, z, sx, sy, sz, yaw, tilt, color) => {
          parts.push({
            part,
            x,
            y,
            z,
            sx,
            sy,
            sz,
            yaw,
            tilt,
            color: [color.r, color.g, color.b],
          });
        },
        look,
        ctx,
      );
    }
  }

  const box = new Box3();
  const matrix = new Matrix4();
  const pos = new Vector3();
  const rot = new Quaternion();
  const tiltQ = new Quaternion();
  const scale = new Vector3();
  const corner = new Vector3();
  let triangles = 0;

  for (const item of parts) {
    triangles += PART_TRIANGLES[item.part];
    rot.setFromAxisAngle(UP, item.yaw);
    if (item.tilt !== 0) rot.multiply(tiltQ.setFromAxisAngle(SIDE, item.tilt));
    pos.set(item.x, item.y, item.z);
    scale.set(item.sx, item.sy, item.sz);
    matrix.compose(pos, rot, scale);
    const [lx0, ly0, lz0, lx1, ly1, lz1] = PART_LOCAL_BOUNDS[item.part];
    for (const cx of [lx0, lx1]) {
      for (const cy of [ly0, ly1]) {
        for (const cz of [lz0, lz1]) {
          corner.set(cx, cy, cz).applyMatrix4(matrix);
          box.expandByPoint(corner);
        }
      }
    }
  }

  if (box.isEmpty()) {
    box.min.set(-0.5, 0, -0.5);
    box.max.set(0.5, 1, 0.5);
  }
  const widthM = Math.max(0.1, box.max.x - box.min.x);
  const depthM = Math.max(0.1, box.max.z - box.min.z);
  const heightM = Math.max(0.05, box.max.y - Math.min(0, box.min.y));

  return {
    parts,
    bounds: {
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z,
      maxZ: box.max.z,
    },
    stats: { parts: parts.length, triangles, widthM, depthM, heightM, float: isWater },
    isWater,
  };
}

/** 공유 부품 기하 7종(일반 소품 6 + 어군 몸체 1) 생성 */
function createPartGeometries(): Map<PreviewPartKind, BufferGeometry> {
  const map = new Map<PreviewPartKind, BufferGeometry>();
  for (const part of PARTS) map.set(part, partGeometry(part));
  map.set("fish", new OctahedronGeometry(0.5, 0).scale(1, 0.32, 0.26));
  return map;
}

/** 부품 목록 → Three.js Group 채우기(기존 자식 재질만 정리, 기하는 공유 유지) */
function populateGroup(
  group: Group,
  parts: readonly PropPreviewPart[],
  geometries: ReadonlyMap<PreviewPartKind, BufferGeometry>,
): void {
  clearGroup(group);
  const rot = new Quaternion();
  const tiltQ = new Quaternion();
  for (const item of parts) {
    const geometry = geometries.get(item.part);
    if (!geometry) continue;
    const material = new MeshLambertMaterial({
      color: new Color(item.color[0], item.color[1], item.color[2]),
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(item.x, item.y, item.z);
    rot.setFromAxisAngle(UP, item.yaw);
    if (item.tilt !== 0) rot.multiply(tiltQ.setFromAxisAngle(SIDE, item.tilt));
    mesh.quaternion.copy(rot);
    mesh.scale.set(item.sx, item.sy, item.sz);
    group.add(mesh);
  }
}

function clearGroup(group: Group): void {
  while (group.children.length > 0) {
    const child = group.children.at(-1);
    if (!child) break;
    if (child instanceof Mesh && child.material instanceof MeshLambertMaterial) child.material.dispose();
    group.remove(child);
  }
}

/** 경계 상자 중심과 맞춤 카메라 거리 계산 */
function frameCamera(
  bounds: PropPreviewBuild["bounds"],
  fovDeg: number,
): {
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
} {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = Math.max(0.05, (Math.max(0, bounds.minY) + bounds.maxY) / 2);
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const halfX = (bounds.maxX - bounds.minX) / 2;
  const halfY = Math.max(0.15, (bounds.maxY - Math.min(0, bounds.minY)) / 2);
  const halfZ = (bounds.maxZ - bounds.minZ) / 2;
  const sphere = Math.max(0.45, Math.hypot(halfX, halfY, halfZ));
  const halfFov = ((fovDeg / 2) * Math.PI) / 180;
  return { centerX, centerY, centerZ, radius: (sphere / Math.sin(halfFov)) * 1.18 };
}

/** 1칸(5.86m) 배치 칸 테두리 선 */
function createCellOutline(material: LineBasicMaterial): LineSegments {
  const half = PROP_PREVIEW_CELL_M / 2;
  const y = 0.02;
  const points = [
    -half,
    y,
    -half,
    half,
    y,
    -half,
    half,
    y,
    -half,
    half,
    y,
    half,
    half,
    y,
    half,
    -half,
    y,
    half,
    -half,
    y,
    half,
    -half,
    y,
    -half,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  return new LineSegments(geometry, material);
}

const MIN_PITCH = 0.1;
const MAX_PITCH = 1.48;
const DEFAULT_YAW = -0.68;
const DEFAULT_PITCH = 0.48;

/** 대화형 3D 로우폴리 소품 미리 보기(끌기 회전·휠 확대·변형·눈 효과) */
export class PropPreview {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(34, 1, 0.05, 600);
  private readonly geometries = createPartGeometries();
  private readonly propGroup = new Group();
  private readonly hemisphere = new HemisphereLight();
  private readonly sun = new DirectionalLight();
  private readonly groundMaterial = new MeshLambertMaterial();
  private readonly ground: Mesh;
  private readonly gridMaterial = new LineBasicMaterial();
  private readonly cellOutline: LineSegments;
  private readonly canvas: HTMLCanvasElement;
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private zoomK = 1;
  private radius = 8;
  private center = new Vector3(0, 1, 0);
  private frame = 0;
  private lastStats: PropPreviewStats = {
    parts: 0,
    triangles: 0,
    widthM: 0,
    depthM: 0,
    heightM: 0,
    float: false,
  };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly cleanup: (() => void)[] = [];
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    const light = FIXED_SECOND_MAP_LIGHT;
    this.scene.background = new Color(...light.background);
    this.hemisphere.color.setRGB(...light.hemisphereSky);
    this.hemisphere.groundColor.setRGB(...light.hemisphereGround);
    this.hemisphere.intensity = light.hemisphereIntensity;
    this.sun.color.setRGB(...light.directColor);
    this.sun.intensity = light.directIntensity;
    this.sun.position.set(...light.direction);

    this.ground = new Mesh(new PlaneGeometry(1, 1), this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.02;
    this.cellOutline = createCellOutline(this.gridMaterial);
    this.scene.add(this.hemisphere, this.sun, this.ground, this.cellOutline, this.propGroup);
    this.listen();
  }

  set(input: PropPreviewInput): PropPreviewStats {
    const built = collectPropParts(input.art, { seed: input.seed, snowy: input.snowy });
    populateGroup(this.propGroup, built.parts, this.geometries);
    const groundKind = input.ground ?? defaultGroundForArt(input.art);
    const palette = GROUND_PALETTE[groundKind];
    this.groundMaterial.color.setRGB(...palette.ground);
    this.gridMaterial.color.setRGB(...palette.grid);

    const framed = frameCamera(built.bounds, this.camera.fov);
    this.center.set(framed.centerX, framed.centerY, framed.centerZ);
    this.radius = framed.radius;
    const span = Math.max(PROP_PREVIEW_CELL_M * 4, framed.radius * 4);
    this.ground.scale.set(span, span, 1);
    this.lastStats = built.stats;
    this.redraw();
    return built.stats;
  }

  stats(): PropPreviewStats {
    return this.lastStats;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setPixelRatio(Math.min(2, Math.max(1, pixelRatio)));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.redraw();
  }

  rotate(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dPitch));
    this.redraw();
  }

  zoom(factor: number): void {
    this.zoomK = Math.min(3.5, Math.max(0.35, this.zoomK * factor));
    this.redraw();
  }

  reset(): void {
    this.yaw = DEFAULT_YAW;
    this.pitch = DEFAULT_PITCH;
    this.zoomK = 1;
    this.redraw();
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    for (const off of this.cleanup) off();
    clearGroup(this.propGroup);
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.ground.geometry.dispose();
    this.groundMaterial.dispose();
    this.cellOutline.geometry.dispose();
    this.gridMaterial.dispose();
    this.hemisphere.dispose();
    this.sun.dispose();
    this.renderer.dispose();
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
      this.center.x + Math.sin(this.yaw) * cp * r,
      this.center.y + Math.sin(this.pitch) * r,
      this.center.z + Math.cos(this.yaw) * cp * r,
    );
    this.camera.lookAt(this.center);
    this.renderer.render(this.scene, this.camera);
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
    });
    on("pointermove", (event) => {
      const last = this.pointers.get(event.pointerId);
      if (!last) return;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.rotate(-dx * 0.012, dy * 0.009);
    });
    const release = (event: PointerEvent): void => {
      this.pointers.delete(event.pointerId);
    };
    on("pointerup", release);
    on("pointercancel", release);
    on(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom(event.deltaY > 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );
  }
}

/**
 * 오프스크린 단일 WebGL 컨텍스트 썸네일 렌더러 — 지형 오브젝트 표 모든 행의 3D 로우폴리 썸네일을 한 컨텍스트로 그려 data URL로 캐시한다.
 */
export class PropThumbnailRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.05, 500);
  private readonly geometries = createPartGeometries();
  private readonly propGroup = new Group();
  private readonly hemisphere = new HemisphereLight();
  private readonly sun = new DirectionalLight();
  private readonly groundMaterial = new MeshLambertMaterial();
  private readonly ground: Mesh;
  private readonly cache = new Map<string, string>();
  private disposed = false;

  constructor(sizePx = 112) {
    const canvas = document.createElement("canvas");
    canvas.width = sizePx;
    canvas.height = sizePx;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(sizePx, sizePx, false);

    const light = FIXED_SECOND_MAP_LIGHT;
    this.scene.background = new Color(...light.background);
    this.hemisphere.color.setRGB(...light.hemisphereSky);
    this.hemisphere.groundColor.setRGB(...light.hemisphereGround);
    this.hemisphere.intensity = light.hemisphereIntensity;
    this.sun.color.setRGB(...light.directColor);
    this.sun.intensity = light.directIntensity;
    this.sun.position.set(...light.direction);

    this.ground = new Mesh(new PlaneGeometry(1, 1), this.groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.02;
    this.scene.add(this.hemisphere, this.sun, this.ground, this.propGroup);
  }

  /** 그림·바탕 조합의 PNG data URL(캐시). 비어 있거나 버렸으면 null */
  render(art: string, ground?: PropGroundKind, snowy = false): string | null {
    if (this.disposed || art === "") return null;
    const resolvedGround = ground ?? defaultGroundForArt(art);
    const key = `${art}:${resolvedGround}:${snowy ? 1 : 0}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const built = collectPropParts(art, { seed: 0, snowy });
    if (built.parts.length === 0) return null;
    populateGroup(this.propGroup, built.parts, this.geometries);
    this.groundMaterial.color.setRGB(...GROUND_PALETTE[resolvedGround].ground);
    const framed = frameCamera(built.bounds, this.camera.fov);
    const span = Math.max(PROP_PREVIEW_CELL_M * 4, framed.radius * 4);
    this.ground.scale.set(span, span, 1);

    const r = framed.radius * 0.96;
    const cp = Math.cos(DEFAULT_PITCH);
    this.camera.position.set(
      framed.centerX + Math.sin(DEFAULT_YAW) * cp * r,
      framed.centerY + Math.sin(DEFAULT_PITCH) * r,
      framed.centerZ + Math.cos(DEFAULT_YAW) * cp * r,
    );
    this.camera.lookAt(framed.centerX, framed.centerY, framed.centerZ);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.cache.set(key, url);
    return url;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cache.clear();
    clearGroup(this.propGroup);
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.ground.geometry.dispose();
    this.groundMaterial.dispose();
    this.hemisphere.dispose();
    this.sun.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
