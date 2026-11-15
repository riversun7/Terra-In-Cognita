import { describe, expect, it } from "vitest";
import { type CommandUnits, sideParties, unitSlot } from "../../../battle/battleCommands.ts";
import { reportOrderOf } from "./watchOrders.ts";

/** 리플레이 유닛만 있는 가짜(파티 ID: 편 1 = 1·3, 편 2 = 2) */
const replay: CommandUnits = {
  units: [
    { id: 1, side: 1, party: 1 },
    { id: 2, side: 1, party: 1 },
    { id: 7, side: 1, party: 3 },
    { id: 102, side: 2, party: 2 },
    { id: 101, side: 2, party: 2 },
  ],
};

describe("전투맵 명령 → 보고서 명령(D-558 1546)", () => {
  it("편 파티는 ID 차례, 유닛 자리는 파티 안 ID 차례", () => {
    expect(sideParties(replay, 1)).toEqual([1, 3]);
    expect(unitSlot(replay, 3)).toEqual({ side: 2, party: 0, index: 1 });
    expect(unitSlot(replay, 4)).toEqual({ side: 2, party: 0, index: 0 });
    expect(unitSlot(replay, 9)).toBeNull();
  });

  it("받는 쪽·시각(초 버림)·목표·앞 파티·칸을 바꾼다", () => {
    expect(reportOrderOf({ atMs: 2900, party: null, order: { kind: "hold" } }, replay, 1)).toEqual({
      atSec: 2,
      party: -1,
      kind: "hold",
    });
    expect(reportOrderOf({ atMs: 0, party: 3, order: { kind: "attack", target: 3 } }, replay, 1)).toEqual({
      atSec: 0,
      party: 1,
      kind: "attack",
      target: { party: 0, index: 1 },
    });
    expect(reportOrderOf({ atMs: 1000, party: 3, order: { kind: "follow", leader: 1 } }, replay, 1)).toEqual({
      atSec: 1,
      party: 1,
      kind: "follow",
      leader: 0,
    });
    expect(
      reportOrderOf({ atMs: 0, party: null, order: { kind: "rally", cell: { x: 4, y: 9 } } }, replay, 1),
    ).toEqual({ atSec: 0, party: -1, kind: "rally", cell: { x: 4, y: 9 } });
    expect(
      reportOrderOf({ atMs: 0, party: 1, order: { kind: "tactic", tactic: "focus" } }, replay, 1),
    ).toEqual({ atSec: 0, party: 0, kind: "tactic", tactic: "focus" });
  });

  it("같은 편 목표·자기 자신 따라가기·다른 편 파티는 null", () => {
    expect(reportOrderOf({ atMs: 0, party: 1, order: { kind: "attack", target: 0 } }, replay, 1)).toBeNull();
    expect(reportOrderOf({ atMs: 0, party: 1, order: { kind: "follow", leader: 1 } }, replay, 1)).toBeNull();
    expect(reportOrderOf({ atMs: 0, party: 2, order: { kind: "hold" } }, replay, 1)).toBeNull();
  });
});
