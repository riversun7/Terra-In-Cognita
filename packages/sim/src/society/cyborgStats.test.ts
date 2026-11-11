import { type Rng, createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS as c } from "./coefficients.ts";
import { firstStatRoll, kFromRolls, rerollStats, rollStatSpread } from "./cyborgStats.ts";

/** 늘 같은 값을 내는 굴림(정규분포 근사의 가운데·끝을 시험한다) */
const constantRng = (value: number): Rng => ({ nextU32: () => value, nextInt: () => value });

const STATS = ["str", "dex", "agi", "vit", "int", "wis"] as const;
const sumOf = (p: Record<(typeof STATS)[number], number>) => STATS.reduce((sum, stat) => sum + p[stat], 0);

describe("사이보그 초기 스탯 굴림(생성·환생 공용, D-6039·D-444 164·N9)", () => {
  it("성향 목록: 균형·전투형 STR·VIT·기술형 DEX·AGI(사용자 지적 2026-11-08, D-445 168의 INT·DEX를 바꿈)·교역형 INT·WIS, 다시 굴리기 3번(D-445 169)", () => {
    expect(c.cyborg.temperaments.map((t) => [t.id, [...t.favored]])).toEqual([
      ["balanced", []],
      ["combat", ["str", "vit"]],
      ["tech", ["dex", "agi"]],
      ["trade", ["int", "wis"]],
    ]);
    expect(c.cyborg.initialRerolls).toBe(5);
  });

  it("가운데 굴림이면 성향 평균(D-445 168: 성향 칸 14, 나머지 8)을 합 60 정수로 맞춘다", () => {
    expect(c.cyborg.initialFavorMilli).toBe(4000);
    expect(rollStatSpread("combat", constantRng(5000), c)).toEqual({
      str: 14,
      dex: 8,
      agi: 8,
      vit: 14,
      int: 8,
      wis: 8,
    });
  });

  it("평균이 맞지 않으면 가장 큰 나머지로 합 60을 맞춘다(치우침 3000: 성향 칸 13, 나머지 8.5)", () => {
    const mild = { ...c, cyborg: { ...c.cyborg, initialFavorMilli: 3000 } };
    expect(rollStatSpread("combat", constantRng(5000), mild)).toEqual({
      str: 13,
      dex: 9,
      agi: 9,
      vit: 13,
      int: 8,
      wis: 8,
    });
  });

  it("시드 2000개: 성향마다 합 60·칸 1~20, 평균은 고른 칸 약 14·나머지 약 8·균형 약 10, 표준편차 약 3(D-445 168)", () => {
    const seeds = Array.from({ length: 2000 }, (_, i) => (i * 2_654_435_761) >>> 0);
    const mean = (id: string, stat: (typeof STATS)[number]) => {
      let total = 0;
      for (const seed of seeds) {
        const spread = rollStatSpread(id, createRng(seed), c);
        expect(sumOf(spread)).toBe(60);
        expect(spread[stat]).toBeGreaterThanOrEqual(1);
        expect(spread[stat]).toBeLessThanOrEqual(20);
        total += spread[stat];
      }
      return total / seeds.length;
    };
    expect(mean("combat", "str")).toBeCloseTo(14, 0);
    expect(mean("combat", "int")).toBeCloseTo(8, 0);
    expect(mean("tech", "dex")).toBeCloseTo(14, 0);
    expect(mean("trade", "wis")).toBeCloseTo(14, 0);
    expect(mean("trade", "agi")).toBeCloseTo(8, 0);
    expect(mean("balanced", "vit")).toBeCloseTo(10, 0);
    const values = seeds.map((seed) => rollStatSpread("balanced", createRng(seed), c).agi);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((total, v) => total + (v - average) * (v - average), 0) / values.length;
    expect(variance).toBeGreaterThan(2.3 * 2.3);
    expect(variance).toBeLessThan(3.5 * 3.5);
  });

  it("균형은 치우침이 없다: 가운데 굴림이면 모든 칸 10", () => {
    expect(rollStatSpread("balanced", constantRng(5000), c)).toEqual({
      str: 10,
      dex: 10,
      agi: 10,
      vit: 10,
      int: 10,
      wis: 10,
    });
  });

  it("칸 상한(N9 20)을 넘는 몫은 상한에 묶고 남은 합을 다른 칸에 나눈다", () => {
    const heavy = { ...c, cyborg: { ...c.cyborg, initialFavorMilli: 12_000 } };
    expect(rollStatSpread("combat", constantRng(5000), heavy)).toEqual({
      str: 20,
      dex: 5,
      agi: 5,
      vit: 20,
      int: 5,
      wis: 5,
    });
    // 굴림이 모두 끝(0)이면 모든 칸이 하한에 걸려 고르게 나뉜다
    expect(rollStatSpread("tech", constantRng(0), c)).toEqual({
      str: 10,
      dex: 10,
      agi: 10,
      vit: 10,
      int: 10,
      wis: 10,
    });
  });

  it("어느 시드든 합 60·칸 1~20이고, 같은 시드·성향이면 같은 값이다", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const spread = rollStatSpread("trade", createRng(seed), c);
      expect(sumOf(spread)).toBe(60);
      for (const stat of STATS) {
        expect(spread[stat]).toBeGreaterThanOrEqual(1);
        expect(spread[stat]).toBeLessThanOrEqual(20);
      }
    }
    expect(rollStatSpread("combat", createRng(42), c)).toEqual(rollStatSpread("combat", createRng(42), c));
  });

  it("성향 쪽으로 치우친다: 전투형은 STR·VIT 평균이 다른 칸보다 높다", () => {
    const total = { str: 0, dex: 0, agi: 0, vit: 0, int: 0, wis: 0 };
    for (let seed = 1; seed <= 400; seed += 1) {
      const spread = rollStatSpread("combat", createRng(seed), c);
      for (const stat of STATS) total[stat] += spread[stat];
    }
    const lowestFavored = Math.min(total.str, total.vit);
    const highestOther = Math.max(total.dex, total.agi, total.int, total.wis);
    expect(lowestFavored).toBeGreaterThan(highestOther);
    // 400번 평균: 성향 칸은 12~14, 나머지는 7.5~9.5 근처
    expect(total.str / 400).toBeGreaterThan(12);
    expect(highestOther / 400).toBeLessThan(9.5);
  });

  it("모르는 성향은 굴리지 않는다", () => {
    expect(() => rollStatSpread("bard", createRng(1), c)).toThrow(RangeError);
  });

  it("다시 굴리기는 처음 1번 + N9 횟수(생성과 환생이 같은 설정값), 성향을 바꿔 굴려도 1번, 다 쓰면 마지막 값(D-445 169)", () => {
    const rng = createRng(9);
    let rolls = firstStatRoll("combat", rng, c);
    expect(rolls.rerollsLeft).toBe(5);
    expect(rolls.temperament).toBe("combat");
    for (const [left, temperament] of [
      [4, "balanced"],
      [3, "combat"],
      [2, "tech"],
      [1, "tech"],
      [0, "trade"],
    ] as const) {
      const next = rerollStats(rolls, temperament, rng, c);
      if (next === null) throw new Error("reroll");
      expect([next.rerollsLeft, next.temperament]).toEqual([left, temperament]);
      expect(sumOf(next.spread)).toBe(60);
      rolls = next;
    }
    expect(rerollStats(rolls, "combat", rng, c)).toBeNull();
  });

  it("K 굴림 여섯(0~9999)은 N6 범위 안 균등(양 끝 포함)", () => {
    expect(kFromRolls([0, 9999, 5000, 0, 0, 0], c)).toEqual({
      str: 800,
      dex: 1200,
      agi: 1000,
      vit: 800,
      int: 800,
      wis: 800,
    });
    expect(() => kFromRolls([0, 0, 0], c)).toThrow(RangeError);
    expect(() => kFromRolls([0, 0, 0, 0, 0, 10_000], c)).toThrow(RangeError);
  });
});
