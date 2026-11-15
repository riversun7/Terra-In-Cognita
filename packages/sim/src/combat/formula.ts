// 전투 공식 — docs/adr/2026-10-31-combat-core.md "공식 한 곳", 기획 정본 `docs/design/40_Systems/48_Stats_Formulas.md` §4
// (D-178·D-419·D-420·D-421·D-438·D-457·D-459·D-5013·D-5014·D-5043·D-5037). 판정 코드는 피해·명중·시야를 이 파일의 함수로만 계산한다.
// - 공격력(D-502, 사용자 답 296~298, D-420·D-438 1 대체) = 스탯 공격력(2차 물리·속성 공격력 = (STR + VIT) ÷ 2·(INT + WIS) ÷ 2)
//   + 무기 공격력 × min(N10 1, STR(속성은 INT) ÷ 무기 적정 STR·INT). 명중·크리 = 무기 값 × min(N10, DEX ÷ 적정 DEX). 적정은 1차 스탯
//   단위이고 몫마다 하나다(섞지 않음). 적정이 없으면 비율 100%. 맨손은 무기 몫 0, 적정 DEX = 계산식 bare_appropriate(레벨 × 1.5 + 10).
//   맨손 크리는 따로 식 bare_crit(기본 AGI + DEX ‰, 사용자 결정 2026-11-12 "10,10이면 2%"), 맨손 명중은 bare_hit(기본 1000‰ "맨손 항상 100%").
// - 판정(D-419): 명중 굴림(0~9999 < 명중‰ × 10) → 회피 굴림(회피 = 확률 모양 + 상대 보정 N11, 최종 1%~85% 사용자 답 277) → 크리 굴림 →
//   크리 배율 자리 굴림(N12 범위). 굴림은 늘 넷을 뽑는다(결정성).
// - 피해는 두 몫이다(D-459, 48 §4.5a). 물리 무기·스킬: 물리 몫 P = 실제 물리 공격력, 속성 몫 E = P × Σ(옵션 계수 × 그 칸 값).
//   속성 무기·스킬: P = 0, E = 실제 속성 공격력 × (1 + Σ 계수 × 칸 값). 공격 가산은 칸마다 따로다(D-457).
//   P → 물리 방어율(− 관통) → 고정 방어 → (크리·스킬·버프) → 최소 1 → 아머 HP → HP.
//   E → × max(0, 1 + 방어 상성) → × (1 − 속성 방어율) → × (1 − 속성 저항) → (크리·스킬·버프) → 쉴드 HP → HP(0 가능).
//   방어 상성 = Σ rate × 방어자 계열 값(기본 + 강화, 1:1, D-457)을 계수 비중으로 평균(D-5014). rate는 C10(같은 계열 −30‰, D-459).
//   크리·스킬 배율·버프는 방어 감소(②) 뒤에 두 몫에 함께 곱한다(48 §4.4 ①→⑥, §4.8 계산 예). 게임 상한은 없다(D-421).
// - 넘침 방지(기술 보호, D-421): 곱은 BigInt로 하고, 결과가 안전 정수(2^53 − 1)를 넘으면 그 값으로 자른다(게임 규칙이 아님).
// - 실제 공격력·명중·크리, 맨손 적정, 크리 배율, 최종 회피는 개발자 모드에서 고치는 계산식이다(formulas.ts,
//   docs/adr/2026-11-01-formula-editor.md). 기본 식은 아래 statPlusWeapon·weaponScaled·evadeFinalPm과 같은 결과다.
import { type CombatCoefficients, affinityRatePm } from "./coefficients.ts";
import type { Modifiers } from "./effects.ts";
import type { AttackStages } from "./attackStages.ts";
import { attackValue, bareCritPm, critMultiplierPm, dexFrameValue, evadeChancePm } from "./formulas.ts";

/** 속성 12칸 차례(D-167 코드): water frost fire blaze wind lightning earth crystal light holy dark necro. 계열 = ⌊칸 ÷ 2⌋ */
export const ELEMENT_COUNT = 12;
/** 계열 수(물·불·바람·땅·빛·어둠) */
export const FAMILY_COUNT = 6;

