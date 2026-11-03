// 시설 건설 식 시험 — 옛 seeds/building_seed.js의 값과 맞춰 본다(49 M14, D-508)
import { describe, expect, it } from "vitest";
import {
  type FacilityBuildJson,
  OLD_FACILITY_BUILD_RULES,
  buildCostAt,
  buildLevelAt,
  buildTimeAt,
} from "./facilityBuild.ts";

/** 옛 광산(raw {WOOD 12, STONE 10}, PRIMARY 0.8)을 Lv1 원자재·Lv2부터 가공품으로 나눈 것 */
const MINE: FacilityBuildJson = {
  mulPm: 800,
  levels: [
    {
      from: 1,
      materials: [
        { item: "pine_log", qty: 12 },
        { item: "stone", qty: 10 },
      ],
    },
    {
      from: 2,
      materials: [
        { item: "plank", qty: 12 },
        { item: "brick", qty: 10 },
      ],
    },
  ],
};

const WEIGHTS: Readonly<Record<string, number>> = { pine_log: 2000, stone: 1000, plank: 1000, brick: 1500 };
const weightOf = (item: string): number | undefined => WEIGHTS[item];

describe("시설 건설 식(49 M14)", () => {
  it("레벨마다 from ≤ L인 마지막 구간을 쓴다", () => {
    expect(buildLevelAt(MINE, 1)?.from).toBe(1);
    expect(buildLevelAt(MINE, 2)?.from).toBe(2);
    expect(buildLevelAt(MINE, 5)?.from).toBe(2);
    expect(buildLevelAt({ mulPm: 800, levels: [{ from: 2, materials: [] }] }, 1)).toBeUndefined();
  });

  it("재료 = 줄마다 round(qty × L² × mulPm ÷ 1000), 옛 Math.round(amount × tier² × 배율)과 같다", () => {
    expect(buildCostAt(MINE, 1)).toEqual([
      { item: "pine_log", qty: 10 },
      { item: "stone", qty: 8 },
    ]);
    expect(buildCostAt(MINE, 2)).toEqual([
      { item: "plank", qty: 38 },
      { item: "brick", qty: 32 },
    ]);
    // 옛 줄마다 반올림(실수 식)과 맞춰 본다: 반은 올린다
    for (const qty of [1, 5, 7, 12, 15, 999])
      for (const level of [1, 2, 3, 4, 5])
        for (const mulPm of [800, 1000, 1200, 1500, 3000]) {
          const [stack] = buildCostAt(
            { mulPm, levels: [{ from: 1, materials: [{ item: "x", qty }] }] },
            level,
          );
          expect(stack?.qty).toBe(Math.round((qty * level * level * mulPm) / 1000));
        }
  });

  it("시간 = 무게 합(kg) × L² × 배율 × kg당 ms × 레벨 계수, 무게를 모르는 아이템은 0으로 셈하고 알린다", () => {
    // Lv1: (2kg × 12 + 1kg × 10) × 0.8 = 27.2kg × 10초 × 1.0 = 272초
    expect(buildTimeAt(MINE, 1, weightOf, OLD_FACILITY_BUILD_RULES)).toEqual({
      ms: 272_000,
      unknownWeight: [],
    });
    // Lv3: (1kg × 12 + 1.5kg × 10) × 9 × 0.8 = 194.4kg × 10초 × 2.5 = 4,860초
    expect(buildTimeAt(MINE, 3, weightOf, OLD_FACILITY_BUILD_RULES).ms).toBe(4_860_000);
    const unknown = buildTimeAt(
      MINE,
      2,
      (item) => (item === "plank" ? 1000 : undefined),
      OLD_FACILITY_BUILD_RULES,
    );
    expect(unknown).toEqual({ ms: Math.round(12 * 4 * 0.8 * 10_000 * 1.5), unknownWeight: ["brick"] });
  });

  it("큰 값도 정수로 넘치지 않는다(BigInt)", () => {
    const huge: FacilityBuildJson = {
      mulPm: 100_000,
      levels: [{ from: 1, materials: [{ item: "x", qty: 1_000_000 }] }],
    };
    expect(buildCostAt(huge, 5)).toEqual([{ item: "x", qty: 2_500_000_000 }]);
    expect(buildTimeAt(huge, 5, () => 1000, OLD_FACILITY_BUILD_RULES).ms).toBe(62_500_000_000_000);
  });
});
