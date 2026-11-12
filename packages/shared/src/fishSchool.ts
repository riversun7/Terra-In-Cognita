// 움직이는 어군(물고기 떼)의 자리 — 기획 D-536 "심해는 배로 이동하여 어군같이 물고기떼같은게 어떨지", 42 §5 표(대륙붕·심해·호수 어군).
// 서버(apps/server/src/gather/objects.ts)가 물 칸 위 닫힌 길을 결정적으로 정하고, 자리는 시각만의 함수다(상태를 저장하지 않는다).
// 서버 판정(낚을 수 있는 거리·채집소 반경)과 기기 그림(엔진 어군 인스턴스·채집 표시)이 이 함수 하나를 쓴다.
// - 길: 점 N개(배치 칸 정수 x, y 번갈아), 마지막 점 → 첫 점으로 닫힌다. 구간 길이 = 8방향 거리(곧은 1000, 대각 1414, 1/1000칸 단위).
// - 한 바퀴 시간 = 전체 길이 × 60 ÷ 빠르기(배치 칸 ÷ 분)ms. 시작 어긋남(phaseMs)으로 어군마다 다른 자리에서 시작한다.
// - 자리 = 1/256 배치 칸 정수. 정수 사칙연산만 쓴다(판정 코드 규칙 — 서버와 기기가 같은 값을 낸다).

/** 어군 길 하나 */
export interface SchoolRoute {
  /** 길 점들(배치 칸 정수, x0, y0, x1, y1, …) — 하나 이상 */
  readonly points: readonly number[];
  /** 한 바퀴 시간(ms, 1 이상) */
  readonly periodMs: number;
  /** 시작 어긋남(ms, 0 ~ periodMs − 1) */
  readonly phaseMs: number;
}

/** 자리 단위: 배치 칸 하나 = 256 */
export const SCHOOL_POSITION_SCALE = 256;

/** 구간 길이(1/1000 배치 칸, 8방향 거리) */
export function schoolSegmentLength(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const long = Math.max(ax, ay);
  const short = Math.min(ax, ay);
  return (long - short) * 1000 + short * 1414;
}

/** 길 전체 길이(1/1000 배치 칸) */
export function schoolRouteLength(points: readonly number[]): number {
  const count = Math.floor(points.length / 2);
  let total = 0;
  for (let k = 0; k < count; k++) {
    const next = (k + 1) % count;
    total += schoolSegmentLength(
      (points[next * 2] ?? 0) - (points[k * 2] ?? 0),
      (points[next * 2 + 1] ?? 0) - (points[k * 2 + 1] ?? 0),
    );
  }
  return total;
}

/** 길 길이·빠르기(배치 칸 ÷ 분) → 한 바퀴 시간(ms, 1 이상) */
export function schoolPeriodMs(lengthMilli: number, speedCellsPerMin: number): number {
  if (lengthMilli <= 0 || speedCellsPerMin <= 0) return 1;
  return Math.max(1, Math.ceil((lengthMilli * 60) / speedCellsPerMin));
}

/** 시각 nowMs의 어군 자리(1/256 배치 칸 정수). 길이 0이면(점 하나·제자리 길) 첫 점 */
export function schoolPosition(route: SchoolRoute, nowMs: number): { x: number; y: number } {
  const { points } = route;
  const count = Math.floor(points.length / 2);
  const x0 = (points[0] ?? 0) * SCHOOL_POSITION_SCALE;
  const y0 = (points[1] ?? 0) * SCHOOL_POSITION_SCALE;
  const total = schoolRouteLength(points);
  const period = Math.max(1, Math.trunc(route.periodMs));
  if (count < 2 || total <= 0) return { x: x0, y: y0 };
  // 바퀴 안 시각(음수 시각도 0 ~ period − 1로) → 간 거리(1/1000 칸). u < period라 곱이 2^53 안이다
  const t = Math.trunc(nowMs) + Math.trunc(route.phaseMs);
  const u = ((t % period) + period) % period;
  let travelled = Math.floor((u * total) / period);
  for (let k = 0; k < count; k++) {
    const next = (k + 1) % count;
    const ax = points[k * 2] ?? 0;
    const ay = points[k * 2 + 1] ?? 0;
    const dx = (points[next * 2] ?? 0) - ax;
    const dy = (points[next * 2 + 1] ?? 0) - ay;
    const length = schoolSegmentLength(dx, dy);
    if (travelled < length || k === count - 1) {
      const along = Math.min(travelled, length);
      const fx = length > 0 ? Math.trunc((dx * SCHOOL_POSITION_SCALE * along) / length) : 0;
      const fy = length > 0 ? Math.trunc((dy * SCHOOL_POSITION_SCALE * along) / length) : 0;
      return { x: ax * SCHOOL_POSITION_SCALE + fx, y: ay * SCHOOL_POSITION_SCALE + fy };
    }
    travelled -= length;
  }
  return { x: x0, y: y0 };
}

/** 시각 nowMs에 어군이 있는 배치 칸(정수) */
export function schoolCell(route: SchoolRoute, nowMs: number): { x: number; y: number } {
  const position = schoolPosition(route, nowMs);
  return {
    x: Math.floor(position.x / SCHOOL_POSITION_SCALE),
    y: Math.floor(position.y / SCHOOL_POSITION_SCALE),
  };
}
