// 전투 계산식 — docs/adr/2026-11-01-formula-editor.md "판정 코드"
// 실제 공격력(스탯 공격력 + 무기 몫, D-502)·명중·크리, 맨손 적정 DEX·AGI, 크리 배율, 공격 간격, STA 점수·스태미나 소모, 최종 회피를
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
  compileFormulaOrThrow,
  critMultiplierScope,
  dexFrameScope,
  evadeScope,
  evaluateFormula,
  evaluateFormulaInt,
  parseFormula,
  slotVarNames,
  staminaCostScope,
  staminaScoreScope,
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
    stamina_cost: make("stamina_cost"),
    evade_chance: make("evade_chance"),
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

/** 명중·크리 식(real_hit·real_crit): 무기 값 × min(N10, DEX ÷ 적정 DEX(밀리점)). 결과는 0 이상 정수(‰) */
export function dexFrameValue(
  id: "real_hit" | "real_crit",
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

/** 같은 (식, 기본 소모, 점수)의 소모를 한 번만 셈한다(틱마다 유닛마다 부른다). 식마다 따로 */
const costCache = new WeakMap<FormulaProgram, Map<string, number>>();

/** 행동 한 번의 스태미나 소모(밀리점, N13) 식. 0 이상 */
export function staminaCostMilliOf(baseCost: number, score: number, c: CombatCoefficients): number {
  const program = formulaOf("stamina_cost", c);
  const s = c.stamina;
  const key = `${baseCost}|${score}|${s.appropriateScore}|${s.minConsumePm}`;
  let cache = costCache.get(program);
  if (!cache) {
    cache = new Map();
    costCache.set(program, cache);
  }
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = nonNegative(
    evaluateFormula(program, staminaCostScope(baseCost, score, s.appropriateScore, s.minConsumePm)),
  );
  if (cache.size < 4096) cache.set(key, value);
  return value;
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
