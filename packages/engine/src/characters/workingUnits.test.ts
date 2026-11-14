import { describe, expect, it } from "vitest";
import { WorkingUnits } from "./workingUnits.ts";

const slotOf = (id: number): number => (id === 10 ? 0 : id === 30 ? 2 : -1);

describe("WorkingUnits", () => {
  it("유닛 ID를 칸 표시로 바꾸고, 없는 유닛·범위 밖 칸은 건너뛴다", () => {
    const working = new WorkingUnits(4);
    expect(working.slots(4, () => 0)).toBeUndefined();
    working.set([10, 30, 99]);
    expect([...(working.slots(4, slotOf) ?? [])]).toEqual([1, 0, 1, 0]);
    // 목록을 바꾸면 앞 표시는 지운다
    working.set([30]);
    expect([...(working.slots(4, slotOf) ?? [])]).toEqual([0, 0, 1, 0]);
    working.set([]);
    expect(working.slots(4, slotOf)).toBeUndefined();
  });
});
