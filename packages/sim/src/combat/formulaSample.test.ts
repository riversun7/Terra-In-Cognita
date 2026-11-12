// 화면 미리 보기(@terra/shared runFormulaSample) = 판정 코드(computeSecondary·specFromStats·formulas.ts) —
// docs/adr/2026-11-01-formula-editor.md "꼬임 점검: 미리 보기 ≠ 판정". 기기는 판정 코드를 받지 않아 같은 식·같은 변수 함수로 셈한다.
import { createRng } from "@terra/shared";
import {
  COMBAT_FORMULA_IDS,
  type FormulaSampleWeapon,
  STAT_FORMULA_VARS,
  compileFormulaOrThrow,
  critFormulaIdOf,
  fxToInt,
  intervalFormulaIdOf,
  runFormulaSample,
  statRowExpression,
} from "@terra/shared/formula";
import { describe, expect, it } from "vitest";
import { UNARMED } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS, specStaminaCostMilli, staminaScore } from "./coefficients.ts";
import { realAttackOf, realCritPm, realHitPm } from "./formula.ts";
import {
  DEFAULT_COMBAT_FORMULA_SET,
  bareAppropriateMilli,
  critMultiplierPm,
  evadeChancePm,
  staminaAppropriateMilli,
} from "./formulas.ts";
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
  staminaMinPm: c.stamina.minConsumePm,
  evadeRelative: c.evadeRelative,
};
const SWORD: WeaponSpec = {
  physical: { attack: 20 },
  appropriate: { str: 25, dex: 12, agi: 12 },
  hitPm: 900,
  critPm: 100,
  intervalMs: 1000,
  range: 1,
  arc: false,
  staminaCost: 10,
  mpCost: 0,
};

const sampleWeapon = (weapon: WeaponSpec): FormulaSampleWeapon => ({
  kind: "physical",
  attack: weapon.physical?.attack ?? 0,
  appropriate: weapon.appropriate ?? {},
  hitPm: weapon.hitPm,
  critPm: weapon.critPm,
  intervalMs: weapon.intervalMs,
  staminaCost: weapon.staminaCost,
  unarmed: weapon.unarmed === true,
});

describe("미리 보기 = 판정", () => {
  it("무작위 1차·레벨·무기(칼·맨손)에서 2차 스탯·전투 식 값이 같다", () => {
    const rng = createRng(7);
    expect(COMBAT_FORMULA_IDS).toHaveLength(13);
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
      // 맨손은 옛 맨손 규칙 칸(bare_interval·bare_crit, 2026-11-12), 무기는 무기 틀 칸
      const unarmed = weapon.unarmed === true;
      expect(fxToInt(v[intervalFormulaIdOf(unarmed)])).toBe(spec.attackIntervalMs);
      expect(fxToInt(v.stamina_score)).toBe(spec.staminaScore);
      expect(sample.staminaScore).toBe(staminaScore(p, c));
      // 적정 STA(레벨 식, D-511)·소모·실제 회복
      expect(v.stamina_appropriate).toBe(staminaAppropriateMilli(level, c));
      expect(spec.staminaAppropriateMilli).toBe(v.stamina_appropriate);
      expect(v.stamina_cost).toBe(specStaminaCostMilli(spec, weapon.staminaCost, c));
      expect(fxToInt(v.real_stamina_regen)).toBe(spec.staminaRegen);
      expect(fxToInt(v.real_hit)).toBe(realHitPm(spec.attack, c));
      expect(fxToInt(v[critFormulaIdOf(unarmed)])).toBe(realCritPm(spec.attack, c));
      // 공격력 = 스탯 공격력 + 무기 몫(맨손은 무기 몫 0, D-502). 맨손 적정은 레벨 식(밀리점)
      expect(fxToInt(v.real_attack)).toBe(realAttackOf(spec.attack, c.appropriateCapPm, c));
      expect(v.bare_appropriate).toBe(bareAppropriateMilli(level, c));
      expect(fxToInt(v.crit_multiplier)).toBe(critMultiplierPm(stats.crit_multiplier ?? 0, roll, c));
      expect(fxToInt(v.evade_chance)).toBe(evadeChancePm(stats.evade ?? 0, p[2] ?? 0, p[2] ?? 0, c));
    }
  });
});
