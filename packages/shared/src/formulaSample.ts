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
  attackScope,
  bareAppropriateScope,
  bareCritScope,
  critMultiplierScope,
  dexFrameScope,
  evadeScope,
  staminaAppropriateScope,
  staminaCostScope,
  staminaRegenScope,
  staminaScoreScope,
  statRowScope,
} from "./formulaSlots.ts";

/** 무기 1차 적정 스탯(D-502, 몫마다 하나: str 물리 공격·int 속성 공격·dex 명중·크리·agi 공격 간격). 없는 칸 = 비율 100% */
export interface WeaponAppropriateValues {
  readonly str?: number | undefined;
  readonly int?: number | undefined;
  readonly dex?: number | undefined;
  readonly agi?: number | undefined;
}

/** 표본 무기 하나(기본 공격 칸만): 팩 무기 아이템 또는 유닛 종류의 타고난 무기 */
export interface FormulaSampleWeapon {
  /** 기본 공격 칸 종류(물리 = 물리 공격력, 속성 = 속성 공격력) */
  readonly kind: "physical" | "elemental";
  /** 무기 공격력(맨손 0, D-502) */
  readonly attack: number;
  readonly appropriate: WeaponAppropriateValues;
  readonly hitPm: number;
  readonly critPm: number;
  readonly intervalMs: number;
  readonly staminaCost: number;
  /** 맨손(무기 몫 0, 적정 DEX·AGI = bare_appropriate 식) */
  readonly unarmed: boolean;
}

/** 적정 1차 → 밀리점(없거나 0 이하면 0 = 적정 없음) */
const milliOf = (value: number | undefined): number => (value === undefined || value <= 0 ? 0 : value * 1000);

/**
 * 무기의 몫마다 적정치(밀리점, 0 = 없음 → 비율 100%). 공격 몫은 그 칸의 1차(물리 STR·속성 INT), 명중·크리는 DEX, 공격 간격은 AGI.
 * 맨손은 DEX·AGI가 bareMilli(bare_appropriate 식 값)이고 공격 몫은 없다(무기 몫 0). 판정(sim unitSpec)과 같은 규칙이다
 */
export function weaponAppropriateMilli(
  weapon: Pick<FormulaSampleWeapon, "appropriate" | "unarmed">,
  kind: "physical" | "elemental",
  bareMilli: number,
): { readonly attack: number; readonly dex: number; readonly agi: number } {
  if (weapon.unarmed) return { attack: 0, dex: bareMilli, agi: bareMilli };
  const a = weapon.appropriate;
  return {
    attack: milliOf(kind === "physical" ? a.str : a.int),
    dex: milliOf(a.dex),
    agi: milliOf(a.agi),
  };
}

