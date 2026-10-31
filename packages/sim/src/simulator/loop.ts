// 가상 시계 실행 루프 — docs/adr/2026-10-31-rules-simulator.md
// 서버와 같은 예약 큐를 같은 차례 키((시각, 종류, 대상), events/eventKey.ts)로 비운다. 타이머도 실제 시각도 쓰지 않는다:
// 시계는 꺼낸 예약의 시각으로 건너뛴다. 그래서 일어나는 일의 수만큼만 계산한다(시뮬레이션 ADR "이벤트 예약").
// 서버는 같은 큐를 실제 타이머로 돈다(apps/server/src/world/scheduler.ts). 처리 함수가 던지면 멈춘다(시뮬은 숨기지 않는다).
import { type EventKey, compareEventKeys } from "../events/eventKey.ts";
import { type ScheduledEvent, createEventQueue } from "../events/eventQueue.ts";

export interface SimLoop<T extends EventKey> {
  /** 가상 시계(ms). 처리 중에는 그 예약의 시각, runUntil이 끝나면 untilMs */
  readonly nowMs: number;
  /** 처리한 예약 수(누적) */
  readonly processed: number;
  /** 남은 예약 수 */
  readonly pending: number;
  /** timeMs(≥ 지금)에 예약한다. 예약 번호를 돌려준다 */
  schedule(timeMs: number, payload: T): number;
  cancel(id: number): boolean;
  /** 시각이 untilMs보다 이른 예약을 차례로 처리하고 시계를 untilMs로 둔다. 이번에 처리한 수 */
  runUntil(untilMs: number): number;
}

export function createSimLoop<T extends EventKey>(options: {
  startMs: number;
  handle: (event: ScheduledEvent<T>, loop: SimLoop<T>) => void;
}): SimLoop<T> {
  const queue = createEventQueue<T>(compareEventKeys);
  let nowMs = options.startMs;
  let processed = 0;
  const loop: SimLoop<T> = {
    get nowMs() {
      return nowMs;
    },
    get processed() {
      return processed;
    },
    get pending() {
      return queue.size;
    },
    schedule(timeMs, payload) {
      if (timeMs < nowMs) throw new RangeError(`cannot schedule in the past: ${timeMs} < ${nowMs}`);
      return queue.schedule(timeMs, payload);
    },
    cancel(id) {
      return queue.cancel(id);
    },
    runUntil(untilMs) {
      if (!Number.isSafeInteger(untilMs) || untilMs < nowMs)
        throw new RangeError(`clock cannot go back: ${untilMs} < ${nowMs}`);
      let count = 0;
      for (let event = queue.popNext(untilMs - 1); event; event = queue.popNext(untilMs - 1)) {
        nowMs = event.timeMs;
        processed += 1;
        count += 1;
        options.handle(event, loop);
      }
      nowMs = untilMs;
      return count;
    },
  };
  return loop;
}
