// 2차맵 소품 모델(가까이만) — 사용자 결정 U5 (가), ADR 2026-10-31-second-map-from-planet 5절(기기 장식).
// - 화면 짧은 변이 PROP_MODEL_SPAN_M보다 짧을 때만 화면이 보는 땅(propArea.ts: 시야 사다리꼴 ∩ 가시거리 원)의 배치 칸마다 모델을 세운다.
//   가시거리·모델 수 상한은 엔진의 가시거리 자동 조절(render/viewDistance.ts)이 setReach로 정한다(2026-11-09, 전에는 목표 둘레 원).
//   멀리서는 모델 없이 땅 색에 소품 색을 섞는다(terrainMaterial.ts uProps). 그래서 휴대폰 그리기 부담이 작다.
// - 빽빽한 숲(차폐)·바위·덤불·갈대·쓰러진 나무는 칸마다 하나, 성긴 숲(은폐)은 둘에 하나(칸 해시). 상한을 넘으면 화면 아래(보는 사람) 쪽 칸부터.
// - 지금 2차맵과 받은 이웃 2차맵 모두에 세운다(경계 너머에서도 숲이 끊기지 않는다, PropSource).
// - 부품(기하)마다 InstancedMesh 하나(propParts.ts): 소품 18종 + 땅 잔소품이 함께 써도 그리기 호출 최대 6번(2026-11-11, 전에는 모양마다
//   8번). 부품 자리가 모자라면 그 부품만 두 배로 다시 만든다. 자리·돌림·크기·변형은 칸 해시로 정한다(장식이라 Math를 써도 된다, 판정 아님).
//   세운 땅은 둘레 여유(AREA_MARGIN)만큼 넓혀 두고, 지금 보는 땅이 그 안에 다 들어 있으면 다시 세우지 않는다.
// - 땅 잔소품(2026-11-11, ADR 46 "바뀜"): 그림 없는 칸에 지표로 고른 풀포기·자갈·눈덩이·부들 등, 성긴 숲에서 나무를 그리지 않은 칸에
//   고사리·버섯. 화면 아래(보는 사람)에서 가시거리 × CLUTTER_REACH_FACTOR 안, 모델 상한 × CLUTTER_CAP_FACTOR개까지.
// - 유닛 앞 옅게(기획 질문 996 다, D-523 포인터): 카메라 → 내가 고른(따라가는) 유닛 몸 가운데 선분 둘레(반지름 setFade)의 소품 조각을 화면 점
//   무늬로 덜 그린다(propFade.ts, 스크린 도어). 투명 그리기·정렬이 없어 그리기 호출이 늘지 않고, 프레임마다 값(uniform)만 바꾼다.
import { Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3 } from "three";
import { outsideCellKey } from "../buildings/footprint.ts";
import { isPlacementExplored } from "../terrain/fogBits.ts";
import { type NeighbourPlacement, toLocal } from "../terrain/neighbourTerrains.ts";
import { PLACEMENT_CELLS } from "../terrain/terrainData.ts";
import { type PropArea, insideDistance, polygonArea } from "./propArea.ts";
import { type ClutterKind, type PropLook, groundClutter, propLook, snowyCell } from "./propLook.ts";
import {
  PARTS,
  type Part,
  type PartSink,
  type ShapeContext,
  buildClutter,
  buildShape,
  buildUndergrowth,
  partGeometry,
} from "./propParts.ts";
import { VIEW_DISTANCE_LEVELS, VIEW_DISTANCE_START_LEVEL } from "../render/viewDistance.ts";
import { type PropFade, createPropFade, fadeMaterial, segmentDistance } from "./propFade.ts";

