// 전투 계산식 — docs/adr/2026-11-01-formula-editor.md "판정 코드"
// 실제 공격력(스탯 공격력 + 무기 몫, D-502)·명중·크리, 맨손 적정 DEX·AGI, 맨손 크리(AGI + DEX, 2026-11-12), 크리 배율, 공격 간격, STA 점수·적정 STA 점수(레벨 식, D-511)·
// 스태미나 소모·실제 스태미나 회복, 최종 회피를
// 개발자 모드에서 고치는 식(@terra/shared/formula)으로 셈한다. 식은 계수표(CombatCoefficients.formulas)에 실린다: 읽은 구문 나무는
// 직렬화할 수 있는 값이라 전투 시작 자료·스냅숏과 같이 다닌다. 식이 없으면 기본 식(= 지금 코드와 같은 결과)이다.
// 변수 값은 shared의 …Scope 함수가 만든다(화면 미리 보기와 같은 값). 결과는 칸 규칙대로 정수(내림) 또는 밀리점이다.
import {
  COMBAT_FORMULA_SLOTS,
  type CombatFormulaId,
  DEFAULT_COMBAT_FORMULAS,
  type FormulaProgram,
  attackIntervalScope,
  attackScope,
  bareAppropriateScope,
  bareCritScope,
  bareIntervalScope,
  compileFormulaOrThrow,
  critMultiplierScope,
  dexFrameScope,
  evadeScope,
  evaluateFormula,
  evaluateFormulaInt,
  parseFormula,
  slotVarNames,
  staminaAppropriateScope,
  staminaCostScope,
  staminaRegenScope,
  staminaScoreScope,
  walkSpeedScope,
} from "@terra/shared/formula";
import type { CombatCoefficients } from "./coefficients.ts";

/** 전투 식 묶음(식 ID → 읽은 식) */
export type CombatFormulaSet = Readonly<Record<CombatFormulaId, FormulaProgram>>;

const compile = (id: CombatFormulaId, source: string): FormulaProgram =>
  compileFormulaOrThrow(source, slotVarNames(COMBAT_FORMULA_SLOTS[id]));

/** 식 ID마다 make로 만든 묶음(칸을 빠짐없이 적어 타입 단언 없이) */
function setOf(make: (id: CombatFormulaId) => FormulaProgram): CombatFormulaSet {
  return {
    real_attack: make("real_attack"),
    real_hit: make("real_hit"),
    real_crit: make("real_crit"),
    bare_appropriate: make("bare_appropriate"),
    crit_multiplier: make("crit_multiplier"),
    attack_interval: make("attack_interval"),
    stamina_score: make("stamina_score"),
    stamina_appropriate: make("stamina_appropriate"),
    stamina_cost: make("stamina_cost"),
    real_stamina_regen: make("real_stamina_regen"),
    evade_chance: make("evade_chance"),
    bare_crit: make("bare_crit"),
    bare_hit: make("bare_hit"),
    bare_interval: make("bare_interval"),
    walk_speed: make("walk_speed"),
  };
}

/** 기본 식 묶음(팩 core formulas 출발값과 같다) */
export const DEFAULT_COMBAT_FORMULA_SET: CombatFormulaSet = setOf((id) =>
  compile(id, DEFAULT_COMBAT_FORMULAS[id]),
);

/**
 * 식 글(ID → 글)로 묶음을 만든다. 없는 ID는 기본 식. 틀린 식은 던진다(팩·서버가 먼저 검사한다: 판정 코드는 검사한 식만 받는다)
 */
export function combatFormulaSetFrom(sources: Readonly<Partial<Record<string, string>>>): CombatFormulaSet {
  return setOf((id) => {
    const source = sources[id];
    return source === undefined || source === DEFAULT_COMBAT_FORMULAS[id]
      ? DEFAULT_COMBAT_FORMULA_SET[id]
      : compile(id, source);
  });
}

/** 식 글이 그 칸에서 읽히나(던지지 않는 검사) */
export function isValidCombatFormula(id: CombatFormulaId, source: string): boolean {
  return parseFormula(source, slotVarNames(COMBAT_FORMULA_SLOTS[id])).ok;
}

