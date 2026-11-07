// 2차맵 틀 사이 좌표 바꾸기 — 2차맵 사이 이동이 목적지로 곧은 선을 긋는 데 쓴다(docs/adr/2026-11-07-play-flow.md "WP11 이동 2", 질문 590 나).
// - 2차맵마다 배치 칸 틀(0 ~ 256칸, 단위 = CELL_UNITS)이 있다. 변을 나눈 이웃 B의 점을 A의 "늘인 틀"(A 밖까지 이어 붙인 좌표)로 옮기는
//   바꾸기는 돌림·뒤집힘(부호 있는 자리바꿈 2×2) + 옮김이다. 면 안에서는 옮김만, 면 경계를 넘으면 돌림·뒤집힘이 든다.
// - 바꾸기는 생성기 stepMapCell(이웃 2차맵이 공유하는 경계 칸 틀, ADR 46 3절)에서 바로 읽는다: A 변 가운데 두 칸이 B의 어느 칸으로
//   이어지는지(변을 따라가는 방향)와 B에서 A로 돌아가는 걸음(B 안쪽 방향)이 2×2를 정한다. 그래서 2차맵을 넘는 걸음과 늘 맞는다.
// - 줄(route) 하나의 바꾸기를 이어 붙이면 마지막 2차맵의 목표를 지금 2차맵 틀로 옮길 수 있다(곧은 선의 끝).
// 판정 규칙이 아니라 서버 명령의 길 고르기다. 값은 정수(단위)로 나온다(바꾸기가 정수 행렬·정수 옮김이라).
import { PLACEMENT_SUBLEVELS } from "@terra/planet";
import { stepMapCell } from "@terra/planet/secondMap";
import { CELL_UNITS, HALF_CELL_UNITS, PLACEMENT_SIZE, type CellPoint, type Point } from "@terra/sim";

/** 2차맵 틀의 변 방향(배치 칸 걸음) */
export interface Side {
  readonly dx: -1 | 0 | 1;
  readonly dy: -1 | 0 | 1;
}

