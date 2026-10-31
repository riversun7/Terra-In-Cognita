// 전투 공식 — docs/adr/2026-10-31-combat-core.md "공식 한 곳", 기획 D-178·D-419·D-420·D-421·D-5013·D-5043·D-5037
// 판정 코드는 피해·명중·시야를 이 파일의 함수로만 계산한다. 공식이 바뀌면 이 파일과 계수표(coefficients.ts)만 바꾼다.
// - 무기 틀(D-420): 실제 값 = 무기 값 × min(2, 유닛 값 ÷ 적정치). 공격력·명중·크리 확률·공격 속도가 같은 틀이다.
// - 판정(D-419): 명중 굴림(0~9999 < 명중‰ × 10) → 회피 굴림(0~9999 < 회피‰ × 10이면 피함) → 크리 굴림. 굴림은 늘 셋을 뽑는다.
// - 피해(D-178 6축 곱, D-421 상한 없음): 실제 공격력 × 방어 감소 × 속성 항 × 크리 배율 × 스킬 배율 × 버프.
//   물리: × (1 − max(0, 방어율 − 관통)) − 고정 방어. 속성: × (1 − 속성 저항), 속성 항 = max(0, …)(하한 0.25 거둠).
//   피해는 0 아래로 내려가지 않는다(무력화 가능). 게임 상한은 없다.
// - 넘침 방지(기술 보호, D-421): 곱은 BigInt로 하고, 결과가 안전 정수(2^53 − 1)를 넘으면 그 값으로 자른다(게임 규칙이 아님).
import type { CombatCoefficients } from "./coefficients.ts";
import type { Modifiers } from "./effects.ts";

/** 속성 12칸 차례(D-167 코드): water frost fire blaze wind lightning earth crystal light holy dark necro. 계열 = ⌊칸 ÷ 2⌋ */
export const ELEMENT_COUNT = 12;

export interface AttackProfile {
  readonly kind: "physical" | "elemental";
  /** 무기(또는 스킬) 공격력과 유닛 공격력(2차 스탯)·적정치 */
  readonly weaponAttack: number;
  readonly attackStat: number;
  readonly attackAppropriate: number;
  /** 무기 명중(‰)과 유닛 명중(2차 스탯 ‰)·적정치 */
  readonly weaponHitPm: number;
  readonly hitStat: number;
  readonly hitAppropriate: number;
  /** 무기 크리 확률(‰)과 유닛 크리 확률(2차 스탯 ‰)·적정치 */
  readonly weaponCritPm: number;
  readonly critStat: number;
  readonly critAppropriate: number;
  /** 크리 배율(2차 스탯 ‰) */
  readonly critMulPm: number;
  readonly penetrationPm: number;
  readonly skillMulPm: number;
  readonly buffPm: number;
  /** 공격자 속성값 12칸(0~10) */
  readonly elements: readonly number[];
  /** 스킬 속성 계수 12칸(속성값 1점당 ‰) */
  readonly skillElementsPm: readonly number[];
}

export interface DefenseProfile {
  /** 방어율(2차 스탯 ‰) */
  readonly defenseRatePm: number;
  /** 고정 방어(장비) */
  readonly defenseFlat: number;
  /** 회피(2차 스탯 ‰) */
  readonly evadePm: number;
  readonly elements: readonly number[];
  /** 속성별 저항 ‰(장비·스킬·종). 1000이면 그 속성 피해 0, 음수면 약점 */
  readonly resistPm: readonly number[];
}

export interface Rolls {
  readonly hit: number;
  readonly evade: number;
  readonly crit: number;
}

export type AttackOutcome = "miss" | "evaded" | "hit";

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const toSafe = (value: bigint): number => Number(value < 0n ? 0n : value > SAFE ? SAFE : value);

/** 무기 틀(D-420): 무기 값 × min(2000, 유닛 값 × 1000 ÷ 적정치) ÷ 1000. 적정치가 0 이하면 무기 값 그대로 */
export function weaponScaled(weaponValue: number, unitValue: number, appropriate: number): number {
  if (appropriate <= 0) return weaponValue;
  const ratio = Math.min(2000, Math.floor((Math.max(0, unitValue) * 1000) / appropriate));
  return toSafe((BigInt(weaponValue) * BigInt(ratio)) / 1000n);
}

