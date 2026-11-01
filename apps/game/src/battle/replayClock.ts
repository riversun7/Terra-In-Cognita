// 다시보기 시계 — 재생·멈춤·배속·찾기·처음부터. docs/adr/2026-11-01-battle-replay.md 7절.
// 엔진 덧그림 층의 before(시각)에서 tick(지금)을 부른다(그리는 프레임과 같은 차례). 숨긴 탭에서 돌아오면 한 번에 크게 뛰지 않게
// 한 프레임 간격을 자른다. 끝에 닿으면 멈춘다. 순수 계산이라 시험한다(replayClock.test.ts).

/** 고를 수 있는 배속 */
export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
/** 한 프레임에 넘길 수 있는 실제 시간(ms) */
const MAX_FRAME_MS = 250;

export class ReplayClock {
  readonly endMs: number;
  timeMs = 0;
  playing = false;
  speed: ReplaySpeed = 1;
  private last: number | null = null;

  constructor(endMs: number) {
    this.endMs = Math.max(0, endMs);
  }

  /** 지금(ms, performance.now 시계)까지 민다. 재생 중이면 true(다음 프레임도 그린다) */
  tick(now: number): boolean {
    if (!this.playing) {
      this.last = null;
      return false;
    }
    if (this.last !== null) {
      const elapsed = Math.min(MAX_FRAME_MS, Math.max(0, now - this.last));
      this.timeMs = Math.min(this.endMs, this.timeMs + elapsed * this.speed);
    }
    this.last = now;
    if (this.timeMs >= this.endMs) {
      this.playing = false;
      this.last = null;
    }
    return this.playing;
  }

  /** 재생(끝에 있으면 처음부터) */
  play(): void {
    if (this.timeMs >= this.endMs) this.timeMs = 0;
    this.playing = true;
    this.last = null;
  }

  pause(): void {
    this.playing = false;
    this.last = null;
  }

  seek(ms: number): void {
    this.timeMs = Math.min(this.endMs, Math.max(0, Number.isFinite(ms) ? ms : 0));
    this.last = null;
  }

  restart(): void {
    this.seek(0);
    this.play();
  }

  setSpeed(speed: ReplaySpeed): void {
    this.speed = speed;
  }
}

/** 시각(ms) → "m:ss" */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}
