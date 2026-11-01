// 화면 미리 보기(@terra/shared runFormulaSample) = 판정 코드(computeSecondary·specFromStats·formulas.ts) —
// docs/adr/2026-11-01-formula-editor.md "꼬임 점검: 미리 보기 ≠ 판정". 기기는 판정 코드를 받지 않아 같은 식·같은 변수 함수로 셈한다.
import { createRng } from "@terra/shared";
import {
  COMBAT_FORMULA_IDS,
  type FormulaSampleWeapon,
  STAT_FORMULA_VARS,
  compileFormulaOrThrow,
  fxToInt,
  runFormulaSample,
  statRowExpression,
} from "@terra/shared/formula";
import { describe, expect, it } from "vitest";
import { UNARMED } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS, staminaCostMilli, staminaScore } from "./coefficients.ts";
import { realAttackOf } from "./formula.ts";
import { DEFAULT_COMBAT_FORMULA_SET, critMultiplierPm, evadeChancePm, frameValue } from "./formulas.ts";
import { TEST_STAT_TABLE, computeSecondary } from "./stats.ts";
import { type WeaponSpec, specFromStats } from "./unitSpec.ts";

const c = TEST_COMBAT_COEFFICIENTS;
const vars = STAT_FORMULA_VARS.map((item) => item.name);
const rows = TEST_STAT_TABLE.map((row) => ({
  id: row.id,
  program: compileFormulaOrThrow(statRowExpression(row), vars),
}));
const coefficients = {
  capPm: c.appropriateCapPm,
  critSpreadPm: c.critSpreadPm,
  staminaWeightsPm: c.stamina.scoreWeightsPm,
  staminaAppropriate: c.stamina.appropriateScore,
  staminaMinPm: c.stamina.minConsumePm,
  evadeRelative: c.evadeRelative,
};
const SWORD: WeaponSpec = {
  physical: { attack: 20, attackAppropriate: 40 },
  hitPm: 900,
  hitAppropriate: 50,
  critPm: 100,
  critAppropriate: 100,
  intervalMs: 1000,
  speedAppropriate: 100,
  range: 1,
  arc: false,
  staminaCost: 10,
  mpCost: 0,
};

const sampleWeapon = (weapon: WeaponSpec): FormulaSampleWeapon => ({
  kind: "physical",
  attack: weapon.physical?.attack ?? 0,
  attackAppropriate: weapon.physical?.attackAppropriate ?? 0,
  hitPm: weapon.hitPm,
  hitAppropriate: weapon.hitAppropriate,
  critPm: weapon.critPm,
  critAppropriate: weapon.critAppropriate,
  intervalMs: weapon.intervalMs,
  speedAppropriate: weapon.speedAppropriate,
  staminaCost: weapon.staminaCost,
  unarmed: weapon.unarmed === true,
});

describe("미리 보기 = 판정", () => {
  it("무작위 1차·레벨·무기(칼·맨손)에서 2차 스탯·전투 식 값이 같다", () => {
    const rng = createRng(7);
    expect(COMBAT_FORMULA_IDS).toHaveLength(9);
    for (let round = 0; round < 300; round++) {
      const p = Array.from({ length: 6 }, () => 1 + rng.nextInt(200));
      const level = 1 + rng.nextInt(60);
      const roll = rng.nextInt(10_000);
      const weapon = round % 2 === 0 ? SWORD : UNARMED;
      const primaries = {
        str: p[0] ?? 0,
        dex: p[1] ?? 0,
        agi: p[2] ?? 0,
        vit: p[3] ?? 0,
        int: p[4] ?? 0,
        wis: p[5] ?? 0,
      };
      const stats = computeSecondary(primaries, TEST_STAT_TABLE);
      const sample = runFormulaSample(
        { primaries: p, level, rows, weapon: sampleWeapon(weapon), coefficients, roll },
        DEFAULT_COMBAT_FORMULA_SET,
      );
      expect(sample.stats).toEqual(stats);
      const spec = specFromStats({
        id: 1,
        side: 1,
        party: 1,
        x: 0,
        y: 0,
        stats,
        weapon,
        primaries,
        level,
        moveIntervalMs: 1000,
      });
      const v = sample.values;
      expect(fxToInt(v.attack_interval)).toBe(spec.attackIntervalMs);
      expect(fxToInt(v.stamina_score)).toBe(spec.staminaScore);
      expect(sample.staminaScore).toBe(staminaScore(p, c));
      expect(v.stamina_cost).toBe(staminaCostMilli(weapon.staminaCost, spec.staminaScore, c));
      expect(fxToInt(v.real_hit)).toBe(
        frameValue("real_hit", weapon.hitPm, stats.hit ?? 0, weapon.hitAppropriate, c.appropriateCapPm, c),
      );
      expect(fxToInt(v.real_crit)).toBe(
        frameValue(
          "real_crit",
          weapon.critPm,
          stats.crit_chance ?? 0,
          weapon.critAppropriate,
          c.appropriateCapPm,
          c,
        ),
      );
      // 맨손이면 맨손 식, 칼이면 무기 틀(판정은 사양의 unarmed로 고른다)
      const real = realAttackOf(spec.attack, roll, c.appropriateCapPm, c);
      expect(fxToInt(weapon.unarmed ? v.bare_attack : v.real_attack)).toBe(real);
      expect(fxToInt(v.crit_multiplier)).toBe(critMultiplierPm(stats.crit_multiplier ?? 0, roll, c));
      expect(fxToInt(v.evade_chance)).toBe(evadeChancePm(stats.evade ?? 0, p[2] ?? 0, p[2] ?? 0, c));
    }
  });
});
