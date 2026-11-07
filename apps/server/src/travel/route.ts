// 2차맵 사이 이동의 길(순수 함수) — docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동"·"WP11 이동 2", 기획 D-197(1차맵은 좌표·명령만,
// 유닛은 실제 2차맵을 지나간다)·질문 571 가·590 나·593 나.
// - 2차맵 줄: 출발 → 목적 2차맵의 가장 짧은 줄(변을 나눈 이웃만). 띄우지 않은 2차맵도 줄에 든다(593 나 — 그 구간만 건너뛴다). 같은 길이면
//   띄우지 않은 2차맵이 가장 적은 줄, 그다음 출발·목적 2차맵을 잇는 큰 원에 가까운 2차맵, 목적에 가까운 2차맵, neighbors4 차례로 정한다
//   (대각선 쪽 목적지면 계단처럼 곧은 선을 따라간다).
// - 넘는 자리(590 나): 지금 자리에서 목표(마지막 2차맵 칸을 지금 2차맵 틀로 옮긴 점, frame.ts)로 곧은 선이 변을 지나는 자리. 선이 그 변으로
//   가지 않으면(줄이 꺾이는 곳) 목표를 변에 내린 자리. 그 칸이 막혔으면 가까운 쪽부터 한 칸씩 넓혀 찾는다(나가는 칸·들어가는 칸 둘 다 설 수
//   있어야 한다 — 띄우지 않은 2차맵 쪽은 보지 않는다). 좌표 틀·면 경계는 stepMapCell(ADR 46 3절).
// - 건너뛰는 구간(593 나): 띄운 2차맵 A의 변 끝에서 사라지고, 다음 띄운 2차맵 B의 변(곧은 선이 지나는 자리, 막혔으면 가까운 쪽부터)에
//   나타난다. 걸리는 시간 = A의 나가는 점 → B의 들어가는 점 곧은 거리 ÷ 속도(A의 늘인 틀에서 잰다).
// - 마지막 2차맵: 목표 칸(도시 시청 등 — 건물이 서 있어 설 수 없다)에서 가장 가까운 설 수 있는 칸(체비쇼프 고리 차례).
// - 걸리는 시간(보기 값): 구간마다 곧은 거리 합 ÷ 유닛 속도. 실제 길은 2차맵마다 경로 워커가 찾으므로 조금 더 길다.
// 판정 규칙이 아니라 서버 명령의 길 고르기다. 칸은 정수, 거리 합·큰 원 가까움은 보기 값이라 실수(sqrt·투영)를 쓴다.
import { PLACEMENT_SUBLEVELS, isCellKey, neighbors4 } from "@terra/planet";
import { cellCenter } from "@terra/planet/projection";
import { stepMapCell } from "@terra/planet/secondMap";
import {
  CELL_UNITS,
  type CellPoint,
  HALF_CELL_UNITS,
  PLACEMENT_SIZE,
  type Point,
  type SizeClass,
  anchorAt,
  anchorCenter,
} from "@terra/sim";
import {
  type Frame,
  MAP_UNITS,
  type Side,
  applyFrame,
  frameBetween,
  insideMap,
  routeFrames,
  sideToward,
} from "./frame.ts";

export { type Side, sideToward } from "./frame.ts";

/** 길 하나의 2차맵 수 상한(출발 포함). 서버가 띄우는 시험 2차맵(S1_TEST_MAPS 최대 64)이면 넉넉하다 */
export const MAX_ROUTE_MAPS = 64;
/** 목표 칸 둘레에서 설 칸을 찾는 반경(칸). 건물 한 변 상한(32칸)과 같다 */
export const STAND_SEARCH_CELLS = 32;
/** 큰 원 가까움을 같다고 보는 차이(단위 벡터 내적) */
const TIE = 1e-9;

/** 그 2차맵의 기준 칸에 그 크기 등급이 설 수 있나(지형·건물) */
export type Standable = (mapKey: number, cell: CellPoint, size: SizeClass) => boolean;