/** 소품 층 하나: 지금 2차맵(놓는 자리 null) 또는 이웃 2차맵(놓는 자리, 지형 칸 단위) */
export interface PropSource {
  readonly art: Uint8Array;
  readonly cover: Uint8Array;
  readonly placement: NeighbourPlacement | null;
  /** 칸 해시에 섞는 값(층마다 다르게) */
  readonly salt: number;
  /** 지형 칸 지표 128²(땅 잔소품·눈 얹기). 없으면 잔소품 없음 */
  readonly surface?: Uint8Array | undefined;
  /** 탐사 칸 32² 비트(128바이트). null/undefined면 안개 없이 모두 세운다 */
  readonly explored?: Uint8Array | null | undefined;
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
/** 땅 잔소품: 화면 아래 땅에서 가시거리 × 이 값 안(아래·위 한계 m), 모델 상한 × 이 값 개까지 — 작아서 멀리는 보이지 않는다 */
const CLUTTER_REACH_FACTOR = 0.45;
const CLUTTER_REACH_RANGE_M = [40, 160] as const;
const CLUTTER_CAP_FACTOR = 0.5;
/** 성긴 숲에서 나무를 그리지 않은 칸 가운데 숲 아래 덤불을 그릴 몫 */
const UNDERGROWTH_SHARE = 0.45;
/** 숲 아래 고사리 색 */
const UNDERGROWTH_LEAF = new Color(0.27, 0.5, 0.25);

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

/** 세울 것 하나: 소품(look) 또는 땅 잔소품(clutter) 또는 숲 아래 덤불(둘 다 없음) */
interface Candidate {
  source: PropSource;
  cell: number;
  look: PropLook | null;
  clutter: ClutterKind | null;
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
  /** 부품마다 인스턴스 자리 수(모자라면 그 부품만 두 배로 다시 만든다) */
  private readonly capacity = new Map<Part, number>();
  /** 이번에 세우며 쓴 부품마다 인스턴스 수 */
  private readonly counts = new Map<Part, number>();
  private sources: readonly PropSource[] = [];
  private cellM = 1;
  private groundAt: (x: number, z: number) => number = () => 0;
  /** 수면 높이(물 위 소품 — 기획 D-536). 물이 없으면 땅 높이 */
  private surfaceAt: (x: number, z: number) => number = () => 0;
  /** 마지막으로 세운 땅(둘레 여유를 넣지 않은 다각형)·여유·넓이. null이면 다음 update에서 꼭 다시 세운다 */
  private built: { polygon: readonly { x: number; z: number }[]; margin: number; area: number } | null = null;
  private drawnCount = 0;
  private clutterCount = 0;
  /** 유닛 앞 옅게(모든 부품 재질이 같은 값을 쓴다) */
  private readonly fade: PropFade = createPropFade();
  /** 세운 소품 모델마다 몸 가운데(x, y, z)와 반지름·반높이(m) — 옅게 한 수 세기(HUD) */
  private anchors = new Float32Array(0);
  private anchorCount = 0;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly side = new Vector3(0, 0, 1);
  private readonly tilt = new Quaternion();
  private spanM = PROP_MODEL_SPAN_M;
  /** 가시거리(m, 화면 가운데 땅에서)와 그 단계의 모델 수 상한(setReach) */
  private reachM = PROP_REACH_M;
  private levelCap = MAX_PROPS;
  /** 개발자 2차맵 시험이 정한 모델 수 상한(setLimits). null이면 가시거리 단계 상한 */
  private capOverride: number | null = null;
  /** 지금 2차맵에서 건물이 차지한 배치 칸(1이면 소품 모델을 세우지 않는다). null이면 없음 */
  private blocked: Uint8Array | null = null;
  /** 옆 2차맵 건물이 차지한 칸(지금 2차맵 틀의 칸 열쇠, footprint.ts outsideCellKey). null이면 없음 */
  private blockedOutside: ReadonlySet<number> | null = null;
  /** 부품 하나를 인스턴스에 쓴다(propParts가 부른다) */
  private readonly sink: PartSink = (part, x, y, z, sx, sy, sz, yaw, tilt, color) => {
    const index = this.counts.get(part) ?? 0;
    const mesh = this.ensure(part, index + 1);
    this.rotation.setFromAxisAngle(this.up, yaw);
    if (tilt !== 0) this.rotation.multiply(this.tilt.setFromAxisAngle(this.side, tilt));
    this.position.set(x, y, z);
    this.scale.set(sx, sy, sz);
    this.matrix.compose(this.position, this.rotation, this.scale);
    mesh.setMatrixAt(index, this.matrix);
    mesh.setColorAt(index, color);
    this.counts.set(part, index + 1);
  };

  constructor() {
    for (const part of PARTS) this.allocate(part, MAX_PROPS);
    this.group.visible = false;
  }

