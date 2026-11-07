// 2차맵 사이 이동의 길(순수 함수) — docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동", 기획 D-197(1차맵은 좌표·명령만, 유닛은 실제 2차맵을
// 지나간다)·질문 571 가(출발 2차맵 가장자리까지 걷고 1차맵 칸을 따라 이웃 2차맵을 하나씩 지나간다).
// - 2차맵 줄: 출발 → 목적 2차맵의 가장 짧은 줄(변을 나눈 이웃만, 띄운 2차맵만 지난다 — 지나는 2차맵마다 유닛이 실제로 선다). 너비 우선이라
//   같은 길이면 @terra/planet neighbors4 차례(i−1, i+1, j−1, j+1)로 정해진다.
// - 넘는 자리: 지금 2차맵에서 다음 2차맵 쪽 변의 기준 칸(나가는 칸)과 그 너머 칸(들어가는 칸). 둘 다 설 수 있어야 한다. 변을 따라가는 좌표는
//   지금 자리의 좌표를 그대로 이어 가고(곧게 걷는다), 막혔으면 가까운 쪽부터 한 칸씩 넓혀 찾는다. 좌표 틀·면 경계는 stepMapCell(ADR 46 3절).
// - 마지막 2차맵: 목표 칸(도시 시청 등 — 건물이 서 있어 설 수 없다)에서 가장 가까운 설 수 있는 칸(체비쇼프 고리 차례).
// - 걸리는 시간(보기 값): 구간마다 곧은 거리 합 ÷ 유닛 속도. 실제 길은 2차맵마다 경로 워커가 찾으므로 조금 더 길다.
// 판정 규칙이 아니라 서버 명령의 길 고르기다(정수 칸만 쓴다). 거리 합은 보기 값이라 실수 sqrt를 쓴다.
import { PLACEMENT_SUBLEVELS, isCellKey, neighbors4 } from "@terra/planet";
import { stepMapCell } from "@terra/planet/secondMap";
import {
  CELL_UNITS,
  type CellPoint,
  PLACEMENT_SIZE,
  type Point,
  type SizeClass,
  anchorAt,
  anchorCenter,
} from "@terra/sim";

/** 길 하나의 2차맵 수 상한(출발 포함). 서버가 띄우는 시험 2차맵(S1_TEST_MAPS 최대 64)이면 넉넉하다 */
export const MAX_ROUTE_MAPS = 64;
/** 목표 칸 둘레에서 설 칸을 찾는 반경(칸). 건물 한 변 상한(32칸)과 같다 */
export const STAND_SEARCH_CELLS = 32;

/** 그 2차맵의 기준 칸에 그 크기 등급이 설 수 있나(지형·건물) */
export type Standable = (mapKey: number, cell: CellPoint, size: SizeClass) => boolean;

/** 2차맵 틀의 변 방향(배치 칸 걸음) */
export interface Side {
  readonly dx: -1 | 0 | 1;
  readonly dy: -1 | 0 | 1;
}

const SIDES: readonly Side[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/** 출발 → 목적 2차맵의 가장 짧은 줄(출발·목적 포함). 같은 2차맵이면 [from]. 띄운 2차맵만으로 이을 수 없으면 null */
export function mapRoute(
  from: number,
  to: number,
  loaded: (mapKey: number) => boolean,
  maxMaps = MAX_ROUTE_MAPS,
): number[] | null {
  if (!loaded(from) || !loaded(to)) return null;
  if (from === to) return [from];
  const previous = new Map<number, number>([[from, from]]);
  const queue: number[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head];
    if (key === undefined || !isCellKey(key)) continue;
    for (const next of neighbors4(key)) {
      if (previous.has(next) || !loaded(next)) continue;
      previous.set(next, key);
      if (next === to) {
        const route = [to];
        for (let at: number = key; at !== from; at = previous.get(at) ?? from) route.push(at);
        route.push(from);
        route.reverse();
        return route.length <= maxMaps ? route : null;
      }
      queue.push(next);
    }
  }
  return null;
}

/** 2차맵 from에서 이웃 to로 넘는 변(from의 배치 칸 틀). 변을 나누지 않으면 null */
export function sideToward(from: number, to: number): Side | null {
  const last = PLACEMENT_SIZE - 1;
  const middle = PLACEMENT_SIZE >> 1;
  for (const side of SIDES) {
    const x = side.dx > 0 ? last : side.dx < 0 ? 0 : middle;
    const y = side.dy > 0 ? last : side.dy < 0 ? 0 : middle;
    if (stepMapCell(from, PLACEMENT_SUBLEVELS, x, y, side.dx, side.dy)?.mapKey === to) return side;
  }
  return null;
}

/** 기준 칸 좌표를 몸이 2차맵 안에 들어가게(0 ~ 256 − 크기) */
const fit = (value: number, size: SizeClass): number => Math.max(0, Math.min(PLACEMENT_SIZE - size, value));

