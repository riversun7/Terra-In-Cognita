// 프레임 시간 요약 — 순수 함수(시험 대상). 성능 오버레이와 텔레메트리가 같은 계산을 쓴다.
// S1 통과 기준(PLAN 11장): 프레임 시간 p95 ≤ 33ms

/** 이보다 오래 걸린 프레임은 끊김으로 센다(ms) */
export const LONG_FRAME_MS = 50;

export interface FrameSummary {
  frames: number;
  /** 잰 시간(ms) = 프레임 시간의 합. 화면이 숨겨진 시간은 들어가지 않는다 */
  elapsedMs: number;
  fps: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  longFrames: number;
}

/** 오름차순으로 정렬된 값에서 백분위(가장 가까운 순위 방식) */
function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

export function summarizeFrames(durations: readonly number[]): FrameSummary {
  // 숫자 배열(Float64Array)의 sort는 숫자 순서로 정렬하고, 새로 만든 사본이라 원본을 바꾸지 않는다.
  // toSorted(ES2023)는 오래된 휴대폰 브라우저(iOS 15 등)에 없어서 쓰지 않는다
  // oxlint-disable-next-line unicorn/no-array-sort
  const sorted = Float64Array.from(durations).sort();
  let elapsedMs = 0;
  let longFrames = 0;
  for (const duration of durations) {
    elapsedMs += duration;
    if (duration > LONG_FRAME_MS) longFrames += 1;
  }
  return {
    frames: durations.length,
    elapsedMs,
    fps: elapsedMs > 0 ? (durations.length * 1000) / elapsedMs : 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
    longFrames,
  };
}
