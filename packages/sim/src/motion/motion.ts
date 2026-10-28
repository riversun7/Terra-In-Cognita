// 경로 이동 계산 (ADR 2026-10-28-s1-second-map.md "유닛 이동", 시뮬레이션 ADR "이벤트 예약")
// 저장하는 것은 { 꺾이는 점, 출발 시각, 속도 }뿐이고, 위치는 필요할 때 계산한다.
//
// S1 단순화: 경로 전체를 같은 속도로 간다. 도로 비용은 길 고르기(A*)에만 쓴다.
//
// 반올림 규칙(모두 정수, 같은 입력이면 어디서나 같은 값)
// 1. 구간 길이 = √(dx² + dy²)에 가장 가까운 정수(isqrtRound).
// 2. 꺾이는 점 i 도착 시각 = 출발 + ⌈누적 거리 × 1000 ÷ 속도⌉. 누적 거리로 계산해 구간마다 오차가 쌓이지 않는다.
// 3. 시각 t까지 지난 거리 = ⌊(t − 출발) × 속도 ÷ 1000⌋ (출발 전 0, 마지막 도착 뒤 전체 거리).
//    그래서 도착 시각은 그 점에 닿는 첫 ms다(정수 t 기준).
// 4. 구간 안 위치 = 시작점 + (끝점 − 시작점) × 구간 안 거리 ÷ 구간 길이, 0 쪽으로 자름(출발점 쪽).
//    구간을 벗어나지 않고, 거리가 늘면 위치도 끝점 쪽으로만 간다. 출발·도착 위치는 정확히 꺾이는 점이다.
// 기기도 같은 보간을 해야 하므로(PLAN 4.1 "경로 보간(기기·서버 공용)") 나중에 @terra/shared로 옮긴다.
import { isqrtRound } from "../math/isqrt.ts";
import { MS_PER_SECOND, type Point } from "../units.ts";

/** 좌표 절댓값 상한(2^24 단위 = 2차맵 64개 폭). 거리 제곱이 2^51 안에 들어간다 */
export const MAX_COORDINATE = 0x100_0000;
/** 속도 상한(단위/초, 약 1,024칸/초) */
export const MAX_SPEED = 0x10_0000;

export interface MotionInput {
  /** 꺾이는 점(고정소수점). 첫 점이 출발 위치 */
  readonly waypoints: readonly Point[];
  /** 출발 시각(서버 ms) */
  readonly departAtMs: number;
  /** 속도(단위/초, 1 이상 정수) */
  readonly speed: number;
}

export interface Motion extends MotionInput {
  /** 꺾이는 점까지의 누적 거리(단위). distances[0] = 0 */
  readonly distances: readonly number[];
  /** 꺾이는 점 도착 시각(ms). arrivals[0] = departAtMs */
  readonly arrivals: readonly number[];
}

/** 입력을 검사하고 구간 길이·도착 시각을 미리 계산한다. 틀린 입력은 RangeError. */
export function createMotion(input: MotionInput): Motion {
  const { waypoints, departAtMs, speed } = input;
  if (waypoints.length === 0) throw new RangeError("motion needs at least one waypoint");
  if (!Number.isSafeInteger(departAtMs) || departAtMs < 0) {
    throw new RangeError(`departAtMs must be a non-negative safe integer: ${departAtMs}`);
  }
  if (!Number.isInteger(speed) || speed < 1 || speed > MAX_SPEED) {
    throw new RangeError(`speed must be an integer in [1, ${MAX_SPEED}]: ${speed}`);
  }
  for (const point of waypoints) {
    if (!isCoordinate(point.x) || !isCoordinate(point.y)) {
      throw new RangeError(
        `waypoint must have integer coordinates within ±${MAX_COORDINATE}: (${point.x}, ${point.y})`,
      );
    }
  }
  const distances = [0];
  const arrivals = [departAtMs];
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1] ?? { x: 0, y: 0 };
    const b = waypoints[i] ?? a;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    total += isqrtRound(dx * dx + dy * dy);
    const scaled = total * MS_PER_SECOND;
    if (!Number.isSafeInteger(scaled)) throw new RangeError("motion path is too long");
    distances.push(total);
    arrivals.push(departAtMs + Math.ceil(scaled / speed));
  }
  const last = arrivals[arrivals.length - 1] ?? departAtMs;
  if (!Number.isSafeInteger(last)) throw new RangeError("motion arrival time overflows");
  return { waypoints: [...waypoints], departAtMs, speed, distances, arrivals };
}

function isCoordinate(value: number): boolean {
  return Number.isInteger(value) && value >= -MAX_COORDINATE && value <= MAX_COORDINATE;
}

/** 마지막 꺾이는 점에 닿는 시각(ms). 도착 이벤트를 이 시각에 예약한다 */
export function arrivalAt(motion: Motion): number {
  return motion.arrivals[motion.arrivals.length - 1] ?? motion.departAtMs;
}

/** 시각 timeMs까지 지난 거리(단위, 정수) — 규칙 3 */
export function distanceAt(motion: Motion, timeMs: number): number {
  const total = motion.distances[motion.distances.length - 1] ?? 0;
  if (timeMs <= motion.departAtMs) return 0;
  if (timeMs >= arrivalAt(motion)) return total;
  const travelled = Math.floor(((timeMs - motion.departAtMs) * motion.speed) / MS_PER_SECOND);
  return travelled < total ? travelled : total;
}

/**
 * 시각 timeMs의 위치(정수 고정소수점) — 규칙 3 + 4.
 * 빠른 유닛은 1ms에 여러 단위를 가므로, 중간 꺾이는 점의 도착 시각에는 그 점을 조금 지나 있을 수 있다.
 */
export function positionAt(motion: Motion, timeMs: number): Point {
  return positionAtDistance(motion, distanceAt(motion, timeMs));
}

/** 경로를 따라 travelled 단위만큼 간 위치 — 규칙 4. 누적 거리가 꺾이는 점 i와 같으면 정확히 그 점이다 */
export function positionAtDistance(motion: Motion, travelled: number): Point {
  const { waypoints, distances } = motion;
  const first = waypoints[0] ?? { x: 0, y: 0 };
  const last = waypoints[waypoints.length - 1] ?? first;
  const total = distances[distances.length - 1] ?? 0;
  if (travelled <= 0) return { x: first.x, y: first.y };
  if (travelled >= total) return { x: last.x, y: last.y };
  // distances[i] ≤ travelled 인 가장 큰 i (i < 마지막). 그 구간 길이는 0보다 크다
  let low = 0;
  let high = distances.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((distances[middle] ?? 0) <= travelled) low = middle;
    else high = middle;
  }
  const a = waypoints[low] ?? last;
  const b = waypoints[low + 1] ?? last;
  const start = distances[low] ?? 0;
  const length = (distances[low + 1] ?? start) - start;
  const along = travelled - start;
  return {
    x: a.x + Math.trunc(((b.x - a.x) * along) / length),
    y: a.y + Math.trunc(((b.y - a.y) * along) / length),
  };
}