/**
 * 나가는 기준 칸(from의 변 쪽 끝) → to에서 들어가는 기준 칸. 나가는 칸이 변에 닿은 칸에서 한 걸음 간 칸을 to의 틀로 바꾸고
 * 몸이 들어가게 맞춘다. 그 걸음이 to가 아니면 null
 */
export function entryOf(
  from: number,
  to: number,
  exit: CellPoint,
  side: Side,
  size: SizeClass,
): CellPoint | null {
  const edgeX = side.dx > 0 ? exit.x + size - 1 : exit.x;
  const edgeY = side.dy > 0 ? exit.y + size - 1 : exit.y;
  const step = stepMapCell(from, PLACEMENT_SUBLEVELS, edgeX, edgeY, side.dx, side.dy);
  if (!step || step.mapKey !== to) return null;
  return { x: fit(step.x, size), y: fit(step.y, size) };
}

export interface Crossing {
  /** from에서 걸어갈 기준 칸(변 끝) */
  readonly exit: CellPoint;
  /** to에 들어서는 기준 칸 */
  readonly entry: CellPoint;
}

/** from → 이웃 to로 넘는 자리. here = 지금 기준 칸(변을 따라가는 좌표를 이어 간다). 설 수 있는 짝이 없으면 null */
export function pickCrossing(
  from: number,
  to: number,
  here: CellPoint,
  size: SizeClass,
  standable: Standable,
): Crossing | null {
  const side = sideToward(from, to);
  if (!side) return null;
  const top = PLACEMENT_SIZE - size;
  const ideal = fit(side.dx === 0 ? here.x : here.y, size);
  for (let offset = 0; offset <= top; offset++) {
    for (const along of offset === 0 ? [ideal] : [ideal - offset, ideal + offset]) {
      if (along < 0 || along > top) continue;
      const exit =
        side.dx === 0 ? { x: along, y: side.dy > 0 ? top : 0 } : { x: side.dx > 0 ? top : 0, y: along };
      if (!standable(from, exit, size)) continue;
      const entry = entryOf(from, to, exit, side, size);
      if (entry && standable(to, entry, size)) return { exit, entry };
    }
  }
  return null;
}

/** 목표 칸에서 가장 가까운 설 수 있는 기준 칸(체비쇼프 고리, 고리 안은 위에서 아래·왼쪽에서 오른쪽). 없으면 null */
export function standNear(
  mapKey: number,
  target: CellPoint,
  size: SizeClass,
  standable: Standable,
  radius = STAND_SEARCH_CELLS,
): CellPoint | null {
  const top = PLACEMENT_SIZE - size;
  for (let ring = 0; ring <= radius; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cell = { x: target.x + dx, y: target.y + dy };
        if (cell.x < 0 || cell.y < 0 || cell.x > top || cell.y > top) continue;
        if (standable(mapKey, cell, size)) return cell;
      }
    }
  }
  return null;
}

/** 길 한 구간(한 2차맵 안 곧은 거리) */
export interface Leg {
  readonly mapKey: number;
  readonly from: Point;
  readonly to: Point;
}

export type LegPlan =
  | { readonly ok: true; readonly legs: readonly Leg[]; readonly distance: number }
  | { readonly ok: false; readonly problem: "border_blocked" | "goal_blocked" };

/** 줄 route를 start(지금 위치)에서 target(마지막 2차맵 칸)까지 구간으로 나눈다. 거리 = 곧은 거리 합(단위) */
export function planLegs(
  route: readonly number[],
  start: Point,
  target: CellPoint,
  size: SizeClass,
  standable: Standable,
): LegPlan {
  const legs: Leg[] = [];
  let at = start;
  let distance = 0;
  for (let index = 0; index < route.length; index++) {
    const mapKey = route[index];
    if (mapKey === undefined) break;
    const next = route[index + 1];
    let goal: CellPoint | null;
    let entry: CellPoint | null = null;
    if (next === undefined) {
      goal = standNear(mapKey, target, size, standable);
      if (!goal) return { ok: false, problem: "goal_blocked" };
    } else {
      const crossing = pickCrossing(mapKey, next, anchorAt(at, size), size, standable);
      if (!crossing) return { ok: false, problem: "border_blocked" };
      goal = crossing.exit;
      entry = crossing.entry;
    }
    const to = anchorCenter(goal.x, goal.y, size);
    legs.push({ mapKey, from: at, to });
    distance += Math.round(Math.hypot(to.x - at.x, to.y - at.y));
    if (entry) at = anchorCenter(entry.x, entry.y, size);
  }
  return { ok: true, legs, distance };
}

/** 거리(단위) ÷ 속도(단위/초) → ms(올림) */
export function travelMs(distance: number, speed: number): number {
  return speed > 0 ? Math.ceil((distance * 1000) / speed) : 0;
}

/** 거리(단위) → m(보기 값): 배치 칸 한 변 = 평균 1차맵 칸 한 변 ÷ 256 */
export function distanceMeters(distance: number, cellEdgeMeters: number): number {
  return Math.round((distance / CELL_UNITS) * (cellEdgeMeters / PLACEMENT_SIZE));
}