const formulaOf = (id: CombatFormulaId, c: CombatCoefficients): FormulaProgram =>
  c.formulas?.[id] ?? DEFAULT_COMBAT_FORMULA_SET[id];

const SAFE = Number.MAX_SAFE_INTEGER;
const nonNegative = (value: number): number => (value < 0 ? 0 : value > SAFE ? SAFE : value);

/**
 * 실제 공격력 식(real_attack, D-502): 스탯 공격력 + 무기 공격력 × min(N10, 1차 ÷ 적정). 적정은 밀리점(0 이하 = 없음 → 100%).
 * 결과는 0 이상 정수
 */
export function attackValue(
  statAttack: number,
  weapon: number,
  primary: number,
  appropriateMilli: number,
  capPm: number,
  c: CombatCoefficients,
): number {
  return nonNegative(
    evaluateFormulaInt(
      formulaOf("real_attack", c),
      attackScope(statAttack, weapon, primary, appropriateMilli, capPm),
    ),
  );
}

/** 맨손 명중 식(bare_hit — 기본 1000‰, 사용자 결정 2026-11-12 "맨손 항상 100%")도 같은 변수(W DEX A CAP). 명중·크리 식(real_hit·real_crit): 무기 값 × min(N10, DEX ÷ 적정 DEX(밀리점)). 결과는 0 이상 정수(‰) */
export function dexFrameValue(
  id: "real_hit" | "real_crit" | "bare_hit",
  weapon: number,
  dex: number,
  appropriateMilli: number,
  capPm: number,
  c: CombatCoefficients,
): number {
  return nonNegative(
    evaluateFormulaInt(formulaOf(id, c), dexFrameScope(weapon, dex, appropriateMilli, capPm)),
  );
}

/** 맨손 적정 DEX·AGI(밀리점, 식 bare_appropriate — 기본 = 레벨 × 1.5 + 10). 0 이하면 0(적정 없음 → 비율 100%) */
export function bareAppropriateMilli(level: number, c: CombatCoefficients): number {
  return nonNegative(evaluateFormula(formulaOf("bare_appropriate", c), bareAppropriateScope(level)));
}

/**
 * 맨손 크리 확률(‰, 식 bare_crit — 기본 = AGI + DEX, 사용자 결정 2026-11-12 "10,10이면 2%"). 0 이상 정수.
 * 맨손 자료(unarmed)의 공격 사양만 쓴다(formula.ts realCritPm). W = 맨손 자료 크리, A = 맨손 적정(밀리점)
 */
export function bareCritPm(
  weaponCritPm: number,
  dex: number,
  agi: number,
  appropriateMilli: number,
  c: CombatCoefficients,
): number {
  return nonNegative(
    evaluateFormulaInt(formulaOf("bare_crit", c), bareCritScope(weaponCritPm, dex, agi, appropriateMilli)),
  );
}

/**
 * 맨손 공격 간격(ms, 식 bare_interval — 기본 = 2,000 ÷ (AGI ÷ 그 레벨 보통 유닛 AGI)²를 250~5,000으로, 사용자 답 1252). 1ms 이상.
 * 맨손 자료(unarmed)로 기본 공격할 때만(unitSpec.ts). 맨손 적정(레벨 × 1.5 + 10)은 쓰지 않는다
 */
export function bareIntervalMs(
  intervalMs: number,
  agi: number,
  level: number,
  c: CombatCoefficients,
): number {
  return Math.max(
    1,
    evaluateFormulaInt(formulaOf("bare_interval", c), bareIntervalScope(intervalMs, agi, level)),
  );
}

/** 걷기 속도 상한(단위/초) = 2차맵 전송 빠르기 상한(@terra/protocol MAX_UNIT_SPEED 0x10_0000) */
const WALK_SPEED_LIMIT = 0x10_0000;

/**
 * 2차맵 걷기 빠르기(단위/초, 식 walk_speed — 사용자 결정 D-540 "걷기만 AGI 반영": 기본 397.3 + AGI × 3.973, 상한 1,589 = 기본 × 4).
 * AGI = 전투와 같은 실효 AGI(성장값 + 장비·버프 − 부상). 처음 AGI 10이면 WALK_SPEED(437)와 같다(formulas.test.ts). 1 이상.
 * 차·배 같은 수단은 이 식을 쓰지 않는다(D-5052 수단 속도)
 */
