// 2차맵 화면 [옆 2차맵으로](사용자 지적 2026-11-08 "2차맵 넘어서 이동이 되지 않음", docs/adr/2026-11-07-play-flow.md "WP14")의 순수 계산 — 시험 대상
// (edgeTravelData.test.ts). 엔진·React를 가져오지 않는다.
// - 변 넷: 이 2차맵 변 너머 옆 2차맵 키(면 경계 너머는 틀이 돌아가 있다 — secondMapNeighbours.ts의 놓는 자리를 거꾸로 쓴다), 나침반 이름(2차맵
//   북쪽 northOnMap 기준 가장 가까운 동서남북), 목표 칸 = 유닛 자리에서 변에 곧게 내린 점의 변 너머 EDGE_STEP_CELLS번째 칸(옆 2차맵 틀).
// - 서버가 길을 정한다(WP9·WP11 규칙 그대로: 변까지 걷고 넘는다. 띄우지 않은 옆 2차맵은 닿을 때 서버가 띄운다 — WP15·730 다). 기기는 목적
//   2차맵·칸만 보낸다.
// - 보낼 유닛: 고른 내 유닛(목록에 있는 것), 고르지 않았으면 이 2차맵의 내 사이보그.
import type { MapUnit } from "@terra/shared/mapUnits";
import { neighbourSpots } from "./secondMapNeighbours.ts";

/** 배치 칸 한 변 수(2차맵 256 × 256) */
const SIDE = 256;
/** 변 너머 목표 칸까지(배치 칸). 넘자마자 변에 서지 않게 시야 칸 한 변만큼 들어간다 */
export const EDGE_STEP_CELLS = 8;

/** 나침반 이름(동서남북). 극 가까이라 북쪽을 못 정하면 null(이름 대신 차례) */
export type Compass = "north" | "east" | "south" | "west";
const COMPASS: readonly Compass[] = ["north", "east", "south", "west"];

export interface EdgeTarget {
  /** 이 2차맵 틀의 변 방향(오른쪽 x+, 아래 y+) — 하나만 0이 아니다 */
  readonly ox: -1 | 0 | 1;
  readonly oy: -1 | 0 | 1;
  readonly compass: Compass | null;
  /** 옆 2차맵 키와 그 틀의 목표 배치 칸 */
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  /** 유닛에서 이 변까지(배치 칸) */
  readonly distance: number;
}

/** 2차맵 평면(x 오른쪽·z 아래, 위에서 봄)에서 북쪽부터 시계 방향 각이 가장 가까운 동서남북 */
export function compassOf(north: { x: number; z: number } | null, ox: number, oy: number): Compass | null {
  if (!north) return null;
  const cross = north.x * oy - north.z * ox;
  const along = north.x * ox + north.z * oy;
  const quarter = Math.round(Math.atan2(cross, along) / (Math.PI / 2));
  return COMPASS[((quarter % 4) + 4) % 4] ?? null;
}

const clampCell = (value: number): number => Math.max(0, Math.min(SIDE - 1, Math.floor(value)));

/**
 * 변 넷의 옆 2차맵과 목표 칸(나침반 차례: 북·동·남·서, 북쪽을 모르면 틀 차례). unit = 유닛 자리(배치 칸, 실수 — 2차맵 밖이면 안으로 당긴다).
 * 정육면체 꼭짓점 쪽 등 칸이 없는 변은 빠진다
 */
export function edgeTargets(
  mapKey: number,
  unit: { readonly x: number; readonly y: number },
  north: { x: number; z: number } | null,
): EdgeTarget[] {
  const ux = Math.max(0.5, Math.min(SIDE - 0.5, unit.x));
  const uy = Math.max(0.5, Math.min(SIDE - 0.5, unit.y));
  const out: EdgeTarget[] = [];
  for (const spot of neighbourSpots(mapKey)) {
    if (spot.ox !== 0 && spot.oy !== 0) continue;
    // 지금 틀의 변 너머 점: 유닛 자리에서 변에 곧게 내린 점에서 EDGE_STEP_CELLS번째 칸의 가운데(넘는 칸 짝에서 안쪽으로 EDGE_STEP_CELLS − 1칸)
    const beyond = SIDE + EDGE_STEP_CELLS - 0.5;
    const px = spot.ox > 0 ? beyond : spot.ox < 0 ? SIDE - beyond : ux;
    const py = spot.oy > 0 ? beyond : spot.oy < 0 ? SIDE - beyond : uy;
    // 옆 2차맵 틀로: 놓는 자리 p' = M·p + t(지형 칸 옮김 = 배치 칸 옮김의 반) → p = Mᵀ·(p' − t)(M은 90°의 배수 돌림)
    const { a, b, cc, d, tx, tz } = spot.placement;
    const rx = px - tx * 2;
    const ry = py - tz * 2;
    const distance = spot.ox > 0 ? SIDE - ux : spot.ox < 0 ? ux : spot.oy > 0 ? SIDE - uy : uy;
    out.push({
      ox: spot.ox,
      oy: spot.oy,
      compass: compassOf(north, spot.ox, spot.oy),
      mapKey: spot.key,
      x: clampCell(a * rx + cc * ry),
      y: clampCell(b * rx + d * ry),
      distance: Math.round(distance),
    });
  }
  const rank = (target: EdgeTarget): number =>
    target.compass === null ? 4 + (target.oy + 1) * 3 + target.ox : COMPASS.indexOf(target.compass);
  return out.toSorted((p, q) => rank(p) - rank(q));
}

/** 유닛에서 가장 가까운 변(같으면 앞 차례) */
export function nearestEdge(targets: readonly EdgeTarget[]): EdgeTarget | null {
  let best: EdgeTarget | null = null;
  for (const target of targets) if (!best || target.distance < best.distance) best = target;
  return best;
}

/** 보낼 유닛: 고른 유닛이 내 유닛 목록에 있으면 그것, 고르지 않았으면 이 2차맵의 내 사이보그(목록에 있을 때). 없으면 null */
export function edgeUnitOf(input: {
  readonly selected: number | null;
  readonly units: readonly MapUnit[] | null;
  readonly cyborgUnitId: number | null;
}): MapUnit | null {
  const units = input.units ?? [];
  const id = input.selected ?? input.cyborgUnitId;
  if (id === null) return null;
  return units.find((unit) => unit.unitId === id) ?? null;
}
