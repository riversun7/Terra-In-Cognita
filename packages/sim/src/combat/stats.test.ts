import { describe, expect, it } from "vitest";
import {
  MAX_STAT_INPUT,
  type Primaries,
  TEST_STAT_TABLE,
  computeSecondary,
  primaryAtLevel,
} from "./stats.ts";

const flat: Primaries = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };

function agiOnly(agi: number): Primaries {
  return { str: 0, dex: 0, agi, vit: 0, int: 0, wis: 0 };
}

describe("스탯 계산기(D-414·D-417, 정수 ‰)", () => {
  it("1차 스탯 성장 = 초기 × (1 + 성장률 × K × (Lv − 1))", () => {
    // 초기 20, 성장률 100‰(10%), K 1000‰, Lv 11 → 20 × (1 + 0.1 × 10) = 40
    expect(primaryAtLevel(20, 100, 1000, 11)).toBe(40);
    // K 1200‰ → 20 × (1 + 0.1 × 1.2 × 10) = 44
    expect(primaryAtLevel(20, 100, 1200, 11)).toBe(44);
    expect(primaryAtLevel(20, 100, 1200, 1)).toBe(20);
  });

  it("넘침 방지: 입력 범위(10^7)를 넘는 1차 스탯·장비 값은 거절한다(게임 상한이 아니라 정수 보호)", () => {
    expect(() => computeSecondary({ ...flat, str: MAX_STAT_INPUT }, TEST_STAT_TABLE)).not.toThrow();
    expect(() => computeSecondary({ ...flat, str: MAX_STAT_INPUT + 1 }, TEST_STAT_TABLE)).toThrow(RangeError);
    expect(() => computeSecondary(flat, TEST_STAT_TABLE, { hp: MAX_STAT_INPUT + 1 })).toThrow(RangeError);
  });

  it("양 모양 = 기본 + Σ(1차 × 가중치‰) ÷ 1000 + 장비 + 버프", () => {
    const hp = TEST_STAT_TABLE.find((row) => row.id === "hp");
    if (!hp || hp.shape !== "quantity") throw new Error("fixture");
    const weighted = Math.floor(
      (flat.str * (hp.weights[0] ?? 0) +
        flat.dex * (hp.weights[1] ?? 0) +
        flat.agi * (hp.weights[2] ?? 0) +
        flat.vit * (hp.weights[3] ?? 0) +
        flat.int * (hp.weights[4] ?? 0) +
        flat.wis * (hp.weights[5] ?? 0)) /
        1000,
    );
    const stats = computeSecondary(flat, TEST_STAT_TABLE, { hp: 50 }, { hp: 5 });
    expect(stats.hp).toBe(hp.base + weighted + 55);
  });

  it("확률 모양 = 상한 × 점수 ÷ (점수 + 반감 상수): 점수가 반감 상수와 같으면 상한의 절반, 커져도 상한을 넘지 않는다", () => {
    const evade = TEST_STAT_TABLE.find((row) => row.id === "evade");
    if (!evade || evade.shape !== "probability") throw new Error("fixture");
    const scoreAt = (agi: number) => Math.floor((agi * (evade.weights[2] ?? 1)) / 1000);
    // 점수 = 반감 상수가 되는 AGI
    const agi = Math.ceil((evade.halfConstant * 1000) / (evade.weights[2] ?? 1));
    expect(scoreAt(agi)).toBe(evade.halfConstant);
    expect(computeSecondary(agiOnly(agi), TEST_STAT_TABLE).evade).toBe(Math.floor(evade.cap / 2));
    expect(computeSecondary(agiOnly(1_000_000), TEST_STAT_TABLE).evade).toBeLessThan(evade.cap);
    expect(computeSecondary(agiOnly(0), TEST_STAT_TABLE).evade).toBe(0);
  });

  it("13개 2차 스탯과 활동 수치를 모두 계산한다(저장하지 않고 계산만)", () => {
    const stats = computeSecondary(flat, TEST_STAT_TABLE);
    for (const id of [
      "hp",
      "armor_hp",
      "shield_hp",
      "defense_rate",
      "physical_attack",
      "elemental_attack",
      "hit",
      "evade",
      "crit_chance",
      "crit_multiplier",
      "action_speed",
      "stamina",
      "mp",
      "sight",
    ])
      expect(typeof stats[id]).toBe("number");
  });
});