export function walkSpeedOf(agi: number, c: CombatCoefficients): number {
  const speed = evaluateFormulaInt(formulaOf("walk_speed", c), walkSpeedScope(agi));
  return speed < 1 ? 1 : speed > WALK_SPEED_LIMIT ? WALK_SPEED_LIMIT : speed;
}

/** 크리 배율(‰, N12) 식 */
export function critMultiplierPm(multiplierPm: number, roll: number, c: CombatCoefficients): number {
  return nonNegative(
    evaluateFormulaInt(
      formulaOf("crit_multiplier", c),
      critMultiplierScope(multiplierPm, c.critSpreadPm, roll),
    ),
  );
}

/** 공격 간격(ms) 식(D-502 사용자 답 297): 무기 간격 ÷ min(N10, AGI ÷ 적정 AGI(밀리점)). 1ms 이상 */
export function attackIntervalMs(
  intervalMs: number,
  agi: number,
  appropriateMilli: number,
  c: CombatCoefficients,
): number {
  return Math.max(
    1,
    evaluateFormulaInt(
      formulaOf("attack_interval", c),
      attackIntervalScope(intervalMs, agi, appropriateMilli, c.appropriateCapPm),
    ),
  );
}

/** STA 점수(N13) 식 */
export function staminaScoreOf(primaries: readonly number[], c: CombatCoefficients): number {
  return evaluateFormulaInt(
    formulaOf("stamina_score", c),
    staminaScoreScope(primaries, c.stamina.scoreWeightsPm),
  );
}

/**
 * 적정 STA 점수(밀리점, D-511 식 stamina_appropriate — 기본 = 보통 유닛의 STA 점수 10 × (1 + 0.1 × (레벨 − 1))). 0 이상.
 * 소모(staminaCostMilliOf)·회복(realStaminaRegen)의 APP다
 */
export function staminaAppropriateMilli(level: number, c: CombatCoefficients): number {
  return nonNegative(evaluateFormula(formulaOf("stamina_appropriate", c), staminaAppropriateScope(level)));
}

/** 같은 (식, 기본 소모, 점수, 적정)의 소모를 한 번만 셈한다(틱마다 유닛마다 부른다). 식마다 따로 */
const costCache = new WeakMap<FormulaProgram, Map<string, number>>();

/** 행동 한 번의 스태미나 소모(밀리점, N13·D-511) 식: 적정 = 적정 STA 점수(밀리점). 0 이상 */
export function staminaCostMilliOf(
  baseCost: number,
  score: number,
  appropriateMilli: number,
  c: CombatCoefficients,
): number {
  const program = formulaOf("stamina_cost", c);
  const s = c.stamina;
  const key = `${baseCost}|${score}|${appropriateMilli}|${s.minConsumePm}`;
  let cache = costCache.get(program);
  if (!cache) {
    cache = new Map();
    costCache.set(program, cache);
  }
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = nonNegative(
    evaluateFormula(program, staminaCostScope(baseCost, score, appropriateMilli, s.minConsumePm)),
  );
  if (cache.size < 4096) cache.set(key, value);
  return value;
}

/**
 * 실제 스태미나 회복(분당, D-511 식 real_stamina_regen — 기본 = 2차 스탯 스태미나 회복 × min(2, STA 점수 ÷ 적정 STA)). 0 이상 정수.
 * 사양을 만들 때 한 번 셈한다(unitSpec.ts)
 */
export function realStaminaRegen(
  regenPerMinute: number,
  score: number,
  appropriateMilli: number,
  c: CombatCoefficients,
): number {
  return nonNegative(
    evaluateFormulaInt(
      formulaOf("real_stamina_regen", c),
      staminaRegenScope(regenPerMinute, score, appropriateMilli),
    ),
  );
}

/** 최종 회피(‰, N11 상대 보정 포함) 식 */
export function evadeChancePm(
  evadePm: number,
  defenderAgi: number,
  attackerAgi: number,
  c: CombatCoefficients,
): number {
  return evaluateFormulaInt(
    formulaOf("evade_chance", c),
    evadeScope(evadePm, defenderAgi, attackerAgi, c.evadeRelative),
  );
}