/** 속성 항(‰, 0 이상): 1000 + Σ 공격자 속성값 × 스킬 계수 + 방어 상성 항(공격 계열을 스킬 계수 비중으로 평균) */
export function elementTermPm(attack: AttackProfile, defense: DefenseProfile, c: CombatCoefficients): number {
  let add = 0;
  const weight = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const coef = attack.skillElementsPm[i] ?? 0;
    add += (attack.elements[i] ?? 0) * coef;
    weight[i >> 1] = (weight[i >> 1] ?? 0) + coef;
  }
  let weightSum = 0;
  let affinity = 0;
  for (let f = 0; f < 6; f++) {
    const w = weight[f] ?? 0;
    if (w === 0) continue;
    weightSum += w;
    let term = 0;
    for (let g = 0; g < 6; g++)
      term +=
        (c.affinityPm[f]?.[g] ?? 0) *
        ((defense.elements[g * 2] ?? 0) + (defense.elements[g * 2 + 1] ?? 0) * 2);
    affinity += w * term;
  }
  const value = 1000 + add + (weightSum === 0 ? 0 : Math.trunc(affinity / weightSum));
  return value < 0 ? 0 : value;
}

/** 속성 저항(‰): 스킬 계수 비중으로 평균 */
function resistPm(attack: AttackProfile, defense: DefenseProfile): number {
  let sum = 0;
  let weights = 0;
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const coef = attack.skillElementsPm[i] ?? 0;
    if (coef === 0) continue;
    sum += coef * (defense.resistPm[i] ?? 0);
    weights += coef;
  }
  return weights === 0 ? 0 : Math.trunc(sum / weights);
}

/** 공격 한 번. rolls = 시드 굴림 셋(각 0~9999) */
export function resolveAttack(
  attack: AttackProfile,
  defense: DefenseProfile,
  rolls: Rolls,
  c: CombatCoefficients,
): { outcome: AttackOutcome; crit: boolean; amount: number } {
  const hitPm = weaponScaled(attack.weaponHitPm, attack.hitStat, attack.hitAppropriate);
  if (rolls.hit >= hitPm * 10) return { outcome: "miss", crit: false, amount: 0 };
  if (rolls.evade < defense.evadePm * 10) return { outcome: "evaded", crit: false, amount: 0 };
  const crit = rolls.crit < weaponScaled(attack.weaponCritPm, attack.critStat, attack.critAppropriate) * 10;
  let value = BigInt(weaponScaled(attack.weaponAttack, attack.attackStat, attack.attackAppropriate));
  if (attack.kind === "physical") {
    const rate = Math.min(1000, Math.max(0, defense.defenseRatePm - attack.penetrationPm));
    value = (value * BigInt(1000 - rate)) / 1000n;
  }
  value = (value * BigInt(elementTermPm(attack, defense, c))) / 1000n;
  if (crit) value = (value * BigInt(Math.max(0, attack.critMulPm))) / 1000n;
  value = (value * BigInt(Math.max(0, attack.skillMulPm))) / 1000n;
  value = (value * BigInt(Math.max(0, attack.buffPm))) / 1000n;
  if (attack.kind === "physical") value -= BigInt(defense.defenseFlat);
  else value = (value * BigInt(1000 - resistPm(attack, defense))) / 1000n;
  return { outcome: "hit", crit, amount: toSafe(value) };
}

/** 건물 피해(D-5043): 물리만, 방어 없이 실제 공격력 × 스킬 × 버프 × 건물 배율 */
export function buildingDamage(attack: AttackProfile, buildingMulPm: number, _c: CombatCoefficients): number {
  if (attack.kind !== "physical") return 0;
  let value = BigInt(weaponScaled(attack.weaponAttack, attack.attackStat, attack.attackAppropriate));
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
  /** 공격력 × 배율(‰, 스킬 배율 칸) */
  readonly attackMulPm: number;
  /** 무기 공격력 가산 */
  readonly weaponAdd: number;
  /** 방어 관통 더하기(‰) */
  readonly penetrationPm: number;
  /** 속성 공격 계수(12칸, 속성값 1점당 ‰). 속성 스킬은 이 계수를 쓴다 */
  readonly elementPm: readonly number[];
}

/** 스킬 한 번의 공격 사양: 기본 공격 사양에 공식 부품을 얹는다 */
export function skillAttack(base: AttackProfile, skill: SkillFormula): AttackProfile {
  const kind = skill.damage === "elemental" ? "elemental" : "physical";
  return {
    ...base,
    kind,
    weaponAttack: base.weaponAttack + skill.weaponAdd,
    skillMulPm: skill.attackMulPm,
    penetrationPm: base.penetrationPm + skill.penetrationPm,
    skillElementsPm: kind === "elemental" ? skill.elementPm : base.skillElementsPm,
  };
}

/** 회복량 = 최대 체력 × ‰(공식 부품 heal) */
export function healAmount(maxHp: number, healPm: number): number {
  return toSafe((BigInt(maxHp) * BigInt(Math.max(0, healPm))) / 1000n);
}
