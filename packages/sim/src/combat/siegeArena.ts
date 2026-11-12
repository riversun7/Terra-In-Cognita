// 공성 전투맵 = 도시의 실제 2차맵 건물 배치 — 기획 D-533(사용자 2026-11-11 "정부건물은 파괴시 함락되니 중앙에 두고 주변 건물이 시간을
// 벌수있게"), 질문 1046 가, ADR `2026-10-29-combat-map-instances.md` "전투맵 만들기"(2차맵 구역 복사), `2026-11-11-city-building-layout.md`.
// 서버(정원사 웨이브·건물 공격)와 시뮬레이터(웨이브 시작 자료 waveBattleInit)가 같은 함수로 전투맵과 시작 자리를 만든다.
// - 창: 넥서스(행정 건물·공격 대상 건물) 가운데를 중심으로 한 변 size칸. 2차맵 밖으로 나가면 안쪽으로 민다(이웃 2차맵 이어 복사는 아직 없다).
// - 넥서스 = 그 건물의 실제 칸(전투 건물 ID 1). 창 안(일부라도)의 다른 건물 = 실제 칸의 장애물(ID 2…, 시선도 막는다 — battleMap.ts).
// - 지형(있으면): 2차맵 배치 칸 지형 비용·엄폐·높이(arena.ts arenaFromSecondMap). 없으면 평지.
// - 시작 자리: 공격 편은 들어오는 변의 3칸째 줄(D-222), 수비 편은 넥서스의 공격 쪽 앞 3칸(광장). 그 칸이 막혔거나(건물·물) 넥서스까지
//   걸어 닿지 못하거나 이미 찼으면 가까운 고리부터 빈 칸을 찾는다. 정수만 쓴다(같은 입력이면 같은 결과).
import type { BattleBuildingInput, BattleMapInput } from "./battleMap.ts";
import { createBattleMap } from "./battleMap.ts";
import type { Edge } from "./battleTypes.ts";
import { type SecondMapLayers, arenaFromSecondMap } from "./arena.ts";
import { breachField } from "./breach.ts";
import { UNREACHABLE } from "./fields.ts";
import { mix32 } from "../math/hash.ts";

/** 2차맵 배치 칸 직사각형(회전한 뒤 차지하는 칸) */
export interface SiegeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 창 안에 장애물로 들어갈 2차맵 건물 */
export interface SiegeLayoutBuilding extends SiegeRect {
  /** 2차맵 건물 ID(결과를 되돌릴 때 쓴다) */
  readonly sourceId: number;
  readonly durability: number;
  /** 성벽 시설(질문 1048 가 — 부수면 뚫린다, battleMap.ts wall) */
  readonly wall?: boolean | undefined;
}

/** 전투 때 닫히는 성문: 성벽 고리의 빈 칸(2차맵에서는 사람이 지나가는 틈, 전투에서는 수비 편만 지나감) */
export interface SiegeGate {
  /** 2차맵 배치 칸 */
  readonly cells: readonly { readonly x: number; readonly y: number }[];
  readonly durability: number;
}

export interface SiegeLayout {
  /** 2차맵 배치 칸 한 변(256) */
  readonly mapCells: number;
  /** 넥서스 자리(행정 건물·대상 건물. 비콘처럼 건물이 아니면 자리만) */
  readonly nexus: SiegeRect;
  /** 넥서스가 2차맵 건물이면 그 ID(장애물 목록에 같은 ID가 있으면 뺀다) */
  readonly nexusSourceId: number | null;
  /** 다른 건물(창 밖 건물은 빠진다) */
  readonly buildings: readonly SiegeLayoutBuilding[];
  /** 2차맵 지형 층. 없으면 평지 */
  readonly terrain: SecondMapLayers | null;
  /** 성문(없으면 없음) */
  readonly gates?: readonly SiegeGate[] | undefined;
}

export interface SiegeArena {
  readonly map: BattleMapInput;
  /** 전투맵 (0, 0)이 놓인 2차맵 배치 칸 */
  readonly origin: { readonly x: number; readonly y: number };
  /** 넥서스의 전투 건물 ID */
  readonly nexusId: number;
  /** 전투 건물 ID → 2차맵 건물 ID */
  readonly sources: ReadonlyMap<number, number>;
}

/** 넥서스의 전투 건물 ID(옛 열린 맵과 같다) */
export const SIEGE_NEXUS_ID = 1;
/** 시작 자리가 피하는 가장자리 폭(퇴각 구역 2칸, 49 C 퇴각 폭 출발값 — D-222 "3칸째 줄") */
const START_BAND = 2;
/** 한 줄에 서는 유닛 수(옛 진형과 같다: 24명마다 한 줄 뒤로) */
const ROW_UNITS = 24;
/** 수비가 넥서스 앞에 서는 거리(칸, 옛 진형 center − 3과 같다) */
const DEFENDER_GAP = 3;

