// 엔진이 한 프레임에 쓴 시간(갱신 + 그리기, 화면 스레드 ms)을 모은다 — 성능 표시용.
// 화면 전체의 프레임 시간(requestAnimationFrame 간격)은 게임 앱의 프레임 측정기가 잰다(apps/game/src/perf/frameMonitor.ts).
// 이 값은 그중 엔진 몫이다. 최근 1초(최대 SAMPLE_LIMIT개)만 본다.

const WINDOW_MS = 1000;
const SAMPLE_LIMIT = 240;

export interface RenderTimingSummary {
  /** 최근 1초 동안 그린 프레임 수 */
  frames: number;
  /** 엔진 시간 p95(ms) */
  p95Ms: number;
  /** 엔진 시간 최댓값(ms) */
  maxMs: number;
}

export class RenderTimer {
  private readonly at = new Float64Array(SAMPLE_LIMIT);
  private readonly ms = new Float64Array(SAMPLE_LIMIT);
  private next = 0;
  private filled = 0;
  /** 지금까지 그린 프레임 수 */
  total = 0;

  record(nowMs: number, spentMs: number): void {
    this.at[this.next] = nowMs;
    this.ms[this.next] = spentMs;
    this.next = (this.next + 1) % SAMPLE_LIMIT;
    this.filled = Math.min(SAMPLE_LIMIT, this.filled + 1);
    this.total += 1;
  }

  summary(nowMs: number): RenderTimingSummary {
    const recent: number[] = [];
    for (let i = 0; i < this.filled; i++) {
      if (nowMs - (this.at[i] ?? 0) <= WINDOW_MS) recent.push(this.ms[i] ?? 0);
    }
    if (recent.length === 0) return { frames: 0, p95Ms: 0, maxMs: 0 };
    // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 배열이라 원본을 바꿔도 된다(toSorted는 사본을 한 번 더 만든다)
    recent.sort((a, b) => a - b);
    const rank = Math.min(recent.length, Math.max(1, Math.ceil(0.95 * recent.length)));
    return { frames: recent.length, p95Ms: recent[rank - 1] ?? 0, maxMs: recent[recent.length - 1] ?? 0 };
  }
}
