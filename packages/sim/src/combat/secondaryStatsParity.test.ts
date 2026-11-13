// @terra/shared/secondaryStatsSim 계산 결과가 @terra/sim computeSecondary 판정 결과와 1비트도 어긋나지 않음을 검증
import {
  type CombatFormulaId,
  COMBAT_FORMULA_SLOTS,
  DEFAULT_COMBAT_FORMULAS,
  FX_SCALE,
  type FormulaProgram,
  compileFormulaOrThrow,
  slotVarNames,
} from "@terra/shared/formula";
import {
  SECONDARY_ARCHETYPE_IDS,
  SECONDARY_ARCHETYPE_WEIGHTS,
  archetypeInitialPrimaries,
  compileStatRowFromValues,
  evaluateTargetFixed,
  growPrimaries,
} from "@terra/shared/secondaryStatsSim";
import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { TEST_STAT_TABLE, computeSecondary } from "./stats.ts";

const compileDefault = (id: CombatFormulaId): FormulaProgram =>
  compileFormulaOrThrow(DEFAULT_COMBAT_FORMULAS[id], slotVarNames(COMBAT_FORMULA_SLOTS[id]));

const combatPrograms: Record<CombatFormulaId, FormulaProgram> = {
  real_attack: compileDefault("real_attack"),
  real_hit: compileDefault("real_hit"),
  real_crit: compileDefault("real_crit"),
  bare_appropriate: compileDefault("bare_appropriate"),
  crit_multiplier: compileDefault("crit_multiplier"),
  attack_interval: compileDefault("attack_interval"),
  stamina_score: compileDefault("stamina_score"),
  stamina_appropriate: compileDefault("stamina_appropriate"),
  stamina_cost: compileDefault("stamina_cost"),
  real_stamina_regen: compileDefault("real_stamina_regen"),
  evade_chance: compileDefault("evade_chance"),
  bare_crit: compileDefault("bare_crit"),
  bare_hit: compileDefault("bare_hit"),
  bare_interval: compileDefault("bare_interval"),
};

const compiledRows = TEST_STAT_TABLE.map((row) => ({
  id: row.id,
  program: compileStatRowFromValues(
    row.shape,
    row.shape === "quantity"
      ? {
          str: row.weights[0] ?? 0,
          dex: row.weights[1] ?? 0,
          agi: row.weights[2] ?? 0,
          vit: row.weights[3] ?? 0,
          int: row.weights[4] ?? 0,
          wis: row.weights[5] ?? 0,
          base: row.base,
        }
      : {
          str: row.weights[0] ?? 0,
          dex: row.weights[1] ?? 0,
          agi: row.weights[2] ?? 0,
          vit: row.weights[3] ?? 0,
          int: row.weights[4] ?? 0,
          wis: row.weights[5] ?? 0,
          cap: row.cap,
          half: row.halfConstant,
        },
  ),
}));

const c = TEST_COMBAT_COEFFICIENTS;
const coefficients = {
  capPm: c.appropriateCapPm,
  critSpreadPm: c.critSpreadPm,
  staminaWeightsPm: c.stamina.scoreWeightsPm,
  staminaMinPm: c.stamina.minConsumePm,
  evadeRelative: c.evadeRelative,
};
const unarmedWeapon = {
  kind: "physical" as const,
  attack: 0,
  appropriate: {},
  hitPm: 1000,
  critPm: 50,
  intervalMs: 2000,
  staminaCost: 10,
  unarmed: true,
};

describe("secondaryStatsSim ↔ sim computeSecondary 파리티", () => {
  it("모든 계열 × 초기 합(30·60·100) × 레벨(1·30·50)에서 모든 활성 2차 스탯이 판정 결과와 일치한다", () => {
    for (const initialSum of [30, 60, 100]) {
      for (const archId of SECONDARY_ARCHETYPE_IDS) {
        const init = archetypeInitialPrimaries(SECONDARY_ARCHETYPE_WEIGHTS[archId], initialSum);
        for (const level of [1, 30, 50]) {
          const grown = growPrimaries(init, 100, 1000, level);
          const simResult = computeSecondary(grown, TEST_STAT_TABLE, {}, {}, level);
          for (const row of compiledRows) {
            const simFx = evaluateTargetFixed(
              row.id,
              level,
              grown,
              { rows: compiledRows, combat: combatPrograms },
              unarmedWeapon,
              coefficients,
            );
            expect(simFx / FX_SCALE).toBe(simResult[row.id]);
          }
        }
      }
    }
  });
});
