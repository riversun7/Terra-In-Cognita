// 2차맵 소품 모델(가까이만) — 사용자 결정 U5 (가), ADR 2026-10-31-second-map-from-planet 5절(기기 장식).
// - 화면 짧은 변이 PROP_MODEL_SPAN_M보다 짧을 때만 화면이 보는 땅(propArea.ts: 시야 사다리꼴 ∩ 가시거리 원)의 배치 칸마다 모델을 세운다.
//   가시거리·모델 수 상한은 엔진의 가시거리 자동 조절(render/viewDistance.ts)이 setReach로 정한다(2026-11-09, 전에는 목표 둘레 원).
//   멀리서는 모델 없이 땅 색에 소품 색을 섞는다(terrainMaterial.ts uProps). 그래서 휴대폰 그리기 부담이 작다.
// - 빽빽한 숲(차폐)·바위·덤불·갈대·쓰러진 나무는 칸마다 하나, 성긴 숲(은폐)은 둘에 하나(칸 해시). 상한을 넘으면 화면 아래(보는 사람) 쪽 칸부터.
// - 지금 2차맵과 받은 이웃 2차맵 모두에 세운다(경계 너머에서도 숲이 끊기지 않는다, PropSource).
// - 모양마다 InstancedMesh 하나(줄기는 나무 셋이 함께): 그리기 호출 최대 8번. 자리·돌림·크기는 칸 해시로 정한다(장식이라
//   Math를 써도 된다, 판정 아님). 세운 땅은 둘레 여유(AREA_MARGIN)만큼 넓혀 두고, 지금 보는 땅이 그 안에 다 들어 있으면 다시 세우지 않는다.
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from "three";
import { type NeighbourPlacement, toLocal } from "../terrain/neighbourTerrains.ts";
import { PLACEMENT_CELLS } from "../terrain/terrainData.ts";
import { type PropArea, insideDistance, polygonArea } from "./propArea.ts";
import { type PropShape, propLook } from "./propLook.ts";
import { VIEW_DISTANCE_LEVELS, VIEW_DISTANCE_START_LEVEL } from "../render/viewDistance.ts";

/** 소품 층 하나: 지금 2차맵(놓는 자리 null) 또는 이웃 2차맵(놓는 자리, 지형 칸 단위) */
export interface PropSource {
  readonly art: Uint8Array;
  readonly cover: Uint8Array;
  readonly placement: NeighbourPlacement | null;
  /** 칸 해시에 섞는 값(층마다 다르게) */
  readonly salt: number;
}

/** 모델을 세우는 화면 짧은 변 상한(m) — 이보다 멀면 땅 색만. 기본값(개발자 2차맵 시험이 setLimits로 바꿔 본다) */
export const PROP_MODEL_SPAN_M = 420;
/** 한 번에 세우는 모델 수 상한 기본값 = 가시거리 처음 단계의 상한 */
export const MAX_PROPS = VIEW_DISTANCE_LEVELS[VIEW_DISTANCE_START_LEVEL]?.maxProps ?? 5_000;
/** 가시거리 기본값(m, 화면 가운데 땅에서) = 가시거리 처음 단계 */
export const PROP_REACH_M = VIEW_DISTANCE_LEVELS[VIEW_DISTANCE_START_LEVEL]?.reachM ?? 250;
/** setLimits가 받는 범위(개발자 시험용): 화면 짧은 변 50 ~ 3,000m, 모델 0 ~ 20,000개 */
export const PROP_SPAN_RANGE_M = [50, 3_000] as const;
export const PROP_CAP_RANGE = [0, 20_000] as const;
/** 세운 땅의 둘레 여유(m) = 가시거리 × 이 값, 아래·위 한계. 화면 아래 끝 밖 나무 윗부분이 보이는 것과 다시 세우는 빈도를 함께 덮는다 */
const AREA_MARGIN_FACTOR = 0.1;
const MIN_AREA_MARGIN_M = 12;
const MAX_AREA_MARGIN_M = 40;
/** 보는 땅이 세운 땅의 이 몫보다 작아지면(가까이 확대) 다시 세운다 — 상한을 좁은 곳에 다시 모으려고 */
const SHRINK_REBUILD = 0.5;
const TRUNK_COLOR = new Color(0.42, 0.32, 0.22);

