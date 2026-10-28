// 필요할 때만 그리는 프레임 예약 — 화면 변화가 없으면 그리기를 멈춘다(PLAN 5.7).
// request()는 "한 번 더 그려 달라"다. 그리는 함수(onFrame)가 true를 돌려주면(유닛이 가는 중, 카메라가 움직이는 중) 다음 프레임도 예약한다.
// 컨텍스트를 잃었을 때·화면을 닫을 때는 pause()·stop()으로 멈춘다. 숨겨진 탭은 브라우저가 requestAnimationFrame을 멈춘다.

export interface FrameSource {
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (handle: number) => void;
}

/** 한 프레임 간격의 상한(ms) — 숨겨졌다 돌아온 첫 프레임 등에서 시간이 크게 튀지 않게 */
const MAX_DELTA_MS = 100;

export class FrameScheduler {
  private handle: number | null = null;
  private paused = false;
  private stopped = false;
  /** 멈춘 동안 그려 달라는 요청이 있었나 */
  private wanted = false;
  private lastTime: number | null = null;
  private readonly onFrame: (time: number, deltaMs: number) => boolean;
  private readonly source: FrameSource;

  constructor(onFrame: (time: number, deltaMs: number) => boolean, source?: FrameSource) {
    this.onFrame = onFrame;
    this.source = source ?? {
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
    };
  }

  /** 지금 예약된 프레임이 있나(시험·통계용) */
  get scheduled(): boolean {
    return this.handle !== null;
  }

  request(): void {
    if (this.stopped) return;
    if (this.paused) {
      this.wanted = true;
      return;
    }
    if (this.handle !== null) return;
    this.handle = this.source.requestFrame(this.tick);
  }

  /** 잠시 멈춘다(컨텍스트 손실). 그동안 들어온 요청은 resume() 때 한 번 그린다 */
  pause(): void {
    this.paused = true;
    this.cancel();
  }

  /** 다시 그린다(멈춘 동안 화면이 바뀌었을 수 있어 늘 한 번은 그린다) */
  resume(): void {
    if (this.stopped) return;
    this.paused = false;
    this.wanted = false;
    this.lastTime = null;
    this.request();
  }

  stop(): void {
    this.stopped = true;
    this.cancel();
  }

  private cancel(): void {
    if (this.handle !== null) this.source.cancelFrame(this.handle);
    this.handle = null;
  }

  private readonly tick = (time: number): void => {
    this.handle = null;
    if (this.paused || this.stopped) return;
    const delta = this.lastTime === null ? 0 : Math.min(MAX_DELTA_MS, Math.max(0, time - this.lastTime));
    const again = this.onFrame(time, delta);
    if (again) {
      this.lastTime = time;
      this.request();
    } else {
      // 멈췄다가 다시 그릴 때 첫 간격은 0으로 본다(멈춘 시간을 움직임에 넣지 않는다)
      this.lastTime = null;
    }
  };
}
