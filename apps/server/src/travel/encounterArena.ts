// 조우 전투맵 = 만난 자리 둘레의 실제 2차맵 지형 — 기획 D-172(조우 지점 주변 일정 범위의 타일을 지형으로 쓰는 별도 전투맵)·D-570(질문 1902 가),
// docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-570, 좌표 이동 3)".
// - 창: 두 편 가운데 점을 가운데로 한 변 size칸, 2차맵 밖으로 나가면 안쪽으로 민다(공성 전투맵 siegeOrigin과 같은 꼴). 지형 = sim arenaFromSecondMap
//   (배치 칸 지형 비용·엄폐·꼭짓점 높이 — 다시보기·공성과 같은 셈).
// - 바뀜 (encounter-4, 질문 2030 답 — D-570 1803 "모든유닛이 피해받을수도 건물포함"): 창 안(일부라도)의 2차맵 건물은 부서지지 않는 막힘이 아니라
//   기존 전투 건물 체계의 건물이다(공성 전투맵 siegeArena와 같은 꼴 — 넥서스는 없다). 내구도 = 시설이면 지금 내구도 점, 아니면 [임시] 1,000.
//   보통 건물은 부술 수 있고(breakable — 부서지면 지나간다, 시선은 계속 막는다), 성벽은 wall. 받은 피해는 세계 시설 상태로 돌아간다(부르는 쪽이
//   targets를 단다 — world/battleTargets.ts siegeFacilityTargets, 전투 결과 적용이 같은 동기 처리로 줄인다).
// - 자리: 유닛마다 2차맵의 지금 칸을 창 틀로 옮긴 칸(가장자리 퇴각 띠 START_BAND칸 안쪽으로 자름). 그 칸이 막혔거나 찼으면 가까운 고리부터 빈 칸.
//   설 칸이 없으면 그 유닛은 뺀다. 들어오는 변(퇴각 쪽) = 편 무게중심이 창 가운데에서 가장 먼 쪽 변(두 편이 같으면 뒤 편은 맞은편).
// 정수만 쓴다(같은 입력이면 같은 결과).
import {
  type BattleBuildingInput,
  type BattleMapInput,
  type Edge,
  type SecondMapLayers,
  arenaFromSecondMap,
} from "@terra/sim";

export interface ArenaRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 창에 들어갈 2차맵 건물(siegeLayout.ts siegeLayoutOn과 같은 값) */
export interface ArenaBuilding extends ArenaRect {
  /** 2차맵 건물 ID */
  readonly sourceId: number;
  readonly durability: number;
  /** 성벽 시설(부수면 뚫린다) */
  readonly wall?: boolean | undefined;
}

/** 조우 전투맵과 전투 건물 ID → 2차맵 건물 ID */
export interface EncounterArenaMap {
  readonly map: BattleMapInput;
  readonly sources: ReadonlyMap<number, number>;
}

export interface ArenaUnit {
  readonly unitId: number;
  /** 2차맵 배치 칸 */
  readonly x: number;
  readonly y: number;
}

/** 시작 자리가 피하는 가장자리 폭(퇴각 띠 2칸 — 공성 전투맵과 같다) */
const START_BAND = 2;

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** 짝수 전투맵 한 변(32 ~ 128, 2차맵보다 크지 않게) */
export function arenaSizeOf(wanted: number, mapCells: number): number {
  const even = Math.floor(clamp(Math.floor(wanted), 32, 128) / 2) * 2;
  return Math.min(even, Math.floor(mapCells / 2) * 2);
}

/** 창 원점: center를 창 가운데에 두고 2차맵 안으로 민다 */
export function arenaOrigin(
  center: { x: number; y: number },
  size: number,
  mapCells: number,
): { x: number; y: number } {
  const high = Math.max(mapCells - size, 0);
  return { x: clamp(center.x - (size >> 1), 0, high), y: clamp(center.y - (size >> 1), 0, high) };
}

