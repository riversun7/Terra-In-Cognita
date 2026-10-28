// 받기 측정(최근 약 1초) — 2차맵 메시지 수·유닛 갱신 수·글자 수와 움직임 지연 중앙값. 순수 코드(시험 대상)
// S1 측정(휴대폰 + NAS)에서 HUD에 보인다. 스냅샷은 따로 센다(mapFeed.ts).

export interface FeedRates {
  /** 받은 2차맵 메시지(스냅샷 제외)·유닛 갱신·글자 수, 초당 */
  messagesPerSec: number;
  unitUpdatesPerSec: number;
  bytesPerSec: number;
  /** 받은 움직임의 늦음(받은 서버 시각 − 출발 시각) 중앙값(ms). 없으면 null */
  pathLagMs: number | null;
}

/** 이 간격이 지나면 다음 구간으로 넘어간다 */
export const RATE_WINDOW_MS = 1_000;
/** 구간마다 지연 표본 상한(메모리) */
const MAX_LAG_SAMPLES = 256;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
}

export interface FeedMeter {
  /** 메시지 하나(글자 수) */
  message(size: number): void;
  /** 유닛 갱신 하나와 그 늦음(ms) */
  update(lagMs: number): void;
  /** 지난 구간의 값(구간이 끝났으면 넘긴 뒤) */
  rates(): FeedRates;
}

export function createFeedMeter(now: () => number): FeedMeter {
  let start = now();
  let messages = 0;
  let updates = 0;
  let bytes = 0;
  let lags: number[] = [];
  let last: FeedRates = { messagesPerSec: 0, unitUpdatesPerSec: 0, bytesPerSec: 0, pathLagMs: null };

  const roll = (at: number): void => {
    const elapsed = at - start;
    if (elapsed < RATE_WINDOW_MS) return;
    last = {
      messagesPerSec: (messages * 1000) / elapsed,
      unitUpdatesPerSec: (updates * 1000) / elapsed,
      bytesPerSec: (bytes * 1000) / elapsed,
      pathLagMs: median(lags),
    };
    start = at;
    messages = 0;
    updates = 0;
    bytes = 0;
    lags = [];
  };

  return {
    message(size) {
      roll(now());
      messages += 1;
      bytes += size;
    },
    update(lagMs) {
      updates += 1;
      if (lags.length < MAX_LAG_SAMPLES) lags.push(lagMs);
    },
    rates() {
      roll(now());
      return last;
    },
  };
}
