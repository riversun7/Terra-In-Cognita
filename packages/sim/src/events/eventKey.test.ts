import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { compareEventKeys, type EventKey } from "./eventKey.ts";
import { createEventQueue } from "./eventQueue.ts";

function drain(list: readonly { t: number; key: EventKey }[]): string[] {
  const queue = createEventQueue<EventKey>(compareEventKeys);
  for (const event of list) queue.schedule(event.t, event.key);
  return queue.popDue(100).map((event) => `${event.timeMs}:${event.payload.kind}:${event.payload.subject}`);
}

describe("같은 시각의 차례 키 (시각, 종류, 대상)", () => {
  it("같은 시각이면 넣은 차례와 상관없이 종류(문자 코드 순) → 대상 ID 차례다", () => {
    const queue = createEventQueue<EventKey>(compareEventKeys);
    queue.schedule(10, { kind: "wake", subject: 2 });
    queue.schedule(10, { kind: "arrive", subject: 9 });
    queue.schedule(5, { kind: "wake", subject: 7 });
    queue.schedule(10, { kind: "wake", subject: 1 });
    queue.schedule(10, { kind: "arrive", subject: 3 });
    expect(
      queue.popDue(100).map((event) => `${event.timeMs}:${event.payload.kind}:${event.payload.subject}`),
    ).toEqual(["5:wake:7", "10:arrive:3", "10:arrive:9", "10:wake:1", "10:wake:2"]);
  });

  it("종류는 지역 설정이 아니라 문자 코드 순서로 비교한다(대문자가 소문자 앞)", () => {
    expect(compareEventKeys({ kind: "Z", subject: 0 }, { kind: "a", subject: 0 })).toBeLessThan(0);
    expect(compareEventKeys({ kind: "a", subject: 0 }, { kind: "a", subject: 0 })).toBe(0);
  });

  it("키가 같으면 예약한 차례다", () => {
    const queue = createEventQueue<EventKey & { n: number }>(compareEventKeys);
    queue.schedule(1, { kind: "a", subject: 1, n: 1 });
    queue.schedule(1, { kind: "a", subject: 1, n: 2 });
    expect(queue.popDue(1).map((event) => event.payload.n)).toEqual([1, 2]);
  });

  it("넣는 차례를 섞어도 꺼내는 차례가 같다(다시 켜서 다시 걸어도 같은 순서)", () => {
    const events: { t: number; key: EventKey }[] = [];
    const rng = createRng(5);
    for (let i = 0; i < 500; i++)
      events.push({ t: rng.nextInt(20), key: { kind: rng.nextInt(2) === 0 ? "a" : "b", subject: i } });
    expect(drain(events.toReversed())).toEqual(drain(events));
  });
});