/** 지형 층(없으면 평지)과 건물(전투 건물 — 부술 수 있다)로 창 하나의 전투맵. 2차맵 건물 ID 차례로 전투 건물 ID 1… */
export function encounterMap(
  layers: SecondMapLayers | null,
  mapCells: number,
  buildings: readonly ArenaBuilding[],
  origin: { x: number; y: number },
  size: number,
): EncounterArenaMap {
  if (mapCells < size) throw new RangeError("arena larger than the second map");
  const cells = size * size;
  const ground: BattleMapInput = layers
    ? arenaFromSecondMap(layers, origin, size)
    : {
        size,
        passable: new Uint8Array(cells).fill(1),
        cover: new Uint8Array(cells),
        height: new Int32Array(cells),
        buildings: [],
      };
  const taken = new Uint8Array(cells);
  const out: BattleBuildingInput[] = [];
  const sources = new Map<number, number>();
  for (const rect of buildings.toSorted((a, b) => a.sourceId - b.sourceId)) {
    const x0 = Math.max(rect.x - origin.x, 0);
    const y0 = Math.max(rect.y - origin.y, 0);
    const x1 = Math.min(rect.x + rect.width - origin.x, size);
    const y1 = Math.min(rect.y + rect.height - origin.y, size);
    const own: number[] = [];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const cell = y * size + x;
        if (taken[cell] === 1) continue;
        taken[cell] = 1;
        own.push(cell);
      }
    if (own.length === 0) continue;
    const id = out.length + 1;
    out.push({
      id,
      cells: own,
      durability: Math.max(1, rect.durability),
      nexus: false,
      ...(rect.wall === true ? { wall: true } : { breakable: true }),
    });
    sources.set(id, rect.sourceId);
  }
  return { map: { ...ground, buildings: out }, sources };
}

/** 전투 건물이 차지한 칸(시작 자리를 두지 않는다) */
function buildingCells(map: BattleMapInput): Set<number> {
  const out = new Set<number>();
  for (const building of map.buildings) for (const cell of building.cells) out.add(cell);
  return out;
}

/** 가까운 고리부터 지나갈 수 있고 빈 칸(없으면 null) */
function freeCellNear(
  map: BattleMapInput,
  taken: Set<number>,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const { size } = map;
  const low = START_BAND;
  const high = size - 1 - START_BAND;
  for (let ring = 0; ring <= size; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cx = x + dx;
        const cy = y + dy;
        if (cx < low || cy < low || cx > high || cy > high) continue;
        const cell = cy * size + cx;
        if (map.passable[cell] === 0 || taken.has(cell)) continue;
        return { x: cx, y: cy };
      }
    }
  }
  return null;
}

/** 편마다 유닛 자리(유닛 ID → 전투맵 칸). 설 칸이 없는 유닛은 빠진다 */
export function placeEncounterUnits(
  map: BattleMapInput,
  origin: { x: number; y: number },
  sides: readonly (readonly ArenaUnit[])[],
): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  const taken = buildingCells(map);
  const high = map.size - 1 - START_BAND;
  for (const side of sides) {
    for (const unit of side) {
      const spot = freeCellNear(
        map,
        taken,
        clamp(unit.x - origin.x, START_BAND, high),
        clamp(unit.y - origin.y, START_BAND, high),
      );
      if (!spot) continue;
      taken.add(spot.y * map.size + spot.x);
      out.set(unit.unitId, spot);
    }
  }
  return out;
}

const OPPOSITE: Readonly<Record<Edge, Edge>> = { 0: 2, 1: 3, 2: 0, 3: 1 };

/** 편 하나의 들어오는 변(무게중심이 창 가운데에서 먼 쪽) */
function edgeOf(
  origin: { x: number; y: number },
  size: number,
  units: readonly ArenaUnit[],
  fallback: Edge,
): Edge {
  if (units.length === 0) return fallback;
  let sx = 0;
  let sy = 0;
  for (const unit of units) {
    sx += unit.x - origin.x;
    sy += unit.y - origin.y;
  }
  const dx = Math.floor(sx / units.length) - (size >> 1);
  const dy = Math.floor(sy / units.length) - (size >> 1);
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 3 : 1;
  return dy < 0 ? 0 : 2;
}

/** 두 편의 들어오는 변(같으면 뒤 편은 맞은편) */
export function encounterEdges(
  origin: { x: number; y: number },
  size: number,
  sides: readonly [readonly ArenaUnit[], readonly ArenaUnit[]],
): [Edge, Edge] {
  const first = edgeOf(origin, size, sides[0], 3);
  let second = edgeOf(origin, size, sides[1], OPPOSITE[first]);
  if (second === first) second = OPPOSITE[first];
  return [first, second];
}

/** 두 편 유닛 자리의 가운데 점(각 편 무게중심의 가운데) */
export function encounterCenter(sides: readonly (readonly ArenaUnit[])[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let count = 0;
  for (const side of sides) {
    if (side.length === 0) continue;
    let sx = 0;
    let sy = 0;
    for (const unit of side) {
      sx += unit.x;
      sy += unit.y;
    }
    x += Math.floor(sx / side.length);
    y += Math.floor(sy / side.length);
    count += 1;
  }
  return count === 0 ? { x: 0, y: 0 } : { x: Math.floor(x / count), y: Math.floor(y / count) };
}
