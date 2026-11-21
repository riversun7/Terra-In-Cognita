// 시뮬 합성 격자 자리 — 시뮬 세계에는 행성·지형이 없어 도시마다 합성 격자 칸을 준다(정원사 오염 칸·공성·웨이브 오는 변·폐허 창고 물건의
// 가장 가까운 도시, 빈 2차맵 알박기 자리). 칸 하나 = 2차맵 하나(서버 1차맵 F9 칸 = 2차맵 하나와 같은 뜻).
// - 처음 도시·새 마을: 도시 ID 차례로 3칸 간격(한 줄 32도시, 가장자리에서 4칸 띄움 — "자리 칸", 1만 도시까지).
// - 알박기로 선 도시(빈틈 2243, simulator/npcClaim.ts): 지은 칸(자리 칸이 아닌 칸)에 둔다(place). 폐허가 되어도 같은 ID라 자리가 남는다.
// run.ts에서 옮겼다(npc-claim). 값은 그대로다(같은 도시 ID → 같은 칸).
import { edgeToward, waveAttackEdge } from "../combat/siegeArena.ts";
import type { Edge } from "../combat/battleTypes.ts";

/** 합성 격자 한 변(도시마다 3칸 간격, 한 줄 32도시 — 1만 도시까지) */
export const SIM_GRID_SIZE = 1024;
const SIM_GRID_ROW = 32;
const SLOT_GAP = 3;
const SLOT_MARGIN = 4;

export interface GridXY {
  readonly x: number;
  readonly y: number;
}

/** 도시 → 격자 자리. 모르면(격자 밖) undefined */
export type CityXY = (cityId: number) => GridXY | undefined;

/** 도시 ID → 자리 칸(도시 ID 차례로 3칸 간격, 가장자리에서 4칸 띄움). 격자 밖이면 undefined */
export function slotXY(cityId: number): GridXY | undefined {
  const slot = cityId - 1;
  const y = SLOT_MARGIN + Math.floor(slot / SIM_GRID_ROW) * SLOT_GAP;
  return slot < 0 || y >= SIM_GRID_SIZE - SLOT_MARGIN
    ? undefined
    : { x: SLOT_MARGIN + (slot % SIM_GRID_ROW) * SLOT_GAP, y };
}

/** 자리 칸인가(앞으로 생길 도시 ID가 쓸 수 있는 칸 — 알박기 자리로 쓰지 않는다) */
export function isSlot(x: number, y: number): boolean {
  return (
    x >= SLOT_MARGIN &&
    y >= SLOT_MARGIN &&
    (x - SLOT_MARGIN) % SLOT_GAP === 0 &&
    (y - SLOT_MARGIN) % SLOT_GAP === 0 &&
    (x - SLOT_MARGIN) / SLOT_GAP < SIM_GRID_ROW
  );
}

/** 격자 칸 열쇠(gardener/pollution.ts squareGrid cellOf와 같다) */
export const gridKey = (x: number, y: number): number => y * SIM_GRID_SIZE + x;

export const gridXYOf = (key: number): GridXY => ({
  x: key % SIM_GRID_SIZE,
  y: Math.floor(key / SIM_GRID_SIZE),
});

/** 한 실행의 도시 자리(알박기로 선 도시는 지은 칸, 나머지는 자리 칸) */
export interface SimSites {
  readonly xyOf: CityXY;
  /** 알박기로 선 도시를 그 칸에 둔다 */
  place(cityId: number, at: GridXY): void;
}

export function createSimSites(): SimSites {
  const placed = new Map<number, GridXY>();
  return {
    xyOf: (cityId) => placed.get(cityId) ?? slotXY(cityId),
    place(cityId, at) {
      placed.set(cityId, at);
    },
  };
}

/** 두 도시의 격자 제곱 거리. 격자 밖 도시는 모른다(undefined) */
export function cityDistance(xyOf: CityXY, from: number, to: number): number | undefined {
  const a = xyOf(from);
  const b = xyOf(to);
  if (!a || !b) return undefined;
  return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
}

/**
 * 정원사 웨이브가 들어오는 변(질문 1067 가): 도시 격자 자리에서 모함 칸(격자 끝, attachGardener의 mothershipCell과 같다)으로의 방향.
 * 격자 축 = 2차맵 축(x 동쪽, y 남쪽)으로 읽는다. 격자 밖 도시·같은 칸이면 시드로 고른다
 */
export function waveEdgeOf(xyOf: CityXY, cityId: number, seed: number, waveId: number): Edge {
  const at = xyOf(cityId);
  const toward = at ? edgeToward(SIM_GRID_SIZE - 1 - at.x, SIM_GRID_SIZE - 1 - at.y) : undefined;
  return toward ?? waveAttackEdge(seed, waveId);
}

/**
 * 시뮬 세력 공성이 들어오는 변(질문 1112 가, 기획 D-535 — 웨이브와 같은 "오는 쪽" 규칙): 공격 세력 도시 가운데 그 도시와 합성 격자 거리가 가장
 * 가까운 도시(같으면 작은 ID) 쪽 변(edgeToward). 공격 세력에 도시가 없거나 격자 밖·같은 칸이면 undefined(서쪽)
 */
export function simSiegeEdge(
  attackerCities: Iterable<number>,
  cityId: number,
  hasCity: (id: number) => boolean = () => true,
  xyOf: CityXY = slotXY,
): Edge | undefined {
  const at = xyOf(cityId);
  if (!at) return undefined;
  let best: { d: number; id: number; x: number; y: number } | undefined;
  for (const from of attackerCities) {
    if (from === cityId || !hasCity(from)) continue;
    const xy = xyOf(from);
    if (!xy) continue;
    const d = (xy.x - at.x) * (xy.x - at.x) + (xy.y - at.y) * (xy.y - at.y);
    if (!best || d < best.d || (d === best.d && from < best.id)) best = { d, id: from, ...xy };
  }
  return best ? edgeToward(best.x - at.x, best.y - at.y) : undefined;
}
