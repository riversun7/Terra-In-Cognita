import { describe, expect, it } from "vitest";
import {
  type CombatFormulaId,
  COMBAT_FORMULA_SLOTS,
  DEFAULT_COMBAT_FORMULAS,
  FX_SCALE,
  type FormulaProgram,
  compileFormulaOrThrow,
  slotVarNames,
} from "./formula.ts";
import {
  SECONDARY_ARCHETYPE_IDS,
  SECONDARY_ARCHETYPE_WEIGHTS,
  SECONDARY_INITIAL_SUM_PRESETS,
  archetypeInitialPrimaries,
  buildArchetypeLevelCurves,
  buildComparisonMatrix,
  buildKBandCurve,
  buildProbabilityCurve,
  compileStatRowFromValues,
  evaluateTargetFixed,
  growPrimaries,
  probabilityWeightedScore,
  secondaryPrimaryInfluence,
  type CompiledSecondaryPrograms,
} from "./secondaryStatsSim.ts";
import { statSum } from "./statGrowth.ts";

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
  walk_speed: compileDefault("walk_speed"),
};

const samplePrograms: CompiledSecondaryPrograms = {
  rows: [
    {
      id: "hp",
      program: compileStatRowFromValues("quantity", { str: 2000, vit: 5000, base: 50 }),
    },
    {
      id: "defense_rate",
      program: compileStatRowFromValues("probability", { vit: 1000, cap: 700, half: 100 }),
    },
    {
      id: "crit_multiplier",
      program: compileStatRowFromValues("quantity", { dex: 10000, base: 1500 }),
    },
    {
      id: "physical_attack",
      program: compileStatRowFromValues("quantity", { str: 1000, base: 0 }),
    },
    {
      id: "elemental_attack",
      program: compileStatRowFromValues("quantity", { int: 1000, base: 0 }),
    },
    {
      id: "evade",
      program: compileStatRowFromValues("probability", { agi: 1000, cap: 500, half: 80 }),
    },
    {
      id: "stamina_regen",
      program: compileStatRowFromValues("quantity", { vit: 500, agi: 500, base: 10 }),
    },
  ],
  combat: combatPrograms,
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

const coefficients = {
  capPm: 1000,
  critSpreadPm: 200,
  staminaWeightsPm: [0, 0, 700, 300, 0, 0],
  staminaMinPm: 200,
  evadeRelative: {
    favorSlopePm: 150,
    favorCapPm: 300,
    unfavorSlopePm: 200,
    unfavorCapPm: 400,
  },
};

describe("secondaryStatsSim", () => {
  it("초기 스탯 합 프리셋(30~80·100)과 범위 클램프(6~100)에서 계열별 합이 정확히 일치한다", () => {
    for (const sum of SECONDARY_INITIAL_SUM_PRESETS) {
      for (const id of SECONDARY_ARCHETYPE_IDS) {
        const primaries = archetypeInitialPrimaries(SECONDARY_ARCHETYPE_WEIGHTS[id], sum);
        expect(statSum(Object.values(primaries))).toBe(sum);
      }
    }
    expect(statSum(Object.values(archetypeInitialPrimaries(SECONDARY_ARCHETYPE_WEIGHTS.physical, 3)))).toBe(
      6,
    );
    expect(statSum(Object.values(archetypeInitialPrimaries(SECONDARY_ARCHETYPE_WEIGHTS.physical, 150)))).toBe(
      100,
    );
    // 균형형은 60일 때 모두 10
    expect(archetypeInitialPrimaries(SECONDARY_ARCHETYPE_WEIGHTS.balanced, 60)).toEqual({
      str: 10,
      vit: 10,
      int: 10,
      wis: 10,
      dex: 10,
      agi: 10,
    });
  });

  it("1차 스탯 영향력(+10 한계효율)은 UI 차례로 나오고 가중치와 일치한다", () => {
    const p = archetypeInitialPrimaries(SECONDARY_ARCHETYPE_WEIGHTS.balanced, 60);
    const { base, items } = secondaryPrimaryInfluence(
      "hp",
      1,
      p,
      samplePrograms,
      unarmedWeapon,
      coefficients,
    );
    // 50 + 10*2 + 10*5 = 120
    expect(base).toBe(120 * FX_SCALE);
    expect(items.map((item) => item.stat)).toEqual(["str", "vit", "int", "wis", "dex", "agi"]);
    const vit = items.find((item) => item.stat === "vit");
    expect(vit?.plus10).toBe(50 * FX_SCALE);
    const str = items.find((item) => item.stat === "str");
    expect(str?.plus10).toBe(20 * FX_SCALE);
  });

  it("계열별 성장 곡선·K 편차 밴드·수정 전후 비교를 계산한다", () => {
    const draftCurves = buildArchetypeLevelCurves({
      targetKey: "hp",
      archetypes: SECONDARY_ARCHETYPE_IDS.map((id) => ({ id, weights: SECONDARY_ARCHETYPE_WEIGHTS[id] })),
      initialSum: 60,
      growthPm: 100,
      kPm: 1000,
      maxLevel: 30,
      draftPrograms: samplePrograms,
      baselinePrograms: samplePrograms,
      weapon: unarmedWeapon,
      coefficients,
    });
    expect(draftCurves).toHaveLength(4);
    const physLv1 = draftCurves[0]?.points[0];
    const magicLv1 = draftCurves[2]?.points[0];
    expect((physLv1?.draftValue ?? 0) > (magicLv1?.draftValue ?? 0)).toBe(true);
    expect(physLv1?.draftValue).toBe(physLv1?.baselineValue);

    const band = buildKBandCurve({
      targetKey: "hp",
      weights: SECONDARY_ARCHETYPE_WEIGHTS.physical,
      initialSum: 60,
      growthPm: 100,
      kMinPm: 800,
      kMidPm: 1000,
      kMaxPm: 1200,
      maxLevel: 20,
      programs: samplePrograms,
      weapon: unarmedWeapon,
      coefficients,
    });
    expect(band).toHaveLength(20);
    const lv20 = band[19];
    expect((lv20?.minValue ?? 0) < (lv20?.midValue ?? 0)).toBe(true);
    expect((lv20?.midValue ?? 0) < (lv20?.maxValue ?? 0)).toBe(true);
  });

  it("확률 수확체감 곡선과 전체 비교표를 계산한다", () => {
    const curve = buildProbabilityCurve(700, 100, 400, 10);
    expect(curve[0]).toEqual({ score: 0, valuePm: 0 });
    const halfPoint = curve.find((pt) => pt.score === 100);
    // 700 * 100 / (100 + 100) = 350
    expect(halfPoint?.valuePm).toBe(350);
    const score = probabilityWeightedScore(
      { vit: 1000 },
      growPrimaries({ str: 10, vit: 20, int: 10, wis: 10, dex: 5, agi: 5 }, 100, 1000, 1),
    );
    expect(score).toBe(20);

    const matrix = buildComparisonMatrix({
      rowIds: ["hp", "defense_rate"],
      level: 30,
      archetypes: SECONDARY_ARCHETYPE_IDS.map((id) => ({ id, weights: SECONDARY_ARCHETYPE_WEIGHTS[id] })),
      initialSum: 60,
      growthPm: 100,
      kPm: 1000,
      draftPrograms: samplePrograms,
      baselinePrograms: samplePrograms,
      weapon: unarmedWeapon,
      coefficients,
    });
    expect(matrix).toHaveLength(2);
    expect((matrix[0]?.values.physical?.draft ?? 0) > (matrix[0]?.values.balanced?.draft ?? 0)).toBe(true);
    // 전투 파생식도 계산 가능
    const attackFx = evaluateTargetFixed(
      "real_attack",
      1,
      archetypeInitialPrimaries(SECONDARY_ARCHETYPE_WEIGHTS.physical, 60),
      samplePrograms,
      unarmedWeapon,
      coefficients,
    );
    expect(attackFx).toBeGreaterThan(0);
  });
});