/** 식 변수에 드는 설정 칸 값(N10·N11·N12·N13). 적정 STA 점수는 설정 칸이 아니라 레벨 식(stamina_appropriate, D-511)이다 */
export interface FormulaCoefficients {
  readonly capPm: number;
  readonly critSpreadPm: number;
  /** STA 점수 가중치 6칸(‰, STR·DEX·AGI·VIT·INT·WIS) */
  readonly staminaWeightsPm: readonly number[];
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

/** 1차 6개 차례(STR·DEX·AGI·VIT·INT·WIS)에서 이름으로 */
const primaryAt = (primaries: readonly number[], index: number): number => primaries[index] ?? 0;

/**
 * 표본의 전투 식 변수(식 ID → 변수). stats = sampleSecondary 결과, bareMilli = 맨손 적정(bare_appropriate 식 값, 밀리점 —
 * runFormulaSample이 셈한다. 맨손이 아닌 무기면 쓰지 않는다), staminaAppropriateMilli = 적정 STA 점수(stamina_appropriate 식 값,
 * 밀리점. 없으면 STA 점수와 같게 = 배율 1)
 */
export function sampleScopes(
  input: FormulaSampleInput,
  stats: Readonly<Record<string, number>>,
  staminaScore: number,
  bareMilli = 0,
  staminaAppropriateMilli = staminaScore * 1000,
): Record<CombatFormulaId, FormulaScope> {
  const { weapon, coefficients: c, primaries } = input;
  const s = (id: string): number => stats[id] ?? 0;
  const physical = weapon.kind === "physical";
  const statAttack = physical ? s("physical_attack") : s("elemental_attack");
  const roll = input.roll ?? 5000;
  const dex = primaryAt(primaries, 1);
  const agi = primaryAt(primaries, 2);
  const appropriate = weaponAppropriateMilli(weapon, weapon.kind, bareMilli);
  return {
    real_attack: attackScope(
      statAttack,
      weapon.unarmed ? 0 : weapon.attack,
      physical ? primaryAt(primaries, 0) : primaryAt(primaries, 4),
      appropriate.attack,
      c.capPm,
    ),
    real_hit: dexFrameScope(weapon.hitPm, dex, appropriate.dex, c.capPm),
    real_crit: dexFrameScope(weapon.critPm, dex, appropriate.dex, c.capPm),
    bare_appropriate: bareAppropriateScope(input.level),
    crit_multiplier: critMultiplierScope(s("crit_multiplier"), c.critSpreadPm, roll),
    attack_interval: attackIntervalScope(weapon.intervalMs, agi, appropriate.agi, c.capPm),
    stamina_score: staminaScoreScope(primaries, c.staminaWeightsPm),
    stamina_appropriate: staminaAppropriateScope(input.level),
    stamina_cost: staminaCostScope(weapon.staminaCost, staminaScore, staminaAppropriateMilli, c.staminaMinPm),
    real_stamina_regen: staminaRegenScope(
      Math.max(0, s("stamina_regen")),
      staminaScore,
      staminaAppropriateMilli,
    ),
    evade_chance: evadeScope(s("evade"), agi, input.opponentAgi ?? agi, c.evadeRelative),
    // 맨손 크리(AGI + DEX, 2026-11-12): 맨손 적정은 무기가 맨손이 아니어도 레벨 식 값으로 넣는다(미리 보기에서 식을 읽을 수 있게)
    bare_crit: bareCritScope(weapon.critPm, dex, agi, bareMilli),
    // 맨손 명중(늘 100%, 2026-11-12): 무기 틀과 같은 변수, 적정은 맨손 적정
    bare_hit: dexFrameScope(weapon.hitPm, dex, bareMilli, c.capPm),
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
  // 맨손 적정·적정 STA(밀리점)를 먼저 셈해 명중·크리·공격 간격의 A, 스태미나 소모·회복의 APP로 넣는다(판정 specFromStats와 같은 차례)
  const bareMilli = evaluateFormula(combat.bare_appropriate, bareAppropriateScope(input.level));
  const staminaAppropriateMilli = Math.max(
    0,
    evaluateFormula(combat.stamina_appropriate, staminaAppropriateScope(input.level)),
  );
  const scopes = sampleScopes(input, stats, staminaScore, bareMilli, staminaAppropriateMilli);
  const values: Record<CombatFormulaId, number> = {
    real_attack: evaluateFormula(combat.real_attack, scopes.real_attack),
    real_hit: evaluateFormula(combat.real_hit, scopes.real_hit),
    real_crit: evaluateFormula(combat.real_crit, scopes.real_crit),
    bare_appropriate: bareMilli,
    crit_multiplier: evaluateFormula(combat.crit_multiplier, scopes.crit_multiplier),
    attack_interval: evaluateFormula(combat.attack_interval, scopes.attack_interval),
    stamina_score: evaluateFormula(combat.stamina_score, scopes.stamina_score),
    stamina_appropriate: staminaAppropriateMilli,
    stamina_cost: evaluateFormula(combat.stamina_cost, scopes.stamina_cost),
    real_stamina_regen: evaluateFormula(combat.real_stamina_regen, scopes.real_stamina_regen),
    evade_chance: evaluateFormula(combat.evade_chance, scopes.evade_chance),
    bare_crit: evaluateFormula(combat.bare_crit, scopes.bare_crit),
    bare_hit: evaluateFormula(combat.bare_hit, scopes.bare_hit),
  };
  return { stats, staminaScore, scopes, values };
}