export interface AttackProfile {
  /**
   * 피해 방식(D-459·D-568): 물리 = 물리 몫(+ 옵션 속성 몫), 속성 = 속성 몫만. 무기 칸(공격력·적정 1차를 정하는 계열)과 따로다 —
   * 무기 칸의 damage(기본 = 칸 종류)·스킬 피해 종류가 정한다
   */
  readonly kind: "physical" | "elemental";
  /** 스탯 공격력(2차 스탯 물리·속성 공격력, D-502 큰 몫) */
  readonly statAttack: number;
  /** 무기(또는 스킬 가산을 더한) 공격력. 맨손 0(D-502) */
  readonly weaponAttack: number;
  /** 무기 적정을 보는 공격자 1차(물리 STR·속성 INT)와 무기 적정치(밀리점: 1 = 1000, 0 이하 = 적정 없음 → 비율 100%) */
  readonly attackPrimary: number;
  readonly attackAppropriateMilli: number;
  /** 무기 명중·크리 확률(‰) */
  readonly weaponHitPm: number;
  readonly weaponCritPm: number;
  /** 공격자 DEX와 무기 적정 DEX(밀리점, 명중·크리가 같이 쓴다. 맨손은 bare_appropriate) */
  readonly dex: number;
  readonly dexAppropriateMilli: number;
  /**
   * 맨손 자료(사람형 맨손·맨손 속성, 팩 unit_kinds unarmed)의 사양인가. 참이면 크리 확률은 맨손 식 bare_crit(기본 AGI + DEX ‰,
   * 사용자 결정 2026-11-12). 없으면 무기
   */
  readonly unarmed?: boolean | undefined;
  /** 크리 배율 최소(2차 스탯 ‰). 최대 = 최소 + N12 폭, 그 사이 자리는 시드 굴림 */
  readonly critMulPm: number;
  /** 공격자 AGI(회피 상대 보정 N11) */
  readonly agi?: number | undefined;
  readonly penetrationPm: number;
  readonly skillMulPm: number;
  readonly buffPm: number;
  /** 공격자 속성값 12칸(0~10) */
  readonly elements: readonly number[];
  /**
   * 속성 계수 12칸(속성값 1점당 ‰, 칸마다 따로 D-457). 물리: 옵션 계수(E = P × Σ 계수 × 칸 값), 속성: 가산 계수
   * (E = 실제 속성 공격력 × (1 + Σ …)). 어느 계열의 피해인지(방어 상성·저항의 비중)도 이 계수가 정한다
   */
  readonly skillElementsPm: readonly number[];
}

export interface DefenseProfile {
  /** 방어율(2차 스탯 ‰) */
  readonly defenseRatePm: number;
  /** 고정 방어(장비) */
  readonly defenseFlat: number;
  /** 속성 방어율(2차 스탯 ‰, 확률 모양 D-458). 속성 몫에만 곱한다(D-459) */
  readonly elementalDefenseRatePm: number;
  /** 회피(2차 스탯 ‰, 확률 모양) */
  readonly evadePm: number;
  /** 방어자 AGI(회피 상대 보정 N11) */
  readonly agi?: number | undefined;
  readonly elements: readonly number[];
  /** 속성별 저항 ‰(장비·스킬·종). 1000이면 그 속성 피해 0, 음수면 약점 */
  readonly resistPm: readonly number[];
}

export interface Rolls {
  readonly hit: number;
  readonly evade: number;
  readonly crit: number;
  /** 크리 배율 범위 안 자리(N12, 0~9999) */
  readonly critPos: number;
}

export type AttackOutcome = "miss" | "evaded" | "hit";

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
/** 적정 스탯 비율 상한(N10 구조 값 1000‰: 적정을 넘는 보너스 없음, D-502) */
export const APPROPRIATE_CAP_PM = 1000;

/**
 * 회피 상대 보정(N11, 48 §4.2): 비율 = 방어 AGI ÷ 공격 AGI. 유리(≥ 1)면 +min(400, 300 × (비율 − 1)),
 * 불리면 +max(−300, 400 × (비율 − 1)) (‰). 공격 AGI가 0이면 최대 유리
 */
