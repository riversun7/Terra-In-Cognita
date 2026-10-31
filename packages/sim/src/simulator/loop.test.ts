import { describe, expect, it } from "vitest";
import type { EventKey } from "../events/eventKey.ts";
import { type SimLoop, createSimLoop } from "./loop.ts";

type Ev = EventKey & { note?: string };

describe("가상 시계 실행 루프", () => {
  it("untilMs 전까지의 예약을 (시각, 종류, 대상) 차례로 처리하고, 처리 중 시계는 그 예약의 시각이다", () => {
    const seen: string[] = [];
    const loop = createSimLoop<Ev>({
      startMs: 100,
      handle: (event, sim) => seen.push(`${sim.nowMs}:${event.payload.kind}:${event.payload.subject}`),
    });
    loop.schedule(300, { kind: "b", subject: 1 });
    loop.schedule(200, { kind: "b", subject: 2 });
    loop.schedule(200, { kind: "a", subject: 9 });
    loop.schedule(400, { kind: "a", subject: 1 });
    expect(loop.runUntil(400)).toBe(3);
    expect(seen).toEqual(["200:a:9", "200:b:2", "300:b:1"]);
    // 끝나면 시계는 untilMs, 그 시각의 예약은 다음 차례로 남는다
    expect(loop.nowMs).toBe(400);
    expect(loop.pending).toBe(1);
    expect(loop.runUntil(401)).toBe(1);
    expect(loop.processed).toBe(4);
  });

  it("처리 중에 같은 시각이나 뒤에 건 예약도 같은 실행 안에서 차례대로 처리한다", () => {
    const seen: string[] = [];
    const loop: SimLoop<Ev> = createSimLoop<Ev>({
      startMs: 0,
      handle: (event, sim) => {
        seen.push(`${sim.nowMs}:${event.payload.kind}`);
        if (event.payload.kind === "go") {
          sim.schedule(sim.nowMs, { kind: "now", subject: 1 });
          sim.schedule(sim.nowMs + 5, { kind: "later", subject: 1 });
          sim.schedule(sim.nowMs + 50, { kind: "outside", subject: 1 });
        }
      },
    });
    loop.schedule(10, { kind: "go", subject: 1 });
    loop.runUntil(20);
    expect(seen).toEqual(["10:go", "10:now", "15:later"]);
    expect(loop.pending).toBe(1);
  });

  it("지난 시각에 예약하거나 시계를 되돌리면 거절한다(규칙 코드의 버그)", () => {
    const loop = createSimLoop<Ev>({ startMs: 1_000, handle: () => {} });
    expect(() => loop.schedule(999, { kind: "x", subject: 1 })).toThrow(RangeError);
    loop.runUntil(2_000);
    expect(() => loop.runUntil(1_500)).toThrow(RangeError);
  });

  it("처리 함수가 던지면 그대로 던진다(시뮬은 멈춰서 알린다)", () => {
    const loop = createSimLoop<Ev>({
      startMs: 0,
      handle: () => {
        throw new Error("rule bug");
      },
    });
    loop.schedule(1, { kind: "x", subject: 1 });
    expect(() => loop.runUntil(10)).toThrow("rule bug");
  });

  it("취소한 예약은 처리하지 않는다", () => {
    const seen: number[] = [];
    const loop = createSimLoop<Ev>({ startMs: 0, handle: (event) => seen.push(event.payload.subject) });
    const first = loop.schedule(5, { kind: "x", subject: 1 });
    loop.schedule(6, { kind: "x", subject: 2 });
    expect(loop.cancel(first)).toBe(true);
    loop.runUntil(10);
    expect(seen).toEqual([2]);
  });
});