  /** 부품 하나의 InstancedMesh를 capacity 자리로 (다시) 만든다. 쓴 인스턴스(앞 keep개)는 옮겨 담는다 */
  private allocate(part: Part, capacity: number, keep = 0): InstancedMesh {
    const old = this.meshes.get(part);
    const mesh = new InstancedMesh(
      old?.geometry ?? partGeometry(part),
      old && !Array.isArray(old.material) ? old.material : fadeMaterial(new MeshLambertMaterial(), this.fade),
      Math.max(1, capacity),
    );
    if (old) {
      if (keep > 0) {
        mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, keep * 16));
        if (old.instanceColor) {
          // 색 버퍼는 처음 setColorAt 때 생긴다: 하나 써서 만든 뒤 옮겨 담는다
          mesh.setColorAt(0, new Color());
          mesh.instanceColor?.array.set(old.instanceColor.array.subarray(0, keep * 3));
        }
      }
      old.removeFromParent();
      // 기하·재질은 새 메시가 그대로 쓴다(인스턴스 버퍼만 버린다)
      old.dispose();
    }
    mesh.count = 0;
    // 인스턴스 자리가 넓게 퍼져 있어 묶음 경계로 거르지 않는다(늘 그리되 개수가 0이면 그리지 않는다)
    mesh.frustumCulled = false;
    this.meshes.set(part, mesh);
    this.capacity.set(part, capacity);
    this.group.add(mesh);
    return mesh;
  }

  /** 부품 자리가 needed개 이상이 되게(모자라면 두 배로) */
  private ensure(part: Part, needed: number): InstancedMesh {
    const capacity = this.capacity.get(part) ?? 0;
    const mesh = this.meshes.get(part);
    if (mesh && needed <= capacity) return mesh;
    return this.allocate(part, Math.max(needed, capacity * 2, 64), this.counts.get(part) ?? 0);
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
    this.built = null;
  }

  /**
   * 모델을 세우는 거리(화면 짧은 변 m)와 모델 수 상한을 바꾼다(개발자 2차맵 시험). 범위 밖은 범위로 자른다.
   * 다음 update에서 다시 세운다(부품 자리는 쓰면서 늘린다)
   */
  setLimits(spanM: number, maxProps: number): void {
    const [spanLow, spanHigh] = PROP_SPAN_RANGE_M;
    const [capLow, capHigh] = PROP_CAP_RANGE;
    this.spanM = Math.min(spanHigh, Math.max(spanLow, Number.isFinite(spanM) ? spanM : PROP_MODEL_SPAN_M));
    this.capOverride = Math.round(
      Math.min(capHigh, Math.max(capLow, Number.isFinite(maxProps) ? maxProps : MAX_PROPS)),
    );
    this.built = null;
  }

  /** 그린 소품 모델 수(마지막으로 세운 것, 땅 잔소품 빼고) */
  get drawn(): number {
    return this.group.visible ? this.drawnCount : 0;
  }

  /** 그린 땅 잔소품·숲 아래 덤불 수 */
  get clutterDrawn(): number {
    return this.group.visible ? this.clutterCount : 0;
  }

  /**
   * 소품 층들과 배치 칸 크기(m, 지금 2차맵), 땅 높이(세계 자리, 이웃 포함), 수면 높이(물 위 소품, 없으면 땅 높이). 층이 없으면 모델을 세우지
   * 않는다
   */
  setSources(
    sources: readonly PropSource[],
    cellM: number,
    groundAt: (x: number, z: number) => number,
    surfaceAt: (x: number, z: number) => number = groundAt,
  ): void {
    this.sources = sources;
    this.cellM = cellM;
    this.groundAt = groundAt;
    this.surfaceAt = surfaceAt;
    this.built = null;
    this.drawnCount = 0;
    this.clutterCount = 0;
    for (const mesh of this.meshes.values()) mesh.count = 0;
    this.group.visible = false;
  }

  /**
   * 건물이 차지한 칸(지금 2차맵, 배치 칸 256²)과 옆 2차맵 건물이 차지한 칸(outside). 다음 update에서 다시 세운다 — 나무가 건물 판을 뚫고
   * 서지 않게
   */
  setBlocked(mask: Uint8Array | null, outside: ReadonlySet<number> | null = null): void {
    this.blocked = mask;
    this.blockedOutside = outside;
    this.built = null;
  }

  /** 둘레 여유(m) — 가시거리에 비례 */
  private margin(): number {
    return Math.min(MAX_AREA_MARGIN_M, Math.max(MIN_AREA_MARGIN_M, this.reachM * AREA_MARGIN_FACTOR));
  }

  /** 땅 잔소품을 세우는 거리(m, 화면 아래 땅에서) */
  private clutterReach(): number {
    const [low, high] = CLUTTER_REACH_RANGE_M;
    return Math.min(high, Math.max(low, this.reachM * CLUTTER_REACH_FACTOR));
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
    const props: Candidate[] = [];
    const clutter: Candidate[] = [];
    const clutterReach = this.clutterReach();
    for (const source of this.sources) this.collect(source, area, margin, clutterReach, props, clutter);
    const nearest = (list: Candidate[], cap: number): void => {
      if (list.length <= cap) return;
      list.sort((a, b) => a.distance2 - b.distance2);
      list.length = cap;
    };
    nearest(props, this.maxProps);
    nearest(clutter, Math.round(this.maxProps * CLUTTER_CAP_FACTOR));
    for (const part of PARTS) this.counts.set(part, 0);
    if (this.anchors.length < props.length * 5) this.anchors = new Float32Array(props.length * 5);
    this.anchorCount = 0;
    for (const candidate of props) this.place(candidate);
    for (const candidate of clutter) this.place(candidate);
    for (const [part, mesh] of this.meshes) {
      mesh.count = this.counts.get(part) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.drawnCount = props.length;
    this.clutterCount = clutter.length;
  }

  /**
   * 층 하나에서 보는 땅(+ 여유 margin m) 안의 소품 칸(props)과, 화면 아래 땅에서 clutterReach m 안의 땅 잔소품 칸(clutter)을 모은다.
   * distance2 = 기준 점(화면 아래)까지 거리²(m²)
   */
  private collect(
    source: PropSource,
    area: PropArea,
    margin: number,
    clutterReach: number,
    props: Candidate[],
    clutter: Candidate[],
  ): void {
    const { art, cover, placement, surface, explored } = source;
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
    const clutter2 = clutterReach * clutterReach;
    const salt = source.salt;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        if (dx * dx + dz * dz > r2) continue;
        if (explored && !isPlacementExplored(explored, x, z)) continue;
        const cell = z * PLACEMENT_CELLS + x;
        if (!placement && this.blocked?.[cell] === 1) continue;
        const look = propLook(art[cell] ?? 0);
        let kind: ClutterKind | null = null;
        let undergrowth = false;
        if (look) {
          const forest = look.shape === "broadleaf" || look.shape === "conifer" || look.shape === "palm";
          // 성긴 숲(은폐)은 둘에 하나만 그린다. 그리지 않은 칸은 숲 아래 덤불 후보
          if (forest && (cover[cell] ?? 0) < 2 && cellRandom(cell, 7 + salt) < 0.5) {
            if (cellRandom(cell, 8 + salt) >= UNDERGROWTH_SHARE) continue;
            undergrowth = true;
          }
        } else {
          kind = groundClutter(surface, cell, cellRandom(cell, 11 + salt), cellRandom(cell, 12 + salt));
          if (!kind) continue;
        }
        const world = cellToWorld(placement, x + 0.5, z + 0.5, cellM);
        if (insideDistance(area.polygon, world.x, world.z) < -margin) continue;
        // 옆 2차맵 건물 판 안(지금 2차맵 틀의 칸으로 본다)
        if (
          placement &&
          this.blockedOutside?.has(outsideCellKey(Math.floor(world.x / cellM), Math.floor(world.z / cellM)))
        )
          continue;
        const nx = world.x - area.nearX;
        const nz = world.z - area.nearZ;
        const distance2 = nx * nx + nz * nz;
        if (look && !undergrowth) {
          props.push({ source, cell, look, clutter: null, distance2 });
        } else if (distance2 <= clutter2) {
          clutter.push({ source, cell, look: null, clutter: kind, distance2 });
        }
      }
    }
  }

  /** 칸 하나에 모델(부품 여럿)을 놓는다 */
  private place(candidate: Candidate): void {
    const { source, cell, look, clutter } = candidate;
    const cellM = this.cellM;
    const salt = source.salt * 16;
    // 층 안 자리(배치 칸, 칸 안에서 흔듦) → 세계 자리
    const lx = (cell % PLACEMENT_CELLS) + 0.15 + cellRandom(cell, 1 + salt) * 0.7;
    const lz = Math.floor(cell / PLACEMENT_CELLS) + 0.15 + cellRandom(cell, 2 + salt) * 0.7;
    const { x, z } = cellToWorld(source.placement, lx, lz, cellM);
    // 돌림은 그 2차맵 틀 기준: 이웃이면 놓는 자리의 돌림(90°의 배수)을 더한다 — 넘어서 지금 2차맵이 돼도 같은 쪽을 본다
    const placed = source.placement;
    // 물 위 소품은 수면에 세운다(바닥이 아니라)
    const ground = look?.float ? this.surfaceAt : this.groundAt;
    const ctx: ShapeContext = {
      x,
      y: ground(x, z),
      z,
      size: 0.8 + cellRandom(cell, 3 + salt) * 0.45,
      turn: cellRandom(cell, 4 + salt) * Math.PI * 2 + (placed ? Math.atan2(placed.b, placed.a) : 0),
      shade: 0.85 + cellRandom(cell, 5 + salt) * 0.3,
      snowy: snowyCell(source.surface, cell),
      r: (k) => cellRandom(cell, k + salt),
      ground,
    };
    if (look) {
      buildShape(this.sink, look, ctx);
      const half = (look.heightM * ctx.size) / 2;
      const o = this.anchorCount * 5;
      this.anchors[o] = x;
      this.anchors[o + 1] = ctx.y + half;
      this.anchors[o + 2] = z;
      this.anchors[o + 3] = Math.max(0.5, half * 0.6);
      this.anchors[o + 4] = half;
      this.anchorCount += 1;
    } else if (clutter) buildClutter(this.sink, clutter, ctx);
    else buildUndergrowth(this.sink, ctx, UNDERGROWTH_LEAF);
  }

  /**
   * 유닛 앞 옅게: 카메라 자리 → 유닛 몸 가운데(세계 m)와 반지름(m). target이 null이면 끈다. 프레임마다 불러도 된다(값만 바꾼다)
   */
  setFade(
    camera: { x: number; y: number; z: number } | null,
    target: { x: number; y: number; z: number } | null,
    radiusM: number,
  ): void {
    const { uniforms } = this.fade;
    if (!camera || !target || !(radiusM > 0)) {
      uniforms.uPropFadeOn.value = 0;
      return;
    }
    uniforms.uPropFadeFrom.value.set(camera.x, camera.y, camera.z);
    uniforms.uPropFadeTo.value.set(target.x, target.y, target.z);
    uniforms.uPropFadeRadius.value = radiusM;
    uniforms.uPropFadeOn.value = 1;
  }

  /** 지금 옅게 그리는 소품 모델 수(몸 가운데 둘레가 선분 반지름 안에 드는 것, HUD·시험). 꺼져 있거나 안 보이면 0 */
  get fadedCount(): number {
    const { uniforms } = this.fade;
    if (!this.group.visible || uniforms.uPropFadeOn.value === 0) return 0;
    const from = uniforms.uPropFadeFrom.value;
    const to = uniforms.uPropFadeTo.value;
    const radius = uniforms.uPropFadeRadius.value;
    let count = 0;
    for (let i = 0; i < this.anchorCount; i++) {
      const o = i * 5;
      const x = this.anchors[o] ?? 0;
      const y = this.anchors[o + 1] ?? 0;
      const z = this.anchors[o + 2] ?? 0;
      const reach = radius + (this.anchors[o + 3] ?? 0);
      const half = this.anchors[o + 4] ?? 0;
      // 세로 축(바닥 ~ 꼭대기)을 다섯 점으로 본다: 한 점이라도 선분 둘레(유닛 앞)면 옅게 그리는 모델
      for (let k = 0; k <= 4; k++) {
        const near = segmentDistance(from, to, x, y - half + (half * k) / 2, z);
        if (near.t < 0.999 && near.distance <= reach) {
          count += 1;
          break;
        }
      }
    }
    return count;
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