type Vec3 = readonly [number, number, number];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const distance2 = (a: Vec3, b: Vec3): number => {
  const d: Vec3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  return dot(d, d);
};

/** 출발·목적 2차맵 가운데를 지나는 큰 원의 법선(단위). 같은 자리면 null */
function greatCircleNormal(from: number, to: number): Vec3 | null {
  if (!isCellKey(from) || !isCellKey(to)) return null;
  const a = cellCenter(from);
  const b = cellCenter(to);
  const n: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const length = Math.sqrt(dot(n, n));
  return length > TIE ? [n[0] / length, n[1] / length, n[2] / length] : null;
}

/**
 * 출발 → 목적 2차맵의 가장 짧은 줄(출발·목적 포함). 같은 2차맵이면 [from]. 출발·목적이 띄운 2차맵이 아니거나 상한 안에 이을 수 없으면 null.
 * 지나는 2차맵은 띄우지 않은 것이어도 된다(593 나 — 이동 서비스가 그 구간을 건너뛴다)
 */
export function mapRoute(
  from: number,
  to: number,
  loaded: (mapKey: number) => boolean,
  maxMaps = MAX_ROUTE_MAPS,
): number[] | null {
  if (!loaded(from) || !loaded(to)) return null;
  if (from === to) return [from];
  if (!isCellKey(from) || !isCellKey(to)) return null;
  // 목적에서 너비 우선: 걸음 수(hops)와 그 걸음 수로 가는 줄 가운데 띄우지 않은 2차맵이 가장 적은 수(hidden). 출발을 찾으면 멈춘다
  // (출발 이웃의 한 층 아래는 이미 다 셌다)
  const hops = new Map<number, number>([[to, 0]]);
  const hidden = new Map<number, number>([[to, 0]]);
  const queue: number[] = [to];
  let found = false;
  for (let head = 0; head < queue.length && !found; head++) {
    const key = queue[head];
    if (key === undefined || !isCellKey(key)) continue;
    const depth = hops.get(key) ?? 0;
    if (depth + 1 >= maxMaps) break;
    const under = hidden.get(key) ?? 0;
    for (const next of neighbors4(key)) {
      const cost = under + (loaded(next) ? 0 : 1);
      const known = hops.get(next);
      if (known !== undefined) {
        if (known === depth + 1 && cost < (hidden.get(next) ?? cost)) hidden.set(next, cost);
        continue;
      }
      hops.set(next, depth + 1);
      hidden.set(next, cost);
      if (next === from) found = true;
      queue.push(next);
    }
  }
  if (!found) return null;
  const normal = greatCircleNormal(from, to);
  const goal = cellCenter(to);
  const route: number[] = [from];
  let at: number = from;
  for (let depth = hops.get(from) ?? 0; depth > 0; depth--) {
    if (!isCellKey(at)) return null;
    let best: { key: number; hidden: number; line: number; near: number } | null = null;
    for (const next of neighbors4(at)) {
      if (hops.get(next) !== depth - 1) continue;
      const center = cellCenter(next);
      const candidate = {
        key: next,
        hidden: hidden.get(next) ?? 0,
        line: normal ? Math.abs(dot(center, normal)) : 0,
        near: distance2(center, goal),
      };
      if (
        !best ||
        candidate.hidden < best.hidden ||
        (candidate.hidden === best.hidden &&
          (candidate.line < best.line - TIE ||
            (Math.abs(candidate.line - best.line) <= TIE && candidate.near < best.near - TIE)))
      )
        best = candidate;
    }
    if (!best) return null;
    route.push(best.key);
    at = best.key;
  }
  return route;
}

/** 기준 칸 좌표를 몸이 2차맵 안에 들어가게(0 ~ 256 − 크기) */
const fit = (value: number, size: SizeClass): number => Math.max(0, Math.min(PLACEMENT_SIZE - size, value));

