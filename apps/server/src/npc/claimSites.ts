// 서버 NPC 알박기 자리 셈(npcClaims.ts) — 행성 칸 이웃 겹(neighbors8 반경 — 질문 2334 가), 운반꾼이 걸어가는 출발 2차맵 변 쪽 점(2383),
// 행정 건물을 놓을 2차맵 가운데부터의 첫 자리. 정수만 쓴다.
import { type CellKey, isCellKey, neighbors8, stepCell } from "@terra/planet";
import type { BuildingPlacement } from "@terra/sim";

/** 2차맵 가운데 배치 칸 */
export const MAP_CENTER = 128;
/** 행정 건물 자리 찾기: 2차맵 가운데에서 이만큼(칸)까지, 이 간격으로 */
const SPOT_RADIUS = 96;
const SPOT_STEP = 4;
/** 운반꾼이 걸어가는 출발 2차맵 변 쪽 점(가운데에서 칸)·배치 칸 범위 */
const EDGE_REACH = 120;
const EDGE_MIN = 2;
const EDGE_MAX = 253;

/** 행성 칸 이웃 겹(BFS, 반경 radius): 칸 → 거리·첫 걸음(출발에서 한 칸 옆). 출발 칸은 거리 0 */
export function ringsOf(source: CellKey, radius: number): Map<number, { d: number; first: number }> {
  const out = new Map<number, { d: number; first: number }>();
  out.set(source, { d: 0, first: source });
  let frontier: number[] = [source];
  for (let d = 1; d <= radius; d++) {
    const next: number[] = [];
    for (const key of frontier) {
      const from = out.get(key);
      if (!from || !isCellKey(key)) continue;
      for (const n of neighbors8(key)) {
        if (out.has(n)) continue;
        out.set(n, { d, first: d === 1 ? n : from.first });
        next.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

/** 배치 칸 범위로 자른다 */
const clamp = (v: number): number => Math.min(EDGE_MAX, Math.max(EDGE_MIN, v));

/** 출발 2차맵 안에서 첫 걸음 쪽 변 점(배치 칸). 방향을 모르면 undefined. 2차맵 x·y = 행성 칸 i·j 방향으로 본다(Assumed) */
export function edgeToward(source: CellKey, first: number): { x: number; y: number } | undefined {
  for (let di = -1; di <= 1; di++)
    for (let dj = -1; dj <= 1; dj++)
      if ((di !== 0 || dj !== 0) && stepCell(source, di, dj) === first)
        return { x: clamp(MAP_CENTER + di * EDGE_REACH), y: clamp(MAP_CENTER + dj * EDGE_REACH) };
  return undefined;
}

/** 2차맵 가운데부터 건물(width × height)을 놓을 첫 자리(네모 나선, SPOT_STEP 칸 간격). 없으면 undefined */
export function spotOf(
  map: { canPlace(placement: BuildingPlacement): boolean },
  width: number,
  height: number,
): { x: number; y: number } | undefined {
  for (let r = 0; r <= SPOT_RADIUS; r += SPOT_STEP)
    for (let dy = -r; dy <= r; dy += SPOT_STEP)
      for (let dx = -r; dx <= r; dx += SPOT_STEP) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = MAP_CENTER + dx - Math.floor(width / 2);
        const y = MAP_CENTER + dy - Math.floor(height / 2);
        if (map.canPlace({ x, y, width, height, rotation: 0 })) return { x, y };
      }
  return undefined;
}
