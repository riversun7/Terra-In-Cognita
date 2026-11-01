// 스탯 → 전투 유닛 사양 — docs/adr/2026-10-31-combat-core.md "스탯"
// 2차 스탯(stats.ts computeSecondary 결과)과 무기에서 전투 사양을 만든다. 서버·시뮬·(나중의) 개발자 페이지 전투 시뮬레이터가 같이 쓴다.
// 공격 간격 = 무기 간격 × 1000 ÷ min(2000, 행동 속도 × 1000 ÷ 무기 적정 속도)(D-418 행동 속도 점수, D-420 같은 틀).
// 명중·크리도 점수(D-458): 무기 값 × min(2, 점수 ÷ 적정). 무기의 속성 계수(skillElementsPm)는 물리 무기면 옵션(속성 몫, D-459)이다.
import type { CombatUnitSpec } from "./battleTypes.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS, staminaScore } from "./coefficients.ts";
import { UNARMED, UNARMED_ELEMENTAL } from "./catalog.ts";
import { type AttackProfile, ELEMENT_COUNT } from "./formula.ts";
import type { CombatSkill } from "./skills.ts";
import type { Primaries } from "./stats.ts";

export interface WeaponSpec {
  readonly kind: "physical" | "elemental";
  readonly attack: number;
  readonly attackAppropriate: number;
  readonly hitPm: number;
  readonly hitAppropriate: number;
  readonly critPm: number;
  readonly critAppropriate: number;
  /** 기본 공격 간격(ms)과 적정 행동 속도 */
  readonly intervalMs: number;
  readonly speedAppropriate: number;
  readonly range: number;
  readonly arc: boolean;
  /** 공격 한 번에 드는 스태미나(걷기 말고 모든 행동, D-418)·MP(속성) */
  readonly staminaCost: number;
  readonly mpCost: number;
  readonly skillElementsPm?: readonly number[] | undefined;
}

export interface UnitBody {
  readonly id: number;
  readonly side: number;
  readonly party: number;
  readonly x: number;
  readonly y: number;
  /** 2차 스탯(행 ID → 값) */
  readonly stats: Readonly<Record<string, number>>;
  readonly weapon: WeaponSpec;
  /**
   * 유닛 종류의 타고난 무기(D-436)·맨손 속성 자료(D-463). 든 무기와 기반이 다른 스킬이 쓴다
   * (물리 기반 + 속성 무기 → 맨손, 속성 기반 + 물리 무기 → 맨손 속성). 없으면 UNARMED·UNARMED_ELEMENTAL
   */
  readonly naturalWeapon?: WeaponSpec | undefined;
  readonly naturalElementalWeapon?: WeaponSpec | undefined;
  /** 한 칸 가는 시간(ms, C28 전투 속도. [임시] 1칸/초 이하 = 1000 이상) */
  readonly moveIntervalMs: number;
  readonly elements?: readonly number[] | undefined;
  readonly resistPm?: readonly number[] | undefined;
  readonly defenseFlat?: number | undefined;
  readonly penetrationPm?: number | undefined;
  readonly eye?: number | undefined;
  readonly air?: boolean | undefined;
  readonly commandCap?: number | undefined;
  readonly cyborg?: boolean | undefined;
  readonly buildingMulPm?: number | undefined;
  /** 1차 스탯(장비 포함, 상태이상 저항 D-429) */
  readonly primaries?: Primaries | undefined;
  readonly skills?: readonly CombatSkill[] | undefined;
}

const ZERO = Array.from({ length: ELEMENT_COUNT }, () => 0);

export function specFromStats(
  body: UnitBody,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
): CombatUnitSpec {
  const p = body.primaries;
  const primaries = p ? [p.str, p.dex, p.agi, p.vit, p.int, p.wis] : [0, 0, 0, 0, 0, 0];
  const s = (id: string): number => body.stats[id] ?? 0;
  const w = body.weapon;
  const speedRatio = Math.min(
    2000,
    Math.floor((Math.max(1, s("action_speed")) * 1000) / Math.max(1, w.speedAppropriate)),
  );
  /** 무기 하나 → 공격 사양(물리 무기 = 물리 공격력, 속성 무기 = 속성 공격력. 무기 틀 D-420) */
  const profileOf = (weapon: WeaponSpec): AttackProfile => ({
    kind: weapon.kind,
    weaponAttack: weapon.attack,
    attackStat: weapon.kind === "physical" ? s("physical_attack") : s("elemental_attack"),
    attackAppropriate: weapon.attackAppropriate,
    weaponHitPm: weapon.hitPm,
    hitStat: s("hit"),
    hitAppropriate: weapon.hitAppropriate,
    weaponCritPm: weapon.critPm,
    critStat: s("crit_chance"),
    critAppropriate: weapon.critAppropriate,
    critMulPm: s("crit_multiplier"),
    agi: primaries[2],
    penetrationPm: body.penetrationPm ?? 0,
    skillMulPm: 1000,
    buffPm: 1000,
    elements: body.elements ?? ZERO,
    skillElementsPm: weapon.skillElementsPm ?? ZERO,
  });
  const attack = profileOf(w);
  return {
    id: body.id,
    side: body.side,
    party: body.party,
    x: body.x,
    y: body.y,
    maxHp: Math.max(1, s("hp")),
    armorHp: Math.max(0, s("armor_hp")),
    shieldHp: Math.max(0, s("shield_hp")),
    attack,
    skillAttack: {
      physical: w.kind === "physical" ? attack : profileOf(body.naturalWeapon ?? UNARMED),
      elemental:
        w.kind === "elemental" ? attack : profileOf(body.naturalElementalWeapon ?? UNARMED_ELEMENTAL),
    },
    defense: {
      defenseRatePm: s("defense_rate"),
      defenseFlat: body.defenseFlat ?? 0,
      elementalDefenseRatePm: s("elemental_defense_rate"),
      evadePm: s("evade"),
      agi: primaries[2],
      elements: body.elements ?? ZERO,
      resistPm: body.resistPm ?? ZERO,
    },
    range: w.range,
    arc: w.arc,
    attackIntervalMs: Math.max(1, Math.floor((w.intervalMs * 1000) / Math.max(1, speedRatio))),
    moveIntervalMs: body.moveIntervalMs,
    staminaMax: Math.max(0, s("stamina")),
    staminaCost: w.staminaCost,
    // 1차가 없으면(시험) 적정 점수로 본다: 소모 배율 1
    staminaScore: p ? staminaScore(primaries, c) : c.stamina.appropriateScore,
    staminaRegen: Math.max(0, s("stamina_regen")),
    mpMax: Math.max(0, s("mp")),
    mpCost: w.mpCost,
    mpRegen: Math.max(0, s("mp_regen")),
    shieldRegen: Math.max(0, s("shield_regen")),
    sight: Math.max(0, s("sight")),
    eye: body.eye ?? 16 * 180,
    air: body.air ?? false,
    commandCap: body.commandCap ?? 0,
    cyborg: body.cyborg ?? false,
    buildingMulPm: body.buildingMulPm ?? 1000,
    primaries,
    skills: body.skills ?? [],
  };
}