export function evadeRelativePm(defenderAgi: number, attackerAgi: number, c: CombatCoefficients): number {
  const e = c.evadeRelative;
  if (attackerAgi <= 0) return defenderAgi > 0 ? e.favorCapPm : 0;
  const ratioPm = Math.floor((Math.max(0, defenderAgi) * 1000) / attackerAgi);
  if (ratioPm >= 1000) return Math.min(e.favorCapPm, Math.floor((e.favorSlopePm * (ratioPm - 1000)) / 1000));
  return Math.max(-e.unfavorCapPm, Math.trunc((e.unfavorSlopePm * (ratioPm - 1000)) / 1000));
}

/** 최종 회피 범위(‰): 1%~85%(사용자 답 2026-11-01 질문 277 → 옛 기획 회피율 §6 "최종 = clamp(기본 + 보정, 1%, 85%)") */
export const EVADE_FINAL_MIN_PM = 10;
export const EVADE_FINAL_MAX_PM = 850;

/**
 * 최종 회피(‰) = clamp(회피 + 상대 보정 N11, 1%, 85%). 기본 식 evade_chance의 코드 모양이다(판정은 계수표의 식 evadeChancePm으로
 * 셈하고, 시험이 기본 식 = 이 함수를 본다). 회피가 아무리 높아도 15%는 맞고, 아무리 낮아도 1%는 피한다
 */
export function evadeFinalPm(
  evadePm: number,
  defenderAgi: number,
  attackerAgi: number,
  c: CombatCoefficients,
): number {
  const value = evadePm + evadeRelativePm(defenderAgi, attackerAgi, c);
  return Math.min(EVADE_FINAL_MAX_PM, Math.max(EVADE_FINAL_MIN_PM, value));
}
const toSafe = (value: bigint): number => Number(value < 0n ? 0n : value > SAFE ? SAFE : value);

/**
 * 적정 비율(‰) = min(상한, 유닛 값 × 1000 ÷ 적정치)(내림, 유닛 값이 음수면 0). 적정치는 1 이상(0 이하는 부르는 쪽이 거른다).
 * 무기 몫과 소모품 효과량(useAmount.ts, D-501)이 같이 쓴다
 */
export function appropriateRatioPm(unitValue: number, appropriate: number, capPm: number): number {
  return Math.min(capPm, Math.floor((Math.max(0, unitValue) * 1000) / appropriate));
}

/**
 * 무기 비율(‰, D-502) = min(상한, 1차 × 1000 ÷ 적정)(적정은 밀리점이라 1차 × 10^6 ÷ 적정, 내림). 적정이 0 이하면 1000(비율 100%).
 * 계산식의 고정 소수점 셈(⌊1차 ÷ 적정⌋을 밀리 단위로)과 같은 값이다
 */
export function weaponRatioPm(unitValue: number, appropriateMilli: number, capPm: number): number {
  if (appropriateMilli <= 0) return 1000;
  return Math.min(capPm, Math.floor((Math.max(0, unitValue) * 1_000_000) / appropriateMilli));
}

/** 무기 몫(D-502): 무기 값 × 비율 ÷ 1000(내림). 적정(밀리점)이 0 이하면 무기 값 그대로. 기본 식(real_hit·real_crit)의 코드 모양 */
export function weaponScaled(
  weaponValue: number,
  unitValue: number,
  appropriateMilli: number,
  capPm = APPROPRIATE_CAP_PM,
): number {
  if (appropriateMilli <= 0) return weaponValue;
  const ratio = weaponRatioPm(unitValue, appropriateMilli, capPm);
  return toSafe((BigInt(weaponValue) * BigInt(ratio)) / 1000n);
}

/** 공격력(D-502) = 스탯 공격력 + 무기 몫. 기본 식(real_attack)의 코드 모양(시험이 같은지 본다) */
export function statPlusWeapon(
  statAttack: number,
  weaponAttack: number,
  primary: number,
  appropriateMilli: number,
  capPm = APPROPRIATE_CAP_PM,
): number {
  return toSafe(BigInt(statAttack) + BigInt(weaponScaled(weaponAttack, primary, appropriateMilli, capPm)));
}