export const SIDES: readonly Side[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

/** 2차맵 한 변 길이(단위) */
export const MAP_UNITS = PLACEMENT_SIZE * CELL_UNITS;

/** 좌표 바꾸기: 바깥 x = xx·x + xy·y + tx, 바깥 y = yx·x + yy·y + ty(단위) */
export interface Frame {
  readonly xx: number;
  readonly xy: number;
  readonly yx: number;
  readonly yy: number;
  readonly tx: number;
  readonly ty: number;
}

export const IDENTITY: Frame = { xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 };

export function applyFrame(frame: Frame, point: Point): Point {
  return {
    x: frame.xx * point.x + frame.xy * point.y + frame.tx,
    y: frame.yx * point.x + frame.yy * point.y + frame.ty,
  };
}

/** outer ∘ inner(inner 틀 → outer의 안 틀 → outer의 바깥 틀) */
export function composeFrames(outer: Frame, inner: Frame): Frame {
  return {
    xx: outer.xx * inner.xx + outer.xy * inner.yx,
    xy: outer.xx * inner.xy + outer.xy * inner.yy,
    yx: outer.yx * inner.xx + outer.yy * inner.yx,
    yy: outer.yx * inner.xy + outer.yy * inner.yy,
    tx: outer.xx * inner.tx + outer.xy * inner.ty + outer.tx,
    ty: outer.yx * inner.tx + outer.yy * inner.ty + outer.ty,
  };
}

/** 거꾸로(부호 있는 자리바꿈의 역 = 전치) */
export function invertFrame(frame: Frame): Frame {
  const xx = frame.xx;
  const xy = frame.yx;
  const yx = frame.xy;
  const yy = frame.yy;
  return { xx, xy, yx, yy, tx: -(xx * frame.tx + xy * frame.ty), ty: -(yx * frame.tx + yy * frame.ty) };
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

/** 배치 칸 가운데(단위, 크기 1) */
const cellCenter = (cell: CellPoint): Point => ({
  x: cell.x * CELL_UNITS + HALF_CELL_UNITS,
  y: cell.y * CELL_UNITS + HALF_CELL_UNITS,
});

/** 이웃 b 틀의 점 → a의 늘인 틀. 변을 나누지 않으면 null */
export function neighbourFrame(a: number, b: number): Frame | null {
  const side = sideToward(a, b);
  if (!side) return null;
  const last = PLACEMENT_SIZE - 1;
  const middle = PLACEMENT_SIZE >> 1;
  // 변 가운데 두 칸(면 모서리·꼭짓점에서 멀리) — 변을 따라가는 방향 along
  const along = side.dx === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const c0 =
    side.dx === 0 ? { x: middle, y: side.dy > 0 ? last : 0 } : { x: side.dx > 0 ? last : 0, y: middle };
  const s0 = stepMapCell(a, PLACEMENT_SUBLEVELS, c0.x, c0.y, side.dx, side.dy);
  const s1 = stepMapCell(a, PLACEMENT_SUBLEVELS, c0.x + along.x, c0.y + along.y, side.dx, side.dy);
  if (!s0 || !s1 || s0.mapKey !== b || s1.mapKey !== b) return null;
  const ub = { x: s1.x - s0.x, y: s1.y - s0.y };
  if (Math.abs(ub.x) + Math.abs(ub.y) !== 1) return null;
  // b 안쪽 방향: s0에서 그 반대로 한 걸음 가면 a의 c0
  let nb: { x: number; y: number } | null = null;
  for (const step of SIDES) {
    const back = stepMapCell(b, PLACEMENT_SUBLEVELS, s0.x, s0.y, step.dx, step.dy);
    if (back?.mapKey === a && back.x === c0.x && back.y === c0.y) {
      nb = { x: -step.dx, y: -step.dy };
      break;
    }
  }
  if (!nb) return null;
  // 2×2 = along_a · along_bᵀ + normal_a · normal_bᵀ (b의 두 축이 a의 두 축으로)
  const na = { x: side.dx, y: side.dy };
  const xx = along.x * ub.x + na.x * nb.x;
  const xy = along.x * ub.y + na.x * nb.y;
  const yx = along.y * ub.x + na.y * nb.x;
  const yy = along.y * ub.y + na.y * nb.y;
  const pb = cellCenter(s0);
  const pa = cellCenter({ x: c0.x + na.x, y: c0.y + na.y });
  return { xx, xy, yx, yy, tx: pa.x - (xx * pb.x + xy * pb.y), ty: pa.y - (yx * pb.x + yy * pb.y) };
}

/** 줄의 바꾸기: frames[k] = route[k + 1] 틀 → route[k] 늘인 틀. 이웃이 아닌 짝이 있으면 null */
export function routeFrames(route: readonly number[]): Frame[] | null {
  const frames: Frame[] = [];
  for (let index = 0; index + 1 < route.length; index++) {
    const frame = neighbourFrame(route[index] ?? 0, route[index + 1] ?? 0);
    if (!frame) return null;
    frames.push(frame);
  }
  return frames;
}

/** route[from] 틀의 점 → route[to] 늘인 틀로 옮기는 바꾸기 */
export function frameBetween(frames: readonly Frame[], from: number, to: number): Frame {
  if (from === to) return IDENTITY;
  if (from < to) return invertFrame(frameBetween(frames, to, from));
  let frame = IDENTITY;
  // from > to: route[from] → route[from − 1] → … → route[to]
  for (let index = from - 1; index >= to; index--) frame = composeFrames(frames[index] ?? IDENTITY, frame);
  return frame;
}

/** 점이 그 2차맵 틀 안인가(단위) */
export const insideMap = (point: Point): boolean =>
  point.x >= 0 && point.y >= 0 && point.x < MAP_UNITS && point.y < MAP_UNITS;