/** 변을 따라가는 위치(단위) → 그 크기 등급의 기준 칸 좌표 */
const alongAnchor = (units: number, size: SizeClass): number =>
  fit(Math.floor((units + (1 - size) * HALF_CELL_UNITS) / CELL_UNITS), size);

/** 그 변의 기준 칸(변을 따라가는 좌표 along) */
function sideCell(side: Side, along: number, size: SizeClass): CellPoint {
  const top = PLACEMENT_SIZE - size;
  return side.dx === 0 ? { x: along, y: side.dy > 0 ? top : 0 } : { x: side.dx > 0 ? top : 0, y: along };
}

/**
 * 곧은 선 p → q가 그 변(틀 가장자리 선)을 지나는 자리의 변을 따라가는 위치(단위). outward면 선이 변 밖으로(변 쪽으로) 가야 하고,
 * 아니면 변 안으로 들어와야 한다. 그렇게 가지 않으면 null
 */
function crossingAlong(p: Point, q: Point, side: Side, outward: boolean): number | null {
  const toward = side.dx !== 0 ? (q.x - p.x) * side.dx : (q.y - p.y) * side.dy;
  if (outward ? toward <= 0 : toward >= 0) return null;
  if (side.dx !== 0) {
    const edge = side.dx > 0 ? MAP_UNITS : 0;
    return p.y + ((edge - p.x) / (q.x - p.x)) * (q.y - p.y);
  }
  const edge = side.dy > 0 ? MAP_UNITS : 0;
  return p.x + ((edge - p.y) / (q.y - p.y)) * (q.x - p.x);
}

/** 그 변에서 ideal에 가장 가까운(작은 쪽 먼저) 칸부터 ok인 첫 칸. 없으면 null */
function searchSide(
  side: Side,
  ideal: number,
  size: SizeClass,
  ok: (cell: CellPoint) => boolean,
): CellPoint | null {
  const top = PLACEMENT_SIZE - size;
  for (let offset = 0; offset <= top; offset++) {
    for (const along of offset === 0 ? [ideal] : [ideal - offset, ideal + offset]) {
      if (along < 0 || along > top) continue;
      const cell = sideCell(side, along, size);
      if (ok(cell)) return cell;
    }
  }
  return null;
}

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
  /** to에 들어서는 기준 칸(to를 띄우지 않았으면 null — 건너뛰는 구간) */
  readonly entry: CellPoint | null;
}

/**
 * from → 이웃 to로 넘는 자리. here = 지금 위치(단위), aim = 목표를 from 틀로 옮긴 점(없으면 here의 좌표를 이어 간다 — 옛 규칙).
 * checkEntry가 false면(to를 띄우지 않음) 들어가는 칸은 보지 않는다. 설 수 있는 자리가 없으면 null
 */