/** 계열 값(D-457): 같은 계열 두 칸(기본 + 강화)을 1:1로 더한다(칸마다 0~10이라 최대 20). 방어 상성에만 쓴다 */
export function familyValue(elements: readonly number[], family: number): number {
  return (elements[family * 2] ?? 0) + (elements[family * 2 + 1] ?? 0);
}

/** 공격 가산(‰) = Σ 칸 계수 × 공격자 그 칸 값(칸마다 따로, D-457). 하이브리드는 더한다 */
export function elementAddPm(elements: readonly number[], coefficients: readonly number[]): number {
  let add = 0;
  for (let i = 0; i < ELEMENT_COUNT; i++) add += (coefficients[i] ?? 0) * (elements[i] ?? 0);
  return add;
}

/**
 * 방어 상성(‰): 공격 계열마다 Σ(rate × 방어자 계열 값)을 구해 계수 비중으로 평균한다(D-5014, D-457 그대로).
 * 계수가 모두 0이면(어느 계열도 아님) 0
 */
export function matchupPm(
  coefficients: readonly number[],
  defenderElements: readonly number[],
  c: CombatCoefficients,
): number {
  let weightSum = 0;
  let sum = 0;
  for (let f = 0; f < FAMILY_COUNT; f++) {
    const weight = (coefficients[f * 2] ?? 0) + (coefficients[f * 2 + 1] ?? 0);
    if (weight === 0) continue;
    weightSum += weight;
    let term = 0;
    for (let g = 0; g < FAMILY_COUNT; g++) term += affinityRatePm(f, g, c) * familyValue(defenderElements, g);
    sum += weight * term;
  }
  return weightSum === 0 ? 0 : Math.trunc(sum / weightSum);
}

/** 속성 저항(‰): 계수 비중으로 평균 */
function resistPm(coefficients: readonly number[], resist: readonly number[]): number {
  let sum = 0;
  let weights = 0;
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const coef = coefficients[i] ?? 0;
    if (coef === 0) continue;
    sum += coef * (resist[i] ?? 0);
    weights += coef;
  }
  return weights === 0 ? 0 : Math.trunc(sum / weights);
}

/** ‰ 곱(0 아래는 0) */
const mulPm = (value: bigint, pm: number): bigint => (pm <= 0 ? 0n : (value * BigInt(pm)) / 1000n);

/** 공격 한 번의 결과. physical = 물리 몫(아머 HP부터), elemental = 속성 몫(쉴드 HP부터), amount = 둘의 합 */
export interface AttackResult {
  readonly outcome: AttackOutcome;
  readonly crit: boolean;
  readonly physical: number;
  readonly elemental: number;
  readonly amount: number;
}

/**
 * 공격 한 번. rolls = 시드 굴림 넷(각 0~9999). stages가 있으면 단계 값을 적는다(전투 보고서 피해 흐름, attackStages.ts).
 * 적기만 하고 값·굴림은 그대로다(실제 플레이는 넘기지 않는다)
 */
