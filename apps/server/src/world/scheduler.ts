// 예약 이벤트 실행기 — packages/sim 이벤트 큐 + 서버 타이머 하나 (시뮬레이션 ADR "이벤트 예약")
// 도착·쉬기 끝 같은 일은 그 시각에만 처리한다. 타이머는 가장 이른 이벤트 시각에 하나만 걸어 둔다.
// 이벤트 루프가 밀리면 늦게 처리될 수 있다. 위치는 경로에서 계산하므로 늦어도 위치가 틀리지는 않는다.
import { type ScheduledEvent, createEventQueue } from "@terra/sim";

/** setTimeout 지연 상한(약 24.8일). 더 먼 이벤트는 깨어나서 다시 건다 */
const MAX_TIMER_MS = 0x7fff_ffff;

export interface Scheduler<T> {
  readonly size: number;
  /** 시각 timeMs(서버 ms 정수)에 payload를 처리하게 예약한다. 예약 번호를 돌려준다 */
  schedule(timeMs: number, payload: T): number;
  cancel(id: number): boolean;
  stop(): void;
}

export function createScheduler<T>(options: {
  now: () => number;
  handle: (event: ScheduledEvent<T>) => void;
  /** 처리 중 오류(이벤트 하나가 실패해도 나머지는 계속) */
  onError: (error: unknown) => void;
}): Scheduler<T> {
  const queue = createEventQueue<T>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let armedAt: number | undefined;
  let stopped = false;

  const arm = (): void => {
    if (stopped) return;
    const next = queue.peekTime();
    if (next === undefined) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      armedAt = undefined;
      return;
    }
    // 이미 같은 때나 더 이른 때에 걸려 있으면 그대로 둔다
    if (timer && armedAt !== undefined && armedAt <= next) return;
    if (timer) clearTimeout(timer);
    armedAt = next;
    timer = setTimeout(fire, Math.min(MAX_TIMER_MS, Math.max(0, next - options.now())));
    timer.unref();
  };

  const fire = (): void => {
    timer = undefined;
    armedAt = undefined;
    const now = options.now();
    for (let event = queue.popNext(now); event; event = queue.popNext(now)) {
      try {
        options.handle(event);
      } catch (error) {
        options.onError(error);
      }
    }
    arm();
  };

  return {
    get size() {
      return queue.size;
    },
    schedule(timeMs, payload) {
      const id = queue.schedule(timeMs, payload);
      arm();
      return id;
    },
    cancel(id) {
      return queue.cancel(id);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
