// 채집 줄의 설 칸 찾기 — gather/service.ts(1,000줄 상한)에서 옮겼다. docs/adr/2026-11-07-gather-objects.md 3절.
// 배에서 캐기(기획 D-541 1280 가, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B3)"): 승객의 채집 줄은 배를 몬다 — 설 칸 = 배가 설 물 칸(배 크기),
// 거리 = 배 몸 가운데에서 오브젝트까지(배에서 캐는 거리 boat_gather_cells, 물가 어군은 낚는 거리와 큰 값).
import type { ResultCode } from "@terra/protocol";
import type { GatherResultCode } from "@terra/protocol";
import { type CellPoint, type CellRect, PLACEMENT_SIZE, type SizeClass } from "@terra/sim";
import type { SecondMap } from "../world/secondMap.ts";
import { cellDistance2 } from "./rules.ts";

/** 배 크기 등급(boats/service.ts BOAT_SIZE와 같다) */
export const BOAT_BODY_SIZE: SizeClass = 2;

/** 2차맵 이동 명령 결과 → 채집 결과 코드 */
export function commandCode(code: ResultCode): GatherResultCode {
  if (code === "busy" || code === "superseded") return "busy";
  if (code === "unknown_unit") return "unknown_unit";
  if (code === "invalid_request") return "unavailable";
  return "no_path";
}

/** 그 칸에 그 몸이 설 수 있나: 걷는 유닛은 땅, 배(승객의 채집 줄)는 물 */
export type StandTest = (map: SecondMap, x: number, y: number, size: SizeClass) => boolean;
export const onLand: StandTest = (map, x, y, size) => map.isStandable(x, y, size);
export const onWater: StandTest = (map, x, y, size) => map.isNavigable(x, y, size);

/**
 * 목표 칸에서 가장 가까운 설 칸(체비쇼프 고리, 고리 안은 from에 가까운 칸). 없으면 null.
 * anyRing이면 반경 안 모든 설 칸 가운데 from에 가장 가까운 칸(어군 — 낚는 거리 안이면 건너편 물가보다 유닛 쪽 물가로. 배 — 이미 닿으면 그 자리)
 */
export function standNear(
  map: SecondMap,
  target: CellPoint,
  size: SizeClass,
  radius: number,
  from: CellPoint,
  anyRing = false,
  fits: StandTest = onLand,
): CellPoint | null {
  const top = PLACEMENT_SIZE - size;
  if (anyRing) {
    let best: CellPoint | null = null;
    let bestDistance = 0;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const cell = { x: target.x + dx, y: target.y + dy };
        if (cell.x < 0 || cell.y < 0 || cell.x > top || cell.y > top) continue;
        if (!fits(map, cell.x, cell.y, size)) continue;
        const distance = cellDistance2(cell.x, cell.y, from.x, from.y);
        if (!best || distance < bestDistance) {
          best = cell;
          bestDistance = distance;
        }
      }
    return best;
  }
  for (let ring = 0; ring <= radius; ring++) {
    let best: CellPoint | null = null;
    let bestDistance = 0;
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cell = { x: target.x + dx, y: target.y + dy };
        if (cell.x < 0 || cell.y < 0 || cell.x > top || cell.y > top) continue;
        if (!fits(map, cell.x, cell.y, size)) continue;
        const distance = cellDistance2(cell.x, cell.y, from.x, from.y);
        if (!best || distance < bestDistance) {
          best = cell;
          bestDistance = distance;
        }
      }
    if (best) return best;
  }
  return null;
}

/**
 * 건물 직사각형 둘레에서 from에 가장 가까운 설 칸(사용자 지적 2026-11-21 "바로 옆에 있는 건물 진입을 눌렀는데 빙 돌아서 이상한곳으로 가는 현상").
 * 전에는 건물 기준 칸(왼쪽 위 모서리)에서 가장 가까운 설 칸을 골라, 유닛이 건물 반대편에 있어도 그 모서리로 돌아갔다.
 * 고리 = 유닛 몸(size×size)과 건물 직사각형 사이 체비쇼프 거리(1이면 맞닿음). 가까운 고리부터, 고리 안은 from에 가까운 칸. 없으면 null
 */
export function standNearRect(
  map: SecondMap,
  rect: CellRect,
  size: SizeClass,
  radius: number,
  from: CellPoint,
  fits: StandTest = onLand,
): CellPoint | null {
  const top = PLACEMENT_SIZE - size;
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  for (let ring = 1; ring <= radius; ring++) {
    let best: CellPoint | null = null;
    let bestDistance = 0;
    for (let y = rect.y - ring - size + 1; y <= bottom + ring; y++)
      for (let x = rect.x - ring - size + 1; x <= right + ring; x++) {
        if (x < 0 || y < 0 || x > top || y > top) continue;
        // 몸 [x, x+size) × [y, y+size)와 건물 사이 거리
        const gapX = Math.max(rect.x - (x + size - 1), x - right, 0);
        const gapY = Math.max(rect.y - (y + size - 1), y - bottom, 0);
        if (Math.max(gapX, gapY) !== ring) continue;
        if (!fits(map, x, y, size)) continue;
        const distance = cellDistance2(x, y, from.x, from.y);
        if (!best || distance < bestDistance) {
          best = { x, y };
          bestDistance = distance;
        }
      }
    if (best) return best;
  }
  return null;
}

/** 배에서 캘 수 있는 오브젝트인가: 배로만 닿는 것(물 위 자리·낚는 거리 0 어군) 또는 어군(물가에서도 낚는 것) */
export function seaObject(kind: { readonly boat?: boolean | undefined }, moving: boolean): boolean {
  return kind.boat === true || moving;
}

/** 배에서 캐는 거리(배치 칸): 배 설정 칸과 그 종류의 물가 낚는 거리 가운데 큰 값 */
export function boatReach(kind: { readonly reach?: number | undefined }, gatherCells: number): number {
  return Math.max(0, kind.reach ?? 0, gatherCells);
}