export function pickCrossing(
  from: number,
  to: number,
  here: Point,
  size: SizeClass,
  standable: Standable,
  aim?: Point,
  checkEntry = true,
): Crossing | null {
  const side = sideToward(from, to);
  if (!side) return null;
  const units = aim
    ? (crossingAlong(here, aim, side, true) ?? (side.dx === 0 ? aim.x : aim.y))
    : side.dx === 0
      ? here.x
      : here.y;
  const entering = (cell: CellPoint): CellPoint | null => {
    const entry = entryOf(from, to, cell, side, size);
    return entry && standable(to, entry, size) ? entry : null;
  };
  const exit = searchSide(
    side,
    alongAnchor(units, size),
    size,
    (cell) => standable(from, cell, size) && (!checkEntry || entering(cell) !== null),
  );
  if (!exit) return null;
  return { exit, entry: checkEntry ? entering(exit) : null };
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

/** 한 길(줄·목표·몸 크기)의 문맥: 줄의 틀 바꾸기를 한 번 만들어 둔다 */
export interface RouteContext {
  readonly route: readonly number[];
  /** 목표 배치 칸(마지막 2차맵 안) */
  readonly target: CellPoint;
  readonly size: SizeClass;
  readonly standable: Standable;
  readonly loaded: (mapKey: number) => boolean;
  /** 틀 바꾸기(이웃이 아닌 짝이 있으면 null — 곧은 선 없이 옛 규칙) */
  readonly frames: readonly Frame[] | null;
}

export function routeContext(
  route: readonly number[],
  target: CellPoint,
  size: SizeClass,
  standable: Standable,
  loaded: (mapKey: number) => boolean,
): RouteContext {
  return { route, target, size, standable, loaded, frames: routeFrames(route) };
}

/** 목표(마지막 2차맵 칸 가운데)를 route[index] 늘인 틀로 옮긴 점. 틀이 없으면 undefined */
export function aimAt(context: RouteContext, index: number): Point | undefined {
  if (!context.frames) return undefined;
  const last = context.route.length - 1;
  return applyFrame(
    frameBetween(context.frames, last, index),
    anchorCenter(context.target.x, context.target.y, context.size),
  );
}

/** route[index]에서 걸어갈 곳: 마지막이면 목표 둘레 설 칸(stand), 아니면 넘는 짝(다음을 띄우지 않았으면 entry null) */
export type LegGoal =
  | { readonly kind: "stand"; readonly cell: CellPoint }
  | { readonly kind: "cross"; readonly exit: CellPoint; readonly entry: CellPoint | null }
  | { readonly kind: "blocked"; readonly problem: "border_blocked" | "goal_blocked" };

export function legGoal(context: RouteContext, index: number, here: Point): LegGoal {
  const mapKey = context.route[index];
  const next = context.route[index + 1];
  if (mapKey === undefined) return { kind: "blocked", problem: "goal_blocked" };
  if (next === undefined) {
    const cell = standNear(mapKey, context.target, context.size, context.standable);
    return cell ? { kind: "stand", cell } : { kind: "blocked", problem: "goal_blocked" };
  }
  const crossing = pickCrossing(
    mapKey,
    next,
    here,
    context.size,
    context.standable,
    aimAt(context, index),
    context.loaded(next),
  );
  return crossing
    ? { kind: "cross", exit: crossing.exit, entry: crossing.entry }
    : { kind: "blocked", problem: "border_blocked" };
}

/** 건너뛰는 구간 하나: route[from](띄운 2차맵)의 나가는 점에서 사라져 route[to](다음 띄운 2차맵)의 entry 칸에 나타난다 */
export interface Hop {
  readonly from: number;
  readonly to: number;
  readonly entry: CellPoint;
  /** 곧은 거리(단위, route[from] 늘인 틀에서) */
  readonly distance: number;
}

/**
 * route[from]의 나가는 점 exit(단위, route[from] 틀)에서 건너뛰어 나타날 곳: 다음 띄운 2차맵의 들어오는 변에서 곧은 선(exit → 목표)이
 * 지나는 자리(가지 않으면 exit을 그 틀로 옮긴 자리의 좌표), 막혔으면 가까운 쪽부터. 없으면 null
 */
export function hopFrom(context: RouteContext, from: number, exit: Point): Hop | null {
  const { route, frames, size, standable, loaded } = context;
  let to = from + 1;
  while (to < route.length && !loaded(route[to] ?? 0)) to++;
  const mapKey = route[to];
  const before = route[to - 1];
  if (mapKey === undefined || before === undefined || !frames || to === from + 1) return null;
  const side = sideToward(mapKey, before);
  if (!side) return null;
  const toFrame = frameBetween(frames, from, to);
  const start = applyFrame(toFrame, exit);
  const aim = aimAt(context, to);
  const units = (aim ? crossingAlong(start, aim, side, false) : null) ?? (side.dx === 0 ? start.x : start.y);
  const entry = searchSide(side, alongAnchor(units, size), size, (cell) => standable(mapKey, cell, size));
  if (!entry) return null;
  const back = applyFrame(frameBetween(frames, to, from), anchorCenter(entry.x, entry.y, size));
  return { from, to, entry, distance: Math.round(Math.hypot(back.x - exit.x, back.y - exit.y)) };
}

/**
 * 건너뛰는 구간에서 지금 있을 자리(보기 값): exit(route[from] 틀) → entry(route[to] 틀)를 progress(0 ~ 1)만큼 간 점이 든 2차맵과 배치 칸.
 * 틀이 없으면 null
 */
export function hopPlace(
  context: RouteContext,
  hop: Pick<Hop, "from" | "to" | "entry">,
  exit: Point,
  progress: number,
): { readonly index: number; readonly mapKey: number; readonly cell: CellPoint } | null {
  const { frames, route, size } = context;
  if (!frames) return null;
  const end = applyFrame(
    frameBetween(frames, hop.to, hop.from),
    anchorCenter(hop.entry.x, hop.entry.y, size),
  );
  const t = Math.max(0, Math.min(1, progress));
  const point = { x: exit.x + (end.x - exit.x) * t, y: exit.y + (end.y - exit.y) * t };
  for (let index = hop.from; index <= hop.to; index++) {
    const local = applyFrame(frameBetween(frames, hop.from, index), point);
    if (!insideMap(local)) continue;
    return {
      index,
      mapKey: route[index] ?? 0,
      cell: { x: Math.floor(local.x / CELL_UNITS), y: Math.floor(local.y / CELL_UNITS) },
    };
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
  | {
      readonly ok: true;
      readonly legs: readonly Leg[];
      readonly hops: readonly Hop[];
      readonly distance: number;
    }
  | { readonly ok: false; readonly problem: "border_blocked" | "goal_blocked" };

/**
 * 줄을 start(지금 위치, route[0] 틀)에서 목표까지 구간으로 나눈다. 띄운 2차맵은 걷는 구간(legs), 띄우지 않은 2차맵이 이어진 곳은 건너뛰는
 * 구간(hops). 거리 = 곧은 거리 합(단위)
 */
export function planLegs(context: RouteContext, start: Point): LegPlan {
  const legs: Leg[] = [];
  const hops: Hop[] = [];
  const { route, size } = context;
  let at = start;
  let distance = 0;
  for (let index = 0; index < route.length; index++) {
    const mapKey = route[index];
    if (mapKey === undefined) break;
    const goal = legGoal(context, index, at);
    if (goal.kind === "blocked") return { ok: false, problem: goal.problem };
    const cell = goal.kind === "stand" ? goal.cell : goal.exit;
    const to = anchorCenter(cell.x, cell.y, size);
    legs.push({ mapKey, from: at, to });
    distance += Math.round(Math.hypot(to.x - at.x, to.y - at.y));
    if (goal.kind === "stand") break;
    if (goal.entry) {
      at = anchorCenter(goal.entry.x, goal.entry.y, size);
      continue;
    }
    const hop = hopFrom(context, index, to);
    if (!hop) return { ok: false, problem: "border_blocked" };
    hops.push(hop);
    distance += hop.distance;
    at = anchorCenter(hop.entry.x, hop.entry.y, size);
    index = hop.to - 1;
  }
  return { ok: true, legs, hops, distance };
}

/** 지금 위치의 기준 칸(몸이 2차맵 안에 들어가게) */
export function anchorOf(point: Point, size: SizeClass): CellPoint {
  const cell = anchorAt(point, size);
  return { x: fit(cell.x, size), y: fit(cell.y, size) };
}

/** 거리(단위) ÷ 속도(단위/초) → ms(올림) */
export function travelMs(distance: number, speed: number): number {
  return speed > 0 ? Math.ceil((distance * 1000) / speed) : 0;
}

/** 거리(단위) → m(보기 값): 배치 칸 한 변 = 평균 1차맵 칸 한 변 ÷ 256 */
export function distanceMeters(distance: number, cellEdgeMeters: number): number {
  return Math.round((distance / CELL_UNITS) * (cellEdgeMeters / PLACEMENT_SIZE));
}