export function resolveAttack(
  attack: AttackProfile,
  defense: DefenseProfile,
  rolls: Rolls,
  c: CombatCoefficients,
  stages?: AttackStages,
): AttackResult {
  const cap = c.appropriateCapPm;
  const hitPm = realHitPm(attack, c);
  if (stages) {
    stages.kind = attack.kind;
    stages.hitPm = hitPm;
    stages.hitRoll = rolls.hit;
  }
  if (rolls.hit >= hitPm * 10) {
    if (stages) stages.outcome = "miss";
    return { outcome: "miss", crit: false, physical: 0, elemental: 0, amount: 0 };
  }
  const evadePm = evadeChancePm(defense.evadePm, defense.agi ?? 0, attack.agi ?? 0, c);
  if (stages) {
    stages.evadeBasePm = defense.evadePm;
    stages.evadeRelativePm = evadeRelativePm(defense.agi ?? 0, attack.agi ?? 0, c);
    stages.evadePm = evadePm;
    stages.evadeRoll = rolls.evade;
  }
  if (rolls.evade < evadePm * 10) {
    if (stages) stages.outcome = "evaded";
    return { outcome: "evaded", crit: false, physical: 0, elemental: 0, amount: 0 };
  }
  const critPm = realCritPm(attack, c);
  const crit = rolls.crit < critPm * 10;
  // ① 실제 공격력(스탯 공격력 + 무기 몫, D-502) → 두 몫(D-459)
  const real = BigInt(realAttackOf(attack, cap, c));
  const coefficients = attack.skillElementsPm;
  const add = elementAddPm(attack.elements, coefficients);
  const physicalKind = attack.kind === "physical";
  let physical = physicalKind ? real : 0n;
  let elemental = physicalKind ? mulPm(real, add) : mulPm(real, 1000 + add);
  if (stages) {
    stages.outcome = "hit";
    stages.critPm = critPm;
    stages.critRoll = rolls.crit;
    stages.crit = crit;
    stages.statAttack = attack.statAttack;
    stages.weaponAttack = attack.weaponAttack;
    stages.realAttack = toSafe(real);
    stages.elementAddPm = add;
    stages.physicalRaw = toSafe(physical);
    stages.elementalRaw = toSafe(elemental);
    stages.defenseRatePm = defense.defenseRatePm;
    stages.penetrationPm = attack.penetrationPm;
    stages.defenseFlat = Math.max(0, defense.defenseFlat);
    stages.elementalDefensePm = Math.min(1000, Math.max(0, defense.elementalDefenseRatePm));
  }
  // ② 물리 몫: 비율 방어(방어율 − 관통) → 고정 방어
  if (physicalKind) {
    const rate = Math.min(1000, Math.max(0, defense.defenseRatePm - attack.penetrationPm));
    const afterRate = mulPm(physical, 1000 - rate);
    physical = afterRate - BigInt(Math.max(0, defense.defenseFlat));
    if (physical < 0n) physical = 0n;
    if (stages) {
      stages.ratePm = rate;
      stages.physicalAfterRate = toSafe(afterRate);
    }
  }
  if (stages) stages.physicalAfterFlat = toSafe(physical);
  // ③ 속성 몫: 방어 상성(하한 0, D-421) → 속성 방어율 → 속성 저항(1000‰이면 0, 음수면 약점)
  if (elemental > 0n) {
    const matchup = matchupPm(coefficients, defense.elements, c);
    elemental = mulPm(elemental, 1000 + matchup);
    if (stages) {
      stages.matchupPm = matchup;
      stages.elementalAfterMatchup = toSafe(elemental);
    }
    elemental = mulPm(elemental, 1000 - Math.min(1000, Math.max(0, defense.elementalDefenseRatePm)));
    if (stages) stages.elementalAfterDefense = toSafe(elemental);
    const resist = resistPm(coefficients, defense.resistPm);
    elemental = mulPm(elemental, 1000 - resist);
    if (stages) stages.resistPm = resist;
  }
  if (stages) stages.elementalAfterResist = toSafe(elemental);
  // ④ 크리 배율(범위형, N12) ⑤ 스킬 배율 ⑥ 버프: 두 몫에 함께
  const critMul = crit ? critMultiplierPm(attack.critMulPm, rolls.critPos, c) : 1000;
  const factors = [Math.max(0, attack.skillMulPm), Math.max(0, attack.buffPm)];
  if (crit) factors.unshift(critMul);
  for (const pm of factors) {
    physical = mulPm(physical, pm);
    elemental = mulPm(elemental, pm);
  }
  if (stages) recordFactors(stages, crit ? critMul : 0, attack, physical, elemental, crit);
  // 물리는 맞으면 최소 1(D-438 2, 기존 "최소 피해 1"). 속성 몫은 0까지 내려간다(D-421)
  if (physicalKind && physical < 1n) {
    physical = 1n;
    if (stages) stages.floored = true;
  }
  const p = toSafe(physical);
  const e = toSafe(elemental);
  if (stages) {
    stages.physical = p;
    stages.elemental = e;
  }
  return { outcome: "hit", crit, physical: p, elemental: e, amount: toSafe(BigInt(p) + BigInt(e)) };
}

/**
 * 단계 기록: 크리·스킬·버프 곱 뒤 값. 곱은 판정과 같은 차례로 다시 셈한다(기록만, 판정 값은 위 반복이 낸 값 그대로).
 * 다시 셈은 처음 두 몫(방어 뒤)에서 시작해 끝 값이 판정 값과 같아야 한다(attackStages.test.ts)
 */
