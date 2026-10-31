import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./combat/coefficients.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "./society/coefficients.ts";
import { TUNING_KEYS, combatCoefficientsFrom, societyCoefficientsFrom, tuningValue } from "./tuning.ts";

describe("설정 칸 값 → 계수표", () => {
  it("값이 없으면 기본 계수표 그대로, 있으면 그 칸만 바뀐다(원본은 그대로)", () => {
    expect(combatCoefficientsFrom(new Map())).toEqual(TEST_COMBAT_COEFFICIENTS);
    const tuned = combatCoefficientsFrom(
      new Map([
        ["n12_crit_spread", 800],
        ["n13_weight_agi", 900],
        ["unknown_key", 1],
      ]),
    );
    expect(tuned.critSpreadPm).toBe(800);
    expect(tuned.stamina.scoreWeightsPm).toEqual([0, 0, 900, 300, 0, 0]);
    expect(TEST_COMBAT_COEFFICIENTS.stamina.scoreWeightsPm[2]).toBe(700);
    const society = societyCoefficientsFrom(new Map([["n24_housing_3", 2500]]));
    expect(society.housingRecoveryPm).toEqual([1000, 1500, 2000, 2500]);
    // 안쪽 칸(사이보그 환생 N34)·공물(D-443)도 같은 길로 바뀐다
    const rebirth = societyCoefficientsFrom(
      new Map([
        ["n34_rebirth_currency", 25_000],
        ["s33_tribute_rate", 100],
      ]),
    );
    expect([rebirth.cyborg.rebirthCurrency, rebirth.cyborg.rebirthFaith, rebirth.tributePm]).toEqual([
      25_000, 50, 100,
    ]);
    expect(TEST_SOCIETY_COEFFICIENTS.cyborg.rebirthCurrency).toBe(10_000);
  });

  it("모든 키는 계수표의 숫자 칸을 가리키고, ID는 겹치지 않는다", () => {
    for (const key of TUNING_KEYS) expect(Number.isInteger(tuningValue(key))).toBe(true);
    expect(new Set(TUNING_KEYS.map((key) => key.id)).size).toBe(TUNING_KEYS.length);
    expect(societyCoefficientsFrom(new Map())).toEqual(TEST_SOCIETY_COEFFICIENTS);
  });
});