type Part = "trunk" | "broadleaf" | "conifer" | "palm" | "bush" | "reeds" | "boulder" | "log";

function partGeometry(part: Part): BufferGeometry {
  switch (part) {
    case "trunk":
    case "log":
      // 높이 1, 반지름 1(바닥이 0이 되게 올린다)
      return new CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
    case "conifer":
    case "reeds":
      return new ConeGeometry(1, 1, part === "conifer" ? 7 : 5).translate(0, 0.5, 0);
    case "boulder":
      return new DodecahedronGeometry(1, 0);
    default:
      return new IcosahedronGeometry(1, 0);
  }
}

const PARTS: readonly Part[] = ["trunk", "broadleaf", "conifer", "palm", "bush", "reeds", "boulder", "log"];

/** 칸 해시(0 ~ 1) 넷 — 자리·돌림·크기·고르기 */
function cellRandom(cell: number, salt: number): number {
  let h = Math.imul(cell ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4_294_967_296;
}

interface Candidate {
  source: PropSource;
  cell: number;
  shape: PropShape;
  distance2: number;
}

/** 층 안 배치 칸(연속, 칸 가운데는 +0.5) → 세계 자리(m). 이웃이면 놓는 자리로 옮긴다(놓는 자리는 지형 칸 = 배치 칸 2개) */
function cellToWorld(
  placement: NeighbourPlacement | null,
  lx: number,
  lz: number,
  cellM: number,
): { x: number; z: number } {
  if (!placement) return { x: lx * cellM, z: lz * cellM };
  const { a, b, cc, d, tx, tz } = placement;
  const c = lx / 2;
  const r = lz / 2;
  return { x: (a * c + b * r + tx) * 2 * cellM, z: (cc * c + d * r + tz) * 2 * cellM };
}

export class PropView {
  readonly group = new Group();
  private readonly meshes = new Map<Part, InstancedMesh>();
  private sources: readonly PropSource[] = [];
  private cellM = 1;
  private groundAt: (x: number, z: number) => number = () => 0;
  /** 마지막으로 세운 땅(둘레 여유를 넣지 않은 다각형)·여유·넓이. null이면 다음 update에서 꼭 다시 세운다 */
  private built: { polygon: readonly { x: number; z: number }[]; margin: number; area: number } | null = null;
  private drawnCount = 0;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly side = new Vector3(0, 0, 1);
  private readonly color = new Color();
  private readonly tilt = new Quaternion();
  private spanM = PROP_MODEL_SPAN_M;
  /** 가시거리(m, 화면 가운데 땅에서)와 그 단계의 모델 수 상한(setReach) */
  private reachM = PROP_REACH_M;
  private levelCap = MAX_PROPS;
  /** 개발자 2차맵 시험이 정한 모델 수 상한(setLimits). null이면 가시거리 단계 상한 */
  private capOverride: number | null = null;
  /** 모양마다 인스턴스 자리 수(상한을 올리면 다시 만든다) */
  private capacity = 0;
  /** 지금 2차맵에서 건물이 차지한 배치 칸(1이면 소품 모델을 세우지 않는다). null이면 없음 */
  private blocked: Uint8Array | null = null;

  constructor() {
    this.allocate(MAX_PROPS);
    this.group.visible = false;
  }

  /** 모양마다 InstancedMesh를 capacity 자리로 (다시) 만든다 */
  private allocate(capacity: number): void {
    for (const mesh of this.meshes.values()) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      if (!Array.isArray(mesh.material)) mesh.material.dispose();
      mesh.dispose();
    }
    this.meshes.clear();
    for (const part of PARTS) {
      const mesh = new InstancedMesh(partGeometry(part), new MeshLambertMaterial(), Math.max(1, capacity));
      mesh.count = 0;
      // 인스턴스 자리가 넓게 퍼져 있어 묶음 경계로 거르지 않는다(늘 그리되 개수가 0이면 그리지 않는다)
      mesh.frustumCulled = false;
      this.meshes.set(part, mesh);
      this.group.add(mesh);
    }
    this.capacity = capacity;
  }

  /** 지금 모델 수 상한 */
  private get maxProps(): number {
    return this.capOverride ?? this.levelCap;
  }

  /** 지금 상한(화면 짧은 변 m, 모델 수)과 가시거리(m) */
  get limits(): { spanM: number; maxProps: number; reachM: number } {
    return { spanM: this.spanM, maxProps: this.maxProps, reachM: this.reachM };
  }

  /** 가시거리(m)와 그 단계 모델 수 상한(엔진의 가시거리 자동 조절). 다음 update에서 다시 세운다 */
  setReach(reachM: number, maxProps: number): void {
    const reach = Math.max(1, Number.isFinite(reachM) ? reachM : PROP_REACH_M);
    const cap = Math.max(0, Math.round(Number.isFinite(maxProps) ? maxProps : MAX_PROPS));
    if (reach === this.reachM && cap === this.levelCap) return;
    this.reachM = reach;
    this.levelCap = cap;
    if (this.maxProps > this.capacity) this.allocate(this.maxProps);
    this.built = null;
  }

  /**
   * 모델을 세우는 거리(화면 짧은 변 m)와 모델 수 상한을 바꾼다(개발자 2차맵 시험). 범위 밖은 범위로 자른다.
   * 상한이 지금 자리보다 크면 InstancedMesh를 다시 만든다. 다음 update에서 다시 세운다
   */
  setLimits(spanM: number, maxProps: number): void {
    const [spanLow, spanHigh] = PROP_SPAN_RANGE_M;
    const [capLow, capHigh] = PROP_CAP_RANGE;
    this.spanM = Math.min(spanHigh, Math.max(spanLow, Number.isFinite(spanM) ? spanM : PROP_MODEL_SPAN_M));
    this.capOverride = Math.round(
      Math.min(capHigh, Math.max(capLow, Number.isFinite(maxProps) ? maxProps : MAX_PROPS)),
    );
    if (this.maxProps > this.capacity) this.allocate(this.maxProps);
    this.built = null;
  }

  /** 그린 모델 수(마지막으로 세운 것) */
  get drawn(): number {
    return this.group.visible ? this.drawnCount : 0;
  }

  /** 소품 층들과 배치 칸 크기(m, 지금 2차맵), 땅 높이(세계 자리, 이웃 포함). 층이 없으면 모델을 세우지 않는다 */
  setSources(
    sources: readonly PropSource[],
    cellM: number,
    groundAt: (x: number, z: number) => number,
  ): void {
    this.sources = sources;
    this.cellM = cellM;
    this.groundAt = groundAt;
    this.built = null;
    this.drawnCount = 0;
    for (const mesh of this.meshes.values()) mesh.count = 0;
    this.group.visible = false;
  }

  /** 건물이 차지한 칸(지금 2차맵, 배치 칸 256²). 다음 update에서 다시 세운다 — 나무가 건물 판을 뚫고 서지 않게 */
  setBlocked(mask: Uint8Array | null): void {
    this.blocked = mask;
    this.built = null;
  }

  /** 둘레 여유(m) — 가시거리에 비례 */
  private margin(): number {
    return Math.min(MAX_AREA_MARGIN_M, Math.max(MIN_AREA_MARGIN_M, this.reachM * AREA_MARGIN_FACTOR));
  }

  /**
   * 카메라가 바뀐 뒤 부른다. viewSpanM = 화면 짧은 변(m), area = 화면이 보는 땅(propArea, 지금 가시거리로 자른 것).
   * 다시 세웠으면 true(한 번 더 그려야 한다)
   */
  update(viewSpanM: number, area: PropArea): boolean {
    if (this.sources.length === 0 || this.maxProps === 0 || viewSpanM >= this.spanM) {
      const changed = this.group.visible;
      this.group.visible = false;
      return changed;
    }
    const wasVisible = this.group.visible;
    this.group.visible = true;
    const built = this.built;
    if (wasVisible && built) {
      // 지금 보는 땅(볼록)의 꼭짓점이 모두 세운 땅(+ 여유) 안이면 보는 땅 전체가 그 안이다
      const covered = area.polygon.every((p) => insideDistance(built.polygon, p.x, p.z) >= -built.margin);
      if (covered && polygonArea(area.polygon) >= built.area * SHRINK_REBUILD) return false;
    }
    this.rebuild(area);
    return true;
  }

  private rebuild(area: PropArea): void {
    const margin = this.margin();
    this.built = { polygon: area.polygon, margin, area: polygonArea(area.polygon) };
    const candidates: Candidate[] = [];
    for (const source of this.sources) this.collect(source, area, margin, candidates);
    if (candidates.length > this.maxProps) {
      candidates.sort((a, b) => a.distance2 - b.distance2);
      candidates.length = this.maxProps;
    }
    const counts = new Map<Part, number>(PARTS.map((part) => [part, 0]));
    for (const candidate of candidates) this.place(candidate, counts);
    for (const [part, mesh] of this.meshes) {
      mesh.count = counts.get(part) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.drawnCount = candidates.length;
  }

  /** 층 하나에서 보는 땅(+ 여유 margin m) 안의 소품 칸을 모은다. distance2 = 기준 점(화면 아래)까지 거리²(m²) */
  private collect(source: PropSource, area: PropArea, margin: number, out: Candidate[]): void {
    const { art, cover, placement } = source;
    const cellM = this.cellM;
    // 다각형을 덮는 원(세계 m) → 층 안 자리(배치 칸). 이웃이면 돌림의 역으로 옮긴다(원은 돌려도 같다)
    let sumX = 0;
    let sumZ = 0;
    for (const p of area.polygon) {
      sumX += p.x;
      sumZ += p.z;
    }
    const count = Math.max(1, area.polygon.length);
    const midX = sumX / count;
    const midZ = sumZ / count;
    let radius = 0;
    for (const p of area.polygon) radius = Math.max(radius, Math.hypot(p.x - midX, p.z - midZ));
    const r = (radius + margin) / cellM;
    let cx = midX / cellM;
    let cz = midZ / cellM;
    if (placement) {
      const local = toLocal(placement, cx / 2, cz / 2);
      cx = local.c * 2;
      cz = local.r * 2;
    }
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(PLACEMENT_CELLS - 1, Math.ceil(cx + r));
    const z0 = Math.max(0, Math.floor(cz - r));
    const z1 = Math.min(PLACEMENT_CELLS - 1, Math.ceil(cz + r));
    const r2 = r * r;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        if (dx * dx + dz * dz > r2) continue;
        const cell = z * PLACEMENT_CELLS + x;
        if (!placement && this.blocked?.[cell] === 1) continue;
        const look = propLook(art[cell] ?? 0);
        if (!look) continue;
        const forest = look.shape === "broadleaf" || look.shape === "conifer" || look.shape === "palm";
        // 성긴 숲(은폐)은 둘에 하나만 그린다
        if (forest && (cover[cell] ?? 0) < 2 && cellRandom(cell, 7 + source.salt) < 0.5) continue;
        const world = cellToWorld(placement, x + 0.5, z + 0.5, cellM);
        if (insideDistance(area.polygon, world.x, world.z) < -margin) continue;
        const nx = world.x - area.nearX;
        const nz = world.z - area.nearZ;
        out.push({ source, cell, shape: look.shape, distance2: nx * nx + nz * nz });
      }
    }
  }

  /** 칸 하나에 모델(부분 하나나 둘)을 놓는다 */
  private place(candidate: Candidate, counts: Map<Part, number>): void {
    const { source, cell, shape } = candidate;
    const look = propLook(source.art[cell] ?? 0);
    if (!look) return;
    const cellM = this.cellM;
    const salt = source.salt * 16;
    // 층 안 자리(배치 칸, 칸 안에서 흔듦) → 세계 자리
    const lx = (cell % PLACEMENT_CELLS) + 0.15 + cellRandom(cell, 1 + salt) * 0.7;
    const lz = Math.floor(cell / PLACEMENT_CELLS) + 0.15 + cellRandom(cell, 2 + salt) * 0.7;
    const { x, z } = cellToWorld(source.placement, lx, lz, cellM);
    const y = this.groundAt(x, z);
    const size = 0.8 + cellRandom(cell, 3 + salt) * 0.45;
    const turn = cellRandom(cell, 4 + salt) * Math.PI * 2;
    const shade = 0.85 + cellRandom(cell, 5 + salt) * 0.3;
    this.rotation.setFromAxisAngle(this.up, turn);
    const h = look.heightM * size;
    const tint = this.color.setRGB(look.color[0] * shade, look.color[1] * shade, look.color[2] * shade);
    switch (shape) {
      case "broadleaf":
        this.put("trunk", counts, x, y, z, 0.28 * size, h * 0.45, 0.28 * size, TRUNK_COLOR);
        this.put("broadleaf", counts, x, y + h * 0.62, z, h * 0.28, h * 0.3, h * 0.28, tint);
        return;
      case "conifer":
        this.put("trunk", counts, x, y, z, 0.25 * size, h * 0.2, 0.25 * size, TRUNK_COLOR);
        this.put("conifer", counts, x, y + h * 0.15, z, h * 0.18, h * 0.85, h * 0.18, tint);
        return;
      case "palm":
        this.put("trunk", counts, x, y, z, 0.2 * size, h * 0.85, 0.2 * size, TRUNK_COLOR);
        this.put("palm", counts, x, y + h * 0.88, z, h * 0.3, h * 0.08, h * 0.3, tint);
        return;
      case "bush":
        this.put("bush", counts, x, y + h * 0.35, z, h * 0.75, h * 0.5, h * 0.75, tint);
        return;
      case "reeds":
        this.put("reeds", counts, x, y, z, 0.45 * size, h, 0.45 * size, tint);
        return;
      case "boulder":
        this.put("boulder", counts, x, y + h * 0.25, z, h * 0.55, h * 0.4, h * 0.5, tint);
        return;
      case "log": {
        // 눕힌 줄기: 옆으로 90° 돌린 뒤 방위로 돌린다
        this.tilt.setFromAxisAngle(this.side, Math.PI / 2);
        this.rotation.multiply(this.tilt);
        this.put("log", counts, x, y + h * 0.4, z, h * 0.45, 3.5 * size, h * 0.45, tint);
        return;
      }
      default: {
        const unknown: never = shape;
        void unknown;
      }
    }
  }

  private put(
    part: Part,
    counts: Map<Part, number>,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: Color,
  ): void {
    const mesh = this.meshes.get(part);
    const index = counts.get(part) ?? 0;
    if (!mesh || index >= this.capacity) return;
    this.position.set(x, y, z);
    this.scale.set(sx, sy, sz);
    this.matrix.compose(this.position, this.rotation, this.scale);
    mesh.setMatrixAt(index, this.matrix);
    mesh.setColorAt(index, color);
    counts.set(part, index + 1);
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      if (!Array.isArray(mesh.material)) mesh.material.dispose();
      mesh.dispose();
    }
    this.meshes.clear();
    this.group.removeFromParent();
  }
}
