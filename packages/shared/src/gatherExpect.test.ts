// 예상 채집 확률표 시험 — gatherExpect.ts(D-534). 확률표는 팩 core@76 gather_tiers와 같은 값(T9 200~219 드물게, 220부터 늘어남)
import { describe, expect, it } from "vitest";
import {
  GATHER_EXPECT_LEVELS,
  GATHER_EXPECT_SUMS,
  type GatherExpectInput,
  expectKSteps,
  expectedGatherCell,
  expectedGatherTable,
  splitStatSum,
} from "./gatherExpect.ts";
import type { GatherBand } from "./gatherMath.ts";

const BANDS: GatherBand[] = [
  { from: 0, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 20, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 40, weightsPm: [650, 220, 100, 30, 0, 0, 0, 0, 0, 0] },
  { from: 60, weightsPm: [530, 260, 140, 60, 10, 0, 0, 0, 0, 0] },
  { from: 80, weightsPm: [430, 290, 170, 80, 25, 5, 0, 0, 0, 0] },
  { from: 100, weightsPm: [350, 280, 200, 110, 40, 15, 5, 0, 0, 0] },
  { from: 120, weightsPm: [290, 260, 210, 140, 60, 25, 10, 5, 0, 0] },
  { from: 140, weightsPm: [250, 230, 200, 160, 90, 40, 17, 9, 4, 0] },
  { from: 160, weightsPm: [223, 210, 200, 170, 110, 50, 23, 10, 4, 0] },
  { from: 180, weightsPm: [204, 200, 190, 170, 120, 60, 35, 15, 6, 0] },
  { from: 200, weightsPm: [188, 190, 180, 160, 130, 80, 45, 20, 5, 2] },
  { from: 220, weightsPm: [180, 175, 165, 155, 130, 85, 45, 30, 20, 15] },
  { from: 240, weightsPm: [160, 165, 160, 150, 130, 90, 55, 35, 30, 25] },
  { from: 260, weightsPm: [140, 155, 155, 150, 130, 95, 60, 45, 35, 35] },
];

const BASE: GatherExpectInput = {
  bands: BANDS,
  growthPm: 100,
  kMinPm: 800,
  kMaxPm: 1200,
  levelBonus: 10,
  facilityLevel: 1,
  condition: 0,
};

describe("줄·칸·K 점", () => {
  it("기본 줄은 15·15(30)·18·18(36)을 담고, 칸은 레벨 1·20·40·50·60", () => {
    expect(GATHER_EXPECT_SUMS).toContain(30);
    expect(GATHER_EXPECT_SUMS).toContain(36);
    expect(GATHER_EXPECT_LEVELS).toEqual([1, 20, 40, 50, 60]);
    expect(splitStatSum(36)).toEqual([18, 18]);
    expect(splitStatSum(31)).toEqual([16, 15]);
    expect(expectKSteps(800, 1200)).toEqual([800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200]);
    expect(expectKSteps(1000, 1000)).toEqual([1000]);
  });
});

describe("칸 하나(판정과 같은 성장·유효 스탯·구간)", () => {
  it("18·18 만렙 50: K 0.8~1.2 → 유효 스탯 176~246, 확률 합 1000", () => {
    const cell = expectedGatherCell(36, 50, BASE);
    expect([cell.statMin, cell.statMax]).toEqual([176, 246]);
    expect(cell.tierPm.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(cell.tierPm[9]).toBeGreaterThan(0);
  });

  it("15·15 만렙 50은 컨디션 없이 T9가 없고, 컨디션 +40이면 T9 구간에 닿는다(D-534 원문)", () => {
    const plain = expectedGatherCell(30, 50, BASE);
    expect(plain.statMax).toBeLessThan(220);
    const managed = expectedGatherCell(30, 50, { ...BASE, condition: 40 });
    expect(managed.statMin).toBe(plain.statMin + 40);
    expect(managed.tierPm[9]).toBeGreaterThan(plain.tierPm[9] ?? 0);
    expect(managed.averageTierMilli).toBeGreaterThan(plain.averageTierMilli);
  });

  it("레벨 1은 성장이 없고 시설 레벨 보너스가 더해진다", () => {
    expect(expectedGatherCell(30, 1, BASE)).toMatchObject({ statMin: 30, statMax: 30 });
    expect(expectedGatherCell(30, 1, { ...BASE, facilityLevel: 5 })).toMatchObject({
      statMin: 70,
      statMax: 70,
    });
  });

  it("표는 줄 × 칸", () => {
    const table = expectedGatherTable(BASE);
    expect(table).toHaveLength(GATHER_EXPECT_SUMS.length);
    expect(table[0]).toHaveLength(GATHER_EXPECT_LEVELS.length);
  });
});
