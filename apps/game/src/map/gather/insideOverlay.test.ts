import { describe, expect, it } from "vitest";
import { insideCounts } from "./insideOverlay.ts";

describe("건물 안 유닛 수", () => {
  it("건물마다 머무는 수와 내 유닛이 있는지 센다", () => {
    const counts = insideCounts([
      { unitId: 1, buildingId: 10, own: false },
      { unitId: 2, buildingId: 10, own: true },
      { unitId: 3, buildingId: 20, own: false },
    ]);
    expect(counts.get(10)).toEqual({ count: 2, own: true });
    expect(counts.get(20)).toEqual({ count: 1, own: false });
    expect(counts.has(30)).toBe(false);
    expect(insideCounts([]).size).toBe(0);
  });
});
