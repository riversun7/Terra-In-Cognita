// 예약 이벤트 큐 (시뮬레이션 ADR "이벤트 예약": 도착 같은 일은 그 시각에만 처리한다)
// - 순서: (시각, 예약 번호). 같은 시각이면 먼저 예약한 것이 먼저다. 같은 입력이면 항상 같은 순서다.
// - 취소는 지연 삭제: 살아 있는 목록에서만 지우고, 힙의 항목은 꺼낼 때 버린다.
//   취소가 쌓여 힙이 살아 있는 수의 2배를 넘으면 살아 있는 항목만으로 다시 만든다.
// - 예약 번호는 큐마다 1부터 센다. 서버를 다시 켜서 이벤트를 다시 걸 때 같은 시각끼리의 순서를 지키려면
//   정해진 순서(예: 시각, 유닛 ID)로 다시 예약한다.

export interface ScheduledEvent<T> {
  /** 예약 번호(취소할 때 쓴다) */
  readonly id: number;
  /** 처리할 시각(서버 ms) */
  readonly timeMs: number;
  readonly payload: T;
}

export interface EventQueue<T> {
  /** 취소되지 않고 남은 이벤트 수 */
  readonly size: number;
  /** 예약하고 예약 번호를 돌려준다 */
  schedule(timeMs: number, payload: T): number;
  /** 아직 꺼내지 않은 이벤트를 취소한다. 취소했으면 true */
  cancel(id: number): boolean;
  /** 가장 이른 이벤트의 시각. 없으면 undefined */
  peekTime(): number | undefined;
  /** 시각 nowMs까지 된 이벤트 하나를 꺼낸다. 처리 중에 새로 예약한 이벤트도 순서대로 나온다 */
  popNext(nowMs: number): ScheduledEvent<T> | undefined;
  /** 시각 nowMs까지 된 이벤트를 모두 순서대로 꺼낸다 */
  popDue(nowMs: number): ScheduledEvent<T>[];
}

/** 이 크기보다 작은 힙은 다시 만들지 않는다 */
const COMPACT_MIN = 64;

function before<T>(a: ScheduledEvent<T>, b: ScheduledEvent<T>): boolean {
  return a.timeMs < b.timeMs || (a.timeMs === b.timeMs && a.id < b.id);
}

export function createEventQueue<T>(): EventQueue<T> {
  let heap: ScheduledEvent<T>[] = [];
  const live = new Map<number, ScheduledEvent<T>>();
  let nextId = 1;

  const siftUp = (start: number): void => {
    const item = heap[start];
    if (!item) return;
    let hole = start;
    while (hole > 0) {
      const parent = (hole - 1) >> 1;
      const above = heap[parent];
      if (!above || !before(item, above)) break;
      heap[hole] = above;
      hole = parent;
    }
    heap[hole] = item;
  };

  const siftDown = (start: number): void => {
    const item = heap[start];
    if (!item) return;
    let hole = start;
    for (;;) {
      let child = hole * 2 + 1;
      const left = heap[child];
      if (!left) break;
      const right = heap[child + 1];
      let smaller = left;
      if (right && before(right, left)) {
        child++;
        smaller = right;
      }
      if (!before(smaller, item)) break;
      heap[hole] = smaller;
      hole = child;
    }
    heap[hole] = item;
  };

  const removeTop = (): void => {
    const last = heap.pop();
    if (last && heap.length > 0) {
      heap[0] = last;
      siftDown(0);
    }
  };

  // 맨 앞의 취소된 항목을 버린다
  const settleTop = (): ScheduledEvent<T> | undefined => {
    for (let top = heap[0]; top; top = heap[0]) {
      if (live.has(top.id)) return top;
      removeTop();
    }
    return undefined;
  };

  const compact = (): void => {
    heap = [...live.values()];
    for (let i = (heap.length >> 1) - 1; i >= 0; i--) siftDown(i);
  };

  const popNext = (nowMs: number): ScheduledEvent<T> | undefined => {
    const top = settleTop();
    if (!top || top.timeMs > nowMs) return undefined;
    removeTop();
    live.delete(top.id);
    return top;
  };

  return {
    get size() {
      return live.size;
    },
    schedule(timeMs, payload) {
      if (!Number.isSafeInteger(timeMs)) throw new RangeError(`event time must be a safe integer: ${timeMs}`);
      const event = { id: nextId++, timeMs, payload };
      live.set(event.id, event);
      heap.push(event);
      siftUp(heap.length - 1);
      return event.id;
    },
    cancel(id) {
      if (!live.delete(id)) return false;
      if (heap.length > COMPACT_MIN && heap.length > live.size * 2) compact();
      return true;
    },
    peekTime() {
      return settleTop()?.timeMs;
    },
    popNext,
    popDue(nowMs) {
      const due: ScheduledEvent<T>[] = [];
      for (let event = popNext(nowMs); event; event = popNext(nowMs)) due.push(event);
      return due;
    },
  };
}
