// 전투 공식 — docs/adr/2026-10-31-combat-core.md "공식 한 곳", 기획 D-178(6축 곱)·D-181·D-182·D-5013·D-5037·D-5043
// 판정 코드는 피해·시야를 이 파일의 함수로만 계산한다. 기획 Step 9가 오면 이 파일과 계수표(coefficients.ts)만 바꾼다.
// 최종 피해 = 스탯 공격력 × 방어 감소 × 속성 항 × 크리 배율 × 스킬 배율 × 버프 (천분율, 단계마다 버림).
// - 물리: 비율 방어(관통이 줄임)를 곱하고 끝에 고정 방어를 뺀다. 그 뒤 아머 HP → HP(battle.ts).
// - 속성: 방어 감소 없이 속성 항을 곱한다. 쉴드 HP → HP(battle.ts).
// - 속성 항 = max(하한, 1 + Σ 공격자 속성값 × 스킬 계수 + 방어 상성 항). 방어 상성 항 = 공격 계열(스킬 계수 비중)마다
//   Σ rate[공격 계열][방어 계열] × 방어자 계열 값, 계열 값 = 기본형 + 강화형 × 2(D-5013).
// - 피해는 1 아래로 내려가지 않는다. 건물은 물리 피해 × 건물 배율만 받는다(D-5043).
import type { CombatCoefficients } from "./coefficients.ts";

/** 속성 12칸 차례(D-167 코드): water frost fire blaze wind lightning earth crystal light holy dark necro. 계열 = ⌊칸 ÷ 2⌋ */
export const ELEMENT_COUNT = 12;

export interface AttackProfile {
  readonly attack: number;
  readonly kind: "physical" | "elemental";
  /** 관통(비율 방어를 줄임, 천분율) */
  readonly penetrationPm: number;
  /** 크리 확률(만분율) */
  readonly critChanceBp: number;
  readonly critMulPm: number;
  readonly skillMulPm: number;
  readonly buffPm: number;
  /** 공격자 속성값 12칸(0~10) */
  readonly elements: readonly number[];
  /** 스킬 속성 계수 12칸(속성값 1점당, 천분율) */
  readonly skillElementsPm: readonly number[];
}

export interface DefenseProfile {
  /** 비율 방어(천분율) */
  readonly defenseRatioPm: number;
  readonly defenseFlat: number;
  readonly elements: readonly number[];
}

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;
const mulPm = (value: number, pm: number): number => Math.floor((value * pm) / 1000);

/** 속성 항(천분율) */
export function elementTermPm(attack: AttackProfile, defense: DefenseProfile, c: CombatCoefficients): number {
  let add = 0;
  const weight = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const coef = attack.skillElementsPm[i] ?? 0;
    add += (attack.elements[i] ?? 0) * coef;
    const family = i >> 1;
    weight[family] = (weight[family] ?? 0) + coef;
  }
  let weightSum = 0;
  let affinity = 0;
  for (let f = 0; f < 6; f++) {
    const w = weight[f] ?? 0;
    if (w === 0) continue;
    weightSum += w;
    let term = 0;
    for (let g = 0; g < 6; g++) {
      const value = (defense.elements[g * 2] ?? 0) + (defense.elements[g * 2 + 1] ?? 0) * 2;
      term += (c.affinityPm[f]?.[g] ?? 0) * value;
    }
    affinity += w * term;
  }
  const defenseTerm = weightSum === 0 ? 0 : Math.trunc(affinity / weightSum);
  return clamp(1000 + add + defenseTerm, c.elementFloorPm, c.caps.elementPm);
}

/** 피해 한 번. roll = 0~9999 굴림(크리) */
export function computeDamage(
  attack: AttackProfile,
  defense: DefenseProfile,
  roll: number,
  c: CombatCoefficients,
): { amount: number; crit: boolean } {
  let value = attack.attack;
  if (attack.kind === "physical") {
    const ratio = clamp(defense.defenseRatioPm - attack.penetrationPm, 0, 1000);
    value = mulPm(value, 1000 - ratio);
  }
  value = mulPm(value, elementTermPm(attack, defense, c));
  const crit = roll < attack.critChanceBp;
  if (crit) value = mulPm(value, clamp(attack.critMulPm, 1000, c.caps.critPm));
  value = mulPm(value, clamp(attack.skillMulPm, 0, c.caps.skillPm));
  value = mulPm(value, clamp(attack.buffPm, 0, c.caps.buffPm));
  if (attack.kind === "physical") value -= defense.defenseFlat;
  return { amount: value < 1 ? 1 : value, crit };
}

/** 건물 피해(D-5043): 물리만, 방어 없이 × 건물 배율 */
export function buildingDamage(attack: AttackProfile, buildingMulPm: number, c: CombatCoefficients): number {
  if (attack.kind !== "physical") return 0;
  const value = mulPm(
    mulPm(
      mulPm(attack.attack, clamp(attack.skillMulPm, 0, c.caps.skillPm)),
      clamp(attack.buffPm, 0, c.caps.buffPm),
    ),
    buildingMulPm,
  );
  return value < 0 ? 0 : value;
}

/** 시야 반지름(칸). heightDiff = 보는 쪽 바닥 − 보이는 쪽 바닥(16배 cm) */
export function sightRadius(wis: number, agi: number, heightDiff: number, c: CombatCoefficients): number {
  const bonus = heightDiff > 0 ? Math.min(c.sight.heightCap, Math.floor(heightDiff / c.sight.heightUnit)) : 0;
  return c.sight.base + Math.floor((wis * c.sight.wisPm + agi * c.sight.agiPm) / 1000) + bonus;
}
