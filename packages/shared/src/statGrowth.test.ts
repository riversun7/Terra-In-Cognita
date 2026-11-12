// 1차 스탯 성장·초기 합 상한 시험 — statGrowth.ts(D-417·D-534)
import { describe, expect, it } from "vitest";
import { STAT_SUM_ABSOLUTE_MAX, capStatSum, primaryAtLevel, statSum } from "./statGrowth.ts";

describe("성장(D-417)", () => {
  it("초기 × (1 + 0.1 × K × (Lv − 1)), 정수: 18 → Lv50 K1.0 = 106, 15 → 88", () => {
    expect(primaryAtLevel(18, 100, 1000, 1)).toBe(18);
    expect(primaryAtLevel(18, 100, 1000, 50)).toBe(106);
    expect(primaryAtLevel(15, 100, 1000, 50)).toBe(88);
    expect(primaryAtLevel(18, 100, 1200, 50)).toBe(123);
  });
});

describe("초기 합 상한(D-534)", () => {
  it("절대 상한은 100이다", () => {
    expect(STAT_SUM_ABSOLUTE_MAX).toBe(100);
  });

  it("합이 상한 이하면 그대로, 넘으면 칸 비례로 줄인다(가장 큰 나머지)", () => {
    expect(capStatSum([10, 10, 10, 10, 10, 10], 80)).toEqual([10, 10, 10, 10, 10, 10]);
    const capped = capStatSum([17, 20, 23, 34, 41, 48], 100);
    expect(statSum(capped)).toBe(100);
    expect(capped).toEqual([9, 11, 13, 19, 22, 26]);
  });

  it("상한은 100을 넘지 못하고, 음수·정수 아닌 칸은 0", () => {
    expect(statSum(capStatSum([50, 50, 50], 1000))).toBe(100);
    expect(capStatSum([5, -2, 1.5], 100)).toEqual([5, 0, 0]);
  });
});