function recordFactors(
  stages: AttackStages,
  critMulPm: number,
  attack: AttackProfile,
  physical: bigint,
  elemental: bigint,
  crit: boolean,
): void {
  let p = BigInt(stages.physicalAfterFlat);
  let e = BigInt(stages.elementalAfterResist);
  stages.critMulPm = critMulPm;
  if (crit) {
    p = mulPm(p, critMulPm);
    e = mulPm(e, critMulPm);
  }
  stages.physicalAfterCrit = toSafe(p);
  stages.elementalAfterCrit = toSafe(e);
  stages.skillMulPm = Math.max(0, attack.skillMulPm);
  p = mulPm(p, stages.skillMulPm);
  e = mulPm(e, stages.skillMulPm);
  stages.physicalAfterSkill = toSafe(p);
  stages.elementalAfterSkill = toSafe(e);
  stages.buffPm = Math.max(0, attack.buffPm);
  stages.physicalAfterBuff = toSafe(physical);
  stages.elementalAfterBuff = toSafe(elemental);
}

/** 공격 사양의 실제 공격력(식 real_attack: 스탯 공격력 + 무기 몫, D-502. cap = 적정 비율 상한 ‰) */
export function realAttackOf(attack: AttackProfile, capPm: number, c: CombatCoefficients): number {
  return attackValue(
    attack.statAttack,
    attack.weaponAttack,
    attack.attackPrimary,
    attack.attackAppropriateMilli,
    capPm,
    c,
  );
}

/**
 * 실제 명중(‰). 무기: 식 real_hit(무기 명중 × min(N10, DEX ÷ 적정 DEX)). 맨손 자료: 식 bare_hit(기본 1000‰ — 사용자 결정 2026-11-12
 * "맨손 항상 100%", 명중 굴림은 늘 뽑지만 0~9999 < 10000이라 늘 맞고 빗나감은 회피 굴림만)
 */
export function realHitPm(attack: AttackProfile, c: CombatCoefficients): number {
  return dexFrameValue(
    attack.unarmed === true ? "bare_hit" : "real_hit",
    attack.weaponHitPm,
    attack.dex,
    attack.dexAppropriateMilli,
    c.appropriateCapPm,
    c,
  );
}

/**
 * 실제 크리 확률(‰). 무기: 식 real_crit(무기 크리 × min(N10, DEX ÷ 적정 DEX)). 맨손 자료: 식 bare_crit(기본 AGI + DEX ‰,
 * 사용자 결정 2026-11-12 "맨손 크리확률은 agi+dex 을 퍼밀로쓰자 10,10이면 2%")
 */
export function realCritPm(attack: AttackProfile, c: CombatCoefficients): number {
  if (attack.unarmed === true)
    return bareCritPm(attack.weaponCritPm, attack.dex, attack.agi ?? 0, attack.dexAppropriateMilli, c);
  return dexFrameValue(
    "real_crit",
    attack.weaponCritPm,
    attack.dex,
    attack.dexAppropriateMilli,
    c.appropriateCapPm,
    c,
  );
}

/**
 * 건물 피해(D-5043): 물리 몫만(속성 몫·속성 무기는 0), 방어 없이 실제 공격력 × 스킬 × 버프 × 건물 배율.
 * 실제 공격력은 판정과 같은 식 real_attack(스탯 공격력 + 무기 몫, 상한 N10). 굴림 없음
 */
export function buildingDamage(attack: AttackProfile, buildingMulPm: number, c: CombatCoefficients): number {
  if (attack.kind !== "physical") return 0;
  let value = BigInt(realAttackOf(attack, c.appropriateCapPm, c));
  value = (value * BigInt(Math.max(0, attack.skillMulPm))) / 1000n;
  value = (value * BigInt(Math.max(0, attack.buffPm))) / 1000n;
  return toSafe((value * BigInt(Math.max(0, buildingMulPm))) / 1000n);
}

