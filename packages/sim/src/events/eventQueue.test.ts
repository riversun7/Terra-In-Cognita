import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { createEventQueue } from "./eventQueue.ts";

const payloads = <T>(events: readonly { payload: T }[]) => events.map((event) => event.payload);

describe("이벤트 큐", () => {
  it("시각 순서, 같은 시각이면 예약한 순서로 꺼낸다", () => {
    const queue = createEventQueue<string>();
    queue.schedule(30, "a");
    queue.schedule(10, "b");
    queue.schedule(20, "c");
    queue.schedule(10, "d");
    expect(payloads(queue.popDue(100))).toEqual(["b", "d", "c", "a"]);
    expect(queue.size).toBe(0);
  });

  it("주어진 시각까지 된 것만 꺼내고 나머지는 남긴다", () => {
    const queue = createEventQueue<string>();
    queue.schedule(5, "early");
    queue.schedule(10, "edge");
    queue.schedule(11, "late");
    expect(payloads(queue.popDue(10))).toEqual(["early", "edge"]);
    expect(queue.size).toBe(1);
    expect(queue.peekTime()).toBe(11);
    expect(queue.popDue(10)).toEqual([]);
    expect(payloads(queue.popDue(11))).toEqual(["late"]);
    expect(queue.peekTime()).toBeUndefined();
  });

  it("취소한 이벤트는 나오지 않는다(지연 삭제)", () => {
    const queue = createEventQueue<string>();
    const first = queue.schedule(10, "first");
    const second = queue.schedule(10, "second");
    queue.schedule(20, "third");
    expect(queue.cancel(first)).toBe(true);
    expect(queue.cancel(first)).toBe(false);
    expect(queue.cancel(9999)).toBe(false);
    expect(queue.size).toBe(2);
    expect(queue.peekTime()).toBe(10);
    expect(queue.popDue(15)).toEqual([{ id: second, timeMs: 10, payload: "second" }]);
    // 이미 꺼낸 이벤트는 취소할 수 없다
    expect(queue.cancel(second)).toBe(false);
  });

  it("처리 중에 예약한 이벤트도 순서대로 이어서 꺼낸다(popNext)", () => {
    const queue = createEventQueue<string>();
    queue.schedule(10, "arrive");
    queue.schedule(30, "later");
    const handled: string[] = [];
    for (let event = queue.popNext(25); event; event = queue.popNext(25)) {
      handled.push(event.payload);
      if (event.payload === "arrive") queue.schedule(20, "next-leg");
    }
    expect(handled).toEqual(["arrive", "next-leg"]);
    expect(queue.size).toBe(1);
  });

  it("예약·취소를 많이 섞어도 정렬 기준과 같은 순서다", () => {
    const rng = createRng(77);
    const queue = createEventQueue<number>();
    const live = new Map<number, { id: number; timeMs: number; payload: number }>();
    for (let i = 0; i < 5000; i++) {
      const timeMs = rng.nextInt(2000);
      const id = queue.schedule(timeMs, i);
      live.set(id, { id, timeMs, payload: i });
      // 약 70%를 취소한다(경로가 바뀌면 옛 도착 이벤트를 취소하는 상황)
      if (rng.nextInt(10) < 7) {
        const victim = 1 + rng.nextInt(id);
        if (queue.cancel(victim)) live.delete(victim);
      }
    }
    expect(queue.size).toBe(live.size);
    const expected = [...live.values()].toSorted((a, b) => a.timeMs - b.timeMs || a.id - b.id);
    const popped = [...queue.popDue(700), ...queue.popDue(1400), ...queue.popDue(5000)];
    expect(popped).toEqual(expected);
  });

  it("틀린 시각은 거부한다", () => {
    const queue = createEventQueue<string>();
    expect(() => queue.schedule(1.5, "x")).toThrow(RangeError);
    expect(() => queue.schedule(Number.NaN, "x")).toThrow(RangeError);
    expect(() => queue.schedule(2 ** 60, "x")).toThrow(RangeError);
  });
});