/** 칸 직사각형이 창과 겹치는 칸 번호(작은 차례 — 다시보기 부호기가 바란다) */
function cellsIn(rect: SiegeRect, origin: { x: number; y: number }, size: number): number[] {
  const out: number[] = [];
  const x0 = Math.max(rect.x - origin.x, 0);
  const y0 = Math.max(rect.y - origin.y, 0);
  const x1 = Math.min(rect.x + rect.width - origin.x, size);
  const y1 = Math.min(rect.y + rect.height - origin.y, size);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(y * size + x);
  return out;
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** 창 원점: 넥서스 가운데를 창 가운데에 두고 2차맵 안으로 민다 */
export function siegeOrigin(layout: SiegeLayout, size: number): { x: number; y: number } {
  const cx = layout.nexus.x + (layout.nexus.width >> 1);
  const cy = layout.nexus.y + (layout.nexus.height >> 1);
  const high = Math.max(layout.mapCells - size, 0);
  return { x: clamp(cx - (size >> 1), 0, high), y: clamp(cy - (size >> 1), 0, high) };
}

/**
 * 2차맵 배치 → 공성 전투맵. 넥서스 내구도는 부르는 쪽이 정한다(웨이브는 [임시] 고정값, 건물 공격은 지금 내구도 점). 성문은 수비 편
 * (defenderSide)만 지나간다
 */
export function siegeArena(
  layout: SiegeLayout,
  size: number,
  nexusDurability: number,
  defenderSide = 2,
): SiegeArena {
  if (size > layout.mapCells) throw new RangeError("siege map larger than the second map");
  const origin = siegeOrigin(layout, size);
  const cells = size * size;
  const ground: BattleMapInput = layout.terrain
    ? arenaFromSecondMap(layout.terrain, origin, size)
    : {
        size,
        passable: new Uint8Array(cells).fill(1),
        cover: new Uint8Array(cells),
        height: new Int32Array(cells),
        buildings: [],
      };
  const nexusCells = cellsIn(layout.nexus, origin, size);
  if (nexusCells.length === 0) throw new RangeError("siege nexus outside the map");
  const taken = new Uint8Array(cells);
  for (const cell of nexusCells) taken[cell] = 1;
  const buildings: BattleBuildingInput[] = [
    { id: SIEGE_NEXUS_ID, cells: nexusCells, durability: nexusDurability, nexus: true },
  ];
  const sources = new Map<number, number>();
  if (layout.nexusSourceId !== null) sources.set(SIEGE_NEXUS_ID, layout.nexusSourceId);
  // 2차맵 건물 ID 차례로(입력 차례와 상관없이 같은 전투맵)
  const others = layout.buildings
    .filter((building) => building.sourceId !== layout.nexusSourceId)
    .toSorted((a, b) => a.sourceId - b.sourceId);
  for (const building of others) {
    // 겹치는 칸은 먼저 놓인 건물이 가진다(2차맵 배치 격자는 겹치지 않으니 넥서스 자리만 걸린다)
    const own = cellsIn(building, origin, size).filter((cell) => taken[cell] === 0);
    if (own.length === 0) continue;
    for (const cell of own) taken[cell] = 1;
    const id = buildings.length + 1;
    buildings.push({
      id,
      cells: own,
      durability: Math.max(1, building.durability),
      nexus: false,
      ...(building.wall === true ? { wall: true } : {}),
    });
    sources.set(id, building.sourceId);
  }
  for (const gate of layout.gates ?? []) {
    const own = gate.cells
      .map((at) => ({ x: at.x - origin.x, y: at.y - origin.y }))
      .filter((at) => at.x >= 0 && at.y >= 0 && at.x < size && at.y < size)
      .map((at) => at.y * size + at.x)
      .filter((cell) => taken[cell] === 0 && ground.passable[cell] === 1)
      .toSorted((a, b) => a - b);
    const cellsOnce = own.filter((cell, index) => own[index - 1] !== cell);
    if (cellsOnce.length === 0) continue;
    for (const cell of cellsOnce) taken[cell] = 1;
    buildings.push({
      id: buildings.length + 1,
      cells: cellsOnce,
      durability: Math.max(1, gate.durability),
      nexus: false,
      gateSide: defenderSide,
    });
  }
  return { map: { ...ground, buildings }, origin, nexusId: SIEGE_NEXUS_ID, sources };
}

/** 들어오는 변 기준 (깊이, 옆) → 칸 (x, y). 변: 0 북, 1 동, 2 남, 3 서 */
function fromFrame(edge: Edge, size: number, depth: number, lateral: number): { x: number; y: number } {
  if (edge === 3) return { x: depth, y: lateral };
  if (edge === 1) return { x: size - 1 - depth, y: lateral };
  if (edge === 0) return { x: lateral, y: depth };
  return { x: lateral, y: size - 1 - depth };
}

/** 칸 (x, y) → 들어오는 변 기준 (깊이, 옆) */
function toFrame(edge: Edge, size: number, x: number, y: number): { depth: number; lateral: number } {
  if (edge === 3) return { depth: x, lateral: y };
  if (edge === 1) return { depth: size - 1 - x, lateral: y };
  if (edge === 0) return { depth: y, lateral: x };
  return { depth: size - 1 - y, lateral: x };
}

/** i번째를 가운데에서 양옆으로 번갈아(0, +1, −1, +2, …) — 옛 진형 spreadY와 같다 */
const spread = (index: number, center: number): number =>
  center + ((index + 1) >> 1) * (index % 2 === 0 ? 1 : -1);

const EDGES: readonly Edge[] = [0, 1, 2, 3];

/** 0~3 정수 → 변 */
const edgeOf = (value: number): Edge => EDGES[value & 3] ?? 3;

/** 맞은편 변 */
export const oppositeEdge = (edge: Edge): Edge => edgeOf(edge + 2);

/** 시작 자리 고르기: 공격·수비 편 자리를 차례로 받는다. 한 번 준 칸은 다시 주지 않는다 */
export interface SiegePlacer {
  /** 공격 편 index번째(들어오는 변의 3칸째 줄부터). 빈 칸이 없으면 undefined */
  attacker(index: number): { x: number; y: number } | undefined;
  /** 수비 편 index번째(넥서스의 공격 쪽 앞). 빈 칸이 없으면 undefined */
  defender(index: number): { x: number; y: number } | undefined;
}

/**
 * 시작 자리: 바라는 칸이 지나갈 수 없거나(지형·건물) 넥서스까지 걸어 닿지 못하거나 이미 찼거나 가장자리 2칸 안이면 가까운 고리부터
 * (고리 안은 위 → 아래, 왼 → 오른) 빈 칸을 찾는다
 */
export function siegePlacer(arena: SiegeArena, edge: Edge): SiegePlacer {
  const battleMap = createBattleMap(arena.map);
  const size = battleMap.size;
  const none = new Set<number>();
  const nexus = arena.map.buildings.find((building) => building.id === arena.nexusId);
  const nexusCells = nexus ? [...nexus.cells] : [];
  // 넥서스에서 걸어(성벽·성문은 뚫어서) 닿는 칸 — 시작 자리를 넥서스와 이어진 땅에 둔다. 편 0은 어느 성문의 편도 아니다
  const field = breachField(battleMap, nexusCells, 0, none);
  const used = new Uint8Array(size * size);
  let nearDepth = size;
  let lateralSum = 0;
  for (const cell of nexusCells) {
    const x = cell % size;
    const frame = toFrame(edge, size, x, (cell - x) / size);
    nearDepth = Math.min(nearDepth, frame.depth);
    lateralSum += frame.lateral;
  }
  const nexusLateral = nexusCells.length > 0 ? Math.floor(lateralSum / nexusCells.length) : size >> 1;
  const free = (x: number, y: number): boolean => {
    if (x < START_BAND || y < START_BAND || x >= size - START_BAND || y >= size - START_BAND) return false;
    const cell = y * size + x;
    if (used[cell] !== 0) return false;
    if (!battleMap.passableFor(cell, 0, none)) return false;
    return (field[cell] ?? UNREACHABLE) !== UNREACHABLE;
  };
  const near = (want: { x: number; y: number }): { x: number; y: number } | undefined => {
    const cx = clamp(want.x, 0, size - 1);
    const cy = clamp(want.y, 0, size - 1);
    for (let r = 0; r < size; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!free(cx + dx, cy + dy)) continue;
          used[(cy + dy) * size + cx + dx] = 1;
          return { x: cx + dx, y: cy + dy };
        }
    return undefined;
  };
  const low = START_BAND;
  const high = size - 1 - START_BAND;
  return {
    attacker(index) {
      const depth = START_BAND + Math.floor(index / ROW_UNITS);
      return near(fromFrame(edge, size, depth, clamp(spread(index, nexusLateral), low, high)));
    },
    defender(index) {
      const depth = Math.max(START_BAND, nearDepth - DEFENDER_GAP - Math.floor(index / ROW_UNITS));
      return near(fromFrame(edge, size, depth, clamp(spread(index, nexusLateral), low, high)));
    },
  };
}

/**
 * [임시] 웨이브가 들어오는 변(0 북, 1 동, 2 남, 3 서): (세계 시드, 웨이브 ID)로 고른다. 모선 쪽 방향을 2차맵 축으로 옮기는 규칙은 기획
 * 질문(1067)이다. 시뮬레이터 도시는 배치가 없어 이 값을 쓰지 않는다
 */
export function waveAttackEdge(seed: number, waveId: number): Edge {
  return edgeOf(mix32(seed ^ Math.imul(waveId, 0x27d4_eb2f) ^ 0x5be0_cd19));
}