/** 시야 반지름(칸) = 스탯 시야(가중치 표 "sight" 행, D-5037) + 높이 보너스(C27). heightDiff = 보는 쪽 − 보이는 쪽(16배 cm) */
export function sightRadius(statSight: number, heightDiff: number, c: CombatCoefficients): number {
  const bonus = heightDiff > 0 ? Math.min(c.sight.heightCap, Math.floor(heightDiff / c.sight.heightUnit)) : 0;
  return statSight + bonus;
}

/** 버프·디버프를 얹은 공격 사양(D-425 효과 사전의 수치 바꿈). 공격 배율은 버프 항에 곱한다(0 아래 없음) */
export function withAttackModifiers(attack: AttackProfile, mods: Modifiers): AttackProfile {
  if (mods.attackPm === 0 && mods.penetrationPm === 0 && mods.critMulPm === 0) return attack;
  return {
    ...attack,
    buffPm: Math.max(0, Math.floor((attack.buffPm * (1000 + mods.attackPm)) / 1000)),
    penetrationPm: attack.penetrationPm + mods.penetrationPm,
    critMulPm: Math.max(0, attack.critMulPm + mods.critMulPm),
  };
}

/** 버프·디버프를 얹은 방어 사양(방어율·회피는 ‰ 더하기, 0 아래 없음) */
export function withDefenseModifiers(defense: DefenseProfile, mods: Modifiers): DefenseProfile {
  if (mods.defenseRatePm === 0 && mods.evadePm === 0) return defense;
  return {
    ...defense,
    defenseRatePm: Math.max(0, defense.defenseRatePm + mods.defenseRatePm),
    evadePm: Math.max(0, defense.evadePm + mods.evadePm),
  };
}

/** 스킬 공식 부품(D-428)이 바꾸는 공격 칸 */
export interface SkillFormula {
  readonly damage: "physical" | "elemental" | "none";
  /**
   * 기반(D-463 211): physical = 물리 공격 사양(든 무기의 물리 칸, 없으면 맨손)과 물리 공격력(STR·VIT), elemental = 속성 공격 사양(든
   * 무기의 속성 칸, 없으면 맨손 속성 자료)과 속성 공격력(INT·WIS, m.atk). 피해 종류(damage)와 따로 고른다(D-568)
   */
  readonly base: "physical" | "elemental";
  /** 공격력 × 배율(‰, 스킬 배율 칸) */
  readonly attackMulPm: number;
  /** 무기 공격력 가산 */
  readonly weaponAdd: number;
  /** 방어 관통 더하기(‰) */
  readonly penetrationPm: number;
  /** 속성 계수(12칸, 속성값 1점당 ‰). 무기 옵션 계수에 칸마다 더한다(하이브리드는 더함, D-457) */
  readonly elementPm: readonly number[];
}

/**
 * 스킬 한 번의 공격 사양: 그 스킬 기반의 공격 사양(물리 기반 = 물리 무기 칸·물리 공격력, 속성 기반 = 속성 무기 칸·속성 공격력, D-463)에
 * 공식 부품을 얹는다. 속성 계수는 그 무기의 옵션 + 스킬 계수(칸마다 더함, D-457).
 * 피해 방식은 스킬의 피해 종류(damage)가 정한다(D-568: 계열과 피해 방식은 별개 — STR 기반 마검 기술의 속성 피해, INT 기반 둔기 기술의
 * 물리 피해). 물리 피해는 P와 옵션·스킬 계수의 E, 속성 피해는 E만(D-459). 피해 없는 스킬은 기반 그대로(쓰지 않는 값)
 */
export function skillAttack(base: AttackProfile, skill: SkillFormula): AttackProfile {
  return {
    ...base,
    kind: skill.damage === "none" ? skill.base : skill.damage,
    weaponAttack: base.weaponAttack + skill.weaponAdd,
    skillMulPm: skill.attackMulPm,
    penetrationPm: base.penetrationPm + skill.penetrationPm,
    skillElementsPm: base.skillElementsPm.map((pm, i) => pm + (skill.elementPm[i] ?? 0)),
  };
}

/** 회복량 = 최대 체력 × ‰(공식 부품 heal) */
export function healAmount(maxHp: number, healPm: number): number {
  return toSafe((BigInt(maxHp) * BigInt(Math.max(0, healPm))) / 1000n);
}
