import { describe, expect, it } from "vitest";
import {
  CYBORG_TEMPERAMENTS,
  PRIMARY_KEYS,
  TEST_CYBORG_CREATION,
  cyborgRollLimit,
  isCyborgTemperament,
  isInitialDistribution,
  rollGrowthK,
  rollInitialStats,
  temperamentWeights,
} from "./initialStats.ts";

const N9 = { sum: 60, min: 1, max: 20 } as const;
const SEEDS = Array.from({ length: 2000 }, (_, i) => (i * 2_654_435_761) >>> 0);

function sumOf(stats: Record<string, number>): number {
  return PRIMARY_KEYS.reduce((total, stat) => total + (stats[stat] ?? 0), 0);
}

describe("rollInitialStats", () => {
  it("성향마다 시드 2000개 모두 합 60, 칸마다 1~20 정수다", () => {
    for (const { id } of CYBORG_TEMPERAMENTS) {
      for (const seed of SEEDS) {
        const stats = rollInitialStats(seed, id, N9, TEST_CYBORG_CREATION);
        expect(sumOf(stats)).toBe(60);
        for (const stat of PRIMARY_KEYS) {
          expect(Number.isInteger(stats[stat])).toBe(true);
          expect(stats[stat]).toBeGreaterThanOrEqual(1);
          expect(stats[stat]).toBeLessThanOrEqual(20);
        }
        expect(isInitialDistribution(stats, N9)).toBe(true);
      }
    }
  });

  it("같은 시드면 같은 값, 다른 시드면 대체로 다른 값(결정적)", () => {
    const a = rollInitialStats(42, "combat", N9, TEST_CYBORG_CREATION);
    expect(rollInitialStats(42, "combat", N9, TEST_CYBORG_CREATION)).toEqual(a);
    const distinct = new Set(
      SEEDS.slice(0, 200).map((seed) =>
        JSON.stringify(rollInitialStats(seed, "combat", N9, TEST_CYBORG_CREATION)),
      ),
    );
    expect(distinct.size).toBeGreaterThan(150);
  });

  it("성향이 고른 스탯의 평균은 약 14, 나머지는 약 8, 균형은 모두 약 10이고 흩어짐은 약 3이다", () => {
    const mean = (id: string, stat: (typeof PRIMARY_KEYS)[number]) =>
      SEEDS.reduce((total, seed) => total + rollInitialStats(seed, id, N9, TEST_CYBORG_CREATION)[stat], 0) /
      SEEDS.length;
    expect(mean("combat", "str")).toBeCloseTo(14, 0);
    expect(mean("combat", "vit")).toBeCloseTo(14, 0);
    expect(mean("combat", "int")).toBeCloseTo(8, 0);
    expect(mean("tech", "int")).toBeCloseTo(14, 0);
    expect(mean("tech", "dex")).toBeCloseTo(14, 0);
    expect(mean("trade", "wis")).toBeCloseTo(14, 0);
    expect(mean("trade", "agi")).toBeCloseTo(8, 0);
    for (const stat of PRIMARY_KEYS) expect(mean("balanced", stat)).toBeCloseTo(10, 0);
    const values = SEEDS.map((seed) => rollInitialStats(seed, "balanced", N9, TEST_CYBORG_CREATION).agi);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((total, v) => total + (v - average) ** 2, 0) / values.length);
    expect(deviation).toBeGreaterThan(2.3);
    expect(deviation).toBeLessThan(3.5);
  });

  it("치우침·흩어짐은 계수(설정값)를 따른다", () => {
    const flat = { ...TEST_CYBORG_CREATION, favoredPm: 1000, otherPm: 1000, spreadMilli: 0 };
    expect(rollInitialStats(7, "combat", N9, flat)).toEqual({
      str: 10,
      dex: 10,
      agi: 10,
      vit: 10,
      int: 10,
      wis: 10,
    });
    const strong = { ...TEST_CYBORG_CREATION, favoredPm: 2000, otherPm: 500, spreadMilli: 0 };
    // 평균 = 60 × 2000 ÷ 6000 = 20, 나머지 = 60 × 500 ÷ 6000 = 5
    expect(rollInitialStats(7, "combat", N9, strong)).toEqual({
      str: 20,
      dex: 5,
      agi: 5,
      vit: 20,
      int: 5,
      wis: 5,
    });
  });

  it("다른 합·칸 범위(N9 설정값)도 지키고, 닿을 수 없는 범위·모르는 성향은 거절한다", () => {
    const range = { sum: 30, min: 2, max: 8 };
    for (const seed of SEEDS.slice(0, 300)) {
      const stats = rollInitialStats(seed, "tech", range, TEST_CYBORG_CREATION);
      expect(isInitialDistribution(stats, range)).toBe(true);
    }
    expect(() => rollInitialStats(1, "combat", { sum: 200, min: 1, max: 20 }, TEST_CYBORG_CREATION)).toThrow(
      RangeError,
    );
    expect(() => rollInitialStats(1, "combat", { sum: 60, min: 12, max: 20 }, TEST_CYBORG_CREATION)).toThrow(
      RangeError,
    );
    expect(() => rollInitialStats(1, "berserker", N9, TEST_CYBORG_CREATION)).toThrow(RangeError);
  });
});

describe("성향·굴림 상한", () => {
  it("성향은 넷이고(D-445 168), 처음 1번 + 다시 굴리기 3번 = 4번이다(D-445 169)", () => {
    expect(CYBORG_TEMPERAMENTS.map((entry) => entry.id)).toEqual(["balanced", "combat", "tech", "trade"]);
    expect(isCyborgTemperament("trade")).toBe(true);
    expect(isCyborgTemperament("berserker")).toBe(false);
    expect(temperamentWeights("berserker", TEST_CYBORG_CREATION)).toBeUndefined();
    expect(cyborgRollLimit(TEST_CYBORG_CREATION)).toBe(4);
    expect(cyborgRollLimit({ ...TEST_CYBORG_CREATION, rerolls: 0 })).toBe(1);
  });
});

describe("rollGrowthK", () => {
  it("여섯 K가 모두 N6 범위(800~1200‰) 안이고 양 끝에 닿을 수 있으며 결정적이다", () => {
    const range = { minPm: 800, maxPm: 1200 };
    let low = 1200;
    let high = 800;
    for (const seed of SEEDS) {
      const k = rollGrowthK(seed, range);
      for (const stat of PRIMARY_KEYS) {
        expect(k[stat]).toBeGreaterThanOrEqual(800);
        expect(k[stat]).toBeLessThanOrEqual(1200);
        low = Math.min(low, k[stat]);
        high = Math.max(high, k[stat]);
      }
    }
    expect(low).toBeLessThanOrEqual(801);
    expect(high).toBeGreaterThanOrEqual(1199);
    expect(rollGrowthK(9, range)).toEqual(rollGrowthK(9, range));
    expect(() => rollGrowthK(1, { minPm: 1200, maxPm: 800 })).toThrow(RangeError);
  });
});
