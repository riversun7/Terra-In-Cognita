// 생성기 공용 계산 — 사칙연산과 명세가 정한 Math 함수만 쓴다
import { type PlanetGrid, areaOf } from "./grid.ts";

/** 실제 환산 지구 반지름(km). 거리 상수를 km로 적으려고 쓴다(각도 = km ÷ 이 값) — 행성 크기와 무관한 기준이다 */
export const REFERENCE_RADIUS_KM = 6371.0088;

/** 실제 환산 km → 구 위 각도(라디안) */
export function km(value: number): number {
  return value / REFERENCE_RADIUS_KM;
}

/** 0(edge0 이하) ~ 1(edge1 이상) 사이를 3t² − 2t³로 잇는다 */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 히스토그램 칸 수 (면적 백분위의 분해능: 값 범위의 1/65536) */
const PERCENTILE_BINS = 65_536;

/**
 * 면적 백분위: 값이 그 이하인 칸들의 면적이 전체의 fraction이 되는 값.
 * 히스토그램(65536칸)으로 칸을 찾고 그 안에서는 면적을 고르게 나눠 잇는다(정렬 없이, 결정적).
 * @param include 셀 일부만 볼 때(없으면 모두)
 */
export function areaPercentile(
  grid: PlanetGrid,
  values: Float32Array,
  fraction: number,
  include?: (c: number) => boolean,
): number {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let c = 0; c < grid.cellCount; c++) {
    if (include && !include(c)) continue;
    const v = values[c] ?? 0;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!(max > min)) return min;
  const span = max - min;
  const histogram = new Float64Array(PERCENTILE_BINS);
  let total = 0;
  for (let c = 0; c < grid.cellCount; c++) {
    if (include && !include(c)) continue;
    const bin = Math.min(
      PERCENTILE_BINS - 1,
      Math.floor((((values[c] ?? 0) - min) / span) * PERCENTILE_BINS),
    );
    const area = areaOf(grid, c);
    histogram[bin] = (histogram[bin] ?? 0) + area;
    total += area;
  }
  const target = clamp(fraction, 0, 1) * total;
  let below = 0;
  for (let bin = 0; bin < PERCENTILE_BINS; bin++) {
    const inside = histogram[bin] ?? 0;
    if (below + inside >= target && inside > 0) {
      const within = (target - below) / inside;
      return min + ((bin + within) / PERCENTILE_BINS) * span;
    }
    below += inside;
  }
  return max;
}
