// 계산식 미리 보기 — 표본 유닛 하나로 2차 스탯 → 전투 식 변수를 만든다(docs/adr/2026-11-01-formula-editor.md "미리 보기").
// 개발자 화면(기기)은 판정 코드(sim)를 받지 않으므로(경계 규칙) 같은 식·같은 변수 함수(formulaSlots …Scope)로 여기서 셈한다.
// 판정 코드와 같은 값인지는 sim formulaSample.test.ts가 본다(computeSecondary·specFromStats와 견줌).
// 결정성 검사 대상이다(scripts/check-boundaries.mjs).
import { type FormulaScope, evaluateFormula, evaluateFormulaInt } from "./formulaEval.ts";
import type { FormulaProgram } from "./formulaParse.ts";
import {
  type CombatFormulaId,
  type EvadeRelativeValues,
  attackIntervalScope,
  bareAttackScope,
  critMultiplierScope,
  evadeScope,
  staminaCostScope,
  staminaScoreScope,
  statRowScope,
  weaponFrameScope,
} from "./formulaSlots.ts";

/** 표본 무기 하나(기본 공격 칸만): 팩 무기 아이템 또는 유닛 종류의 타고난 무기 */
export interface FormulaSampleWeapon {
  /** 기본 공격 칸 종류(물리 = 물리 공격력, 속성 = 속성 공격력) */
  readonly kind: "physical" | "elemental";
  readonly attack: number;
  readonly attackAppropriate: number;
  readonly hitPm: number;
  readonly hitAppropriate: number;
  readonly critPm: number;
  readonly critAppropriate: number;
  readonly intervalMs: number;
  readonly speedAppropriate: number;
  readonly staminaCost: number;
  /** 사람형 맨손(기본 공격이 맨손 식) */
  readonly unarmed: boolean;
}

/** 식 변수에 드는 설정 칸 값(N10·N11·N12·N13) */
export interface FormulaCoefficients {
  readonly capPm: number;
  readonly critSpreadPm: number;
  /** STA 점수 가중치 6칸(‰, STR·DEX·AGI·VIT·INT·WIS) */
  readonly staminaWeightsPm: readonly number[];
  readonly staminaAppropriate: number;
  readonly staminaMinPm: number;
  readonly evadeRelative: EvadeRelativeValues;
}

export interface FormulaSampleInput {
  /** 1차 6개(STR·DEX·AGI·VIT·INT·WIS 차례) */
  readonly primaries: readonly number[];
  readonly level: number;
  /** 행 ID → 행 식(켜진 행 모두, 팩 차례) */
  readonly rows: readonly { readonly id: string; readonly program: FormulaProgram }[];
  /** 행 ID → 장비 합(없으면 0) */
  readonly gear?: Readonly<Record<string, number>>;
  readonly weapon: FormulaSampleWeapon;
  readonly coefficients: FormulaCoefficients;
  /** 회피의 상대 AGI(없으면 같은 AGI) */
  readonly opponentAgi?: number;
  /** 굴림 칸(0~9999, 없으면 중간 5000) */
  readonly roll?: number;
}

/** 표본의 2차 스탯(행 ID → 정수) */
export function sampleSecondary(input: FormulaSampleInput): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of input.rows)
    out[row.id] = evaluateFormulaInt(
      row.program,
      statRowScope(input.primaries, input.level, input.gear?.[row.id] ?? 0, 0),
    );
  return out;
}

/** 표본의 전투 식 변수(식 ID → 변수). stats = sampleSecondary 결과 */
export function sampleScopes(
  input: FormulaSampleInput,
  stats: Readonly<Record<string, number>>,
  staminaScore: number,
): Record<CombatFormulaId, FormulaScope> {
  const { weapon, coefficients: c, primaries } = input;
  const s = (id: string): number => stats[id] ?? 0;
  const attackStat = weapon.kind === "physical" ? s("physical_attack") : s("elemental_attack");
  const roll = input.roll ?? 5000;
  const agi = primaries[2] ?? 0;
  return {
    real_attack: weaponFrameScope(weapon.attack, attackStat, weapon.attackAppropriate, c.capPm),
    real_hit: weaponFrameScope(weapon.hitPm, s("hit"), weapon.hitAppropriate, c.capPm),
    real_crit: weaponFrameScope(weapon.critPm, s("crit_chance"), weapon.critAppropriate, c.capPm),
    bare_attack: bareAttackScope(
      primaries,
      input.level,
      { weapon: weapon.attack, stat: attackStat, appropriate: weapon.attackAppropriate, capPm: c.capPm },
      roll,
    ),
    crit_multiplier: critMultiplierScope(s("crit_multiplier"), c.critSpreadPm, roll),
    attack_interval: attackIntervalScope(weapon.intervalMs, s("action_speed"), weapon.speedAppropriate),
    stamina_score: staminaScoreScope(primaries, c.staminaWeightsPm),
    stamina_cost: staminaCostScope(weapon.staminaCost, staminaScore, c.staminaAppropriate, c.staminaMinPm),
    evade_chance: evadeScope(s("evade"), agi, input.opponentAgi ?? agi, c.evadeRelative),
  };
}

/** 표본 결과 전체: 2차 스탯, STA 점수, 전투 식마다 값(고정 소수점) */
export interface FormulaSampleResult {
  readonly stats: Readonly<Record<string, number>>;
  readonly staminaScore: number;
  readonly scopes: Readonly<Record<CombatFormulaId, FormulaScope>>;
  readonly values: Readonly<Record<CombatFormulaId, number>>;
}

/** 표본 하나를 끝까지 셈한다(combat = 식 ID → 식) */
export function runFormulaSample(
  input: FormulaSampleInput,
  combat: Readonly<Record<CombatFormulaId, FormulaProgram>>,
): FormulaSampleResult {
  const stats = sampleSecondary(input);
  const staminaScore = evaluateFormulaInt(
    combat.stamina_score,
    staminaScoreScope(input.primaries, input.coefficients.staminaWeightsPm),
  );
  const scopes = sampleScopes(input, stats, staminaScore);
  const values: Record<CombatFormulaId, number> = {
    real_attack: evaluateFormula(combat.real_attack, scopes.real_attack),
    real_hit: evaluateFormula(combat.real_hit, scopes.real_hit),
    real_crit: evaluateFormula(combat.real_crit, scopes.real_crit),
    bare_attack: evaluateFormula(combat.bare_attack, scopes.bare_attack),
    crit_multiplier: evaluateFormula(combat.crit_multiplier, scopes.crit_multiplier),
    attack_interval: evaluateFormula(combat.attack_interval, scopes.attack_interval),
    stamina_score: evaluateFormula(combat.stamina_score, scopes.stamina_score),
    stamina_cost: evaluateFormula(combat.stamina_cost, scopes.stamina_cost),
    evade_chance: evaluateFormula(combat.evade_chance, scopes.evade_chance),
  };
  return { stats, staminaScore, scopes, values };
}
