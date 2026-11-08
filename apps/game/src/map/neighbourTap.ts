// 그려 둔 옆 2차맵 땅을 눌렀을 때 — 사용자 지적 2026-11-09 "옆 2차맵 클릭도 안되어 이동도 안되고 화살표를 눌러야한다 끊김없이 진행되는게 목표"
// (docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜"). 누른 자리(지금 2차맵 틀의 배치 칸, 0~256 밖)를 그 옆 2차맵 키와 그 틀의 배치 칸으로 바꾼다.
// 화면은 고른 내 유닛을 그곳으로 2차맵 사이 이동(travel_start — 변까지 걷고 넘는다)으로 보내고, 넘으면 로딩 없이 그 2차맵으로 넘는다.
import { neighbourSpots, type NeighbourSpot } from "./secondMapNeighbours.ts";

/** 2차맵 한 변의 배치 칸 수(@terra/sim PLACEMENT_SIZE — 게임 앱은 sim을 가져오지 않는다) */
const SIDE = 256;

/** 누른 자리 → 옆 2차맵 키·그 틀의 배치 칸(정수, 0~255). 지금 2차맵 안이거나 그쪽 이웃이 없으면(정육면체 꼭짓점 쪽 대각) null */
export function neighbourCellAt(
  mapKey: number,
  cell: { readonly x: number; readonly y: number },
  spots: readonly NeighbourSpot[] = neighbourSpots(mapKey),
): { mapKey: number; x: number; y: number } | null {
  const ox = cell.x < 0 ? -1 : cell.x >= SIDE ? 1 : 0;
  const oy = cell.y < 0 ? -1 : cell.y >= SIDE ? 1 : 0;
  if (ox === 0 && oy === 0) return null;
  const spot = spots.find((item) => item.ox === ox && item.oy === oy);
  if (!spot) return null;
  // 놓는 자리는 지형 칸 단위(배치 칸의 반): 이웃 칸 = Mᵀ·(p − t)
  const { a, b, cc, d, tx, tz } = spot.placement;
  const dx = cell.x / 2 - tx;
  const dz = cell.y / 2 - tz;
  const clamp = (value: number): number => Math.min(SIDE - 1, Math.max(0, Math.floor(value)));
  return {
    mapKey: spot.key,
    x: clamp((a * dx + cc * dz) * 2),
    y: clamp((b * dx + d * dz) * 2),
  };
}

/** 변에서 이만큼(배치 칸) 안이면 "변 바로 옆" — 넘기 신호 */
export const EDGE_CROSS_CELLS = 3;

/**
 * 기준 유닛이 변 바로 옆(EDGE_CROSS_CELLS 안)에 있다가 지금 2차맵에서 사라졌을 때 넘어간 옆 2차맵(그 변 쪽, 모서리면 대각). 변에서 멀었으면 null
 * (죽음·숨김 등 — 넘기가 아니다)
 */
export function crossedNeighbour(
  mapKey: number,
  last: { readonly x: number; readonly y: number },
  spots: readonly NeighbourSpot[] = neighbourSpots(mapKey),
): number | null {
  const ox = last.x < EDGE_CROSS_CELLS ? -1 : last.x > SIDE - EDGE_CROSS_CELLS ? 1 : 0;
  const oy = last.y < EDGE_CROSS_CELLS ? -1 : last.y > SIDE - EDGE_CROSS_CELLS ? 1 : 0;
  if (ox === 0 && oy === 0) return null;
  return spots.find((spot) => spot.ox === ox && spot.oy === oy)?.key ?? null;
}
