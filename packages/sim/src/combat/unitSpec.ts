// 스탯 → 전투 유닛 사양 — docs/adr/2026-10-31-combat-core.md "스탯"
// 2차 스탯(stats.ts computeSecondary 결과)과 무기에서 전투 사양을 만든다. 서버·시뮬·(나중의) 개발자 페이지 전투 시뮬레이터가 같이 쓴다.
// 공격 간격 = 무기 간격 × 1000 ÷ min(2000, 행동 속도 × 1000 ÷ 무기 적정 속도)(D-418 행동 속도 점수, D-420 같은 틀).
// 명중·크리도 점수(D-458): 무기 값 × min(2, 점수 ÷ 적정). 무기의 속성 계수(skillElementsPm)는 물리 칸이면 옵션(속성 몫, D-459)이다.
// 무기는 공격력 칸을 물리·속성 하나 또는 둘 가진다(D-465). 스킬은 기반에 맞는 칸(없으면 맨손·맨손 속성), 기본 공격은 basic 칸(질문 235 가).
// 공격 간격은 계산식 attack_interval(기본 = 위 틀), 맨손 기본 공격(무기 unarmed)은 맨손 식 bare_attack(D-488, formula.ts realAttackOf).
import type { CombatUnitSpec } from "./battleTypes.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS, staminaScore } from "./coefficients.ts";
import { UNARMED, UNARMED_ELEMENTAL } from "./catalog.ts";
import { type AttackProfile, ELEMENT_COUNT } from "./formula.ts";
import { attackIntervalMs } from "./formulas.ts";
import type { CombatSkill } from "./skills.ts";
import type { Primaries } from "./stats.ts";

/** 공격력 칸 종류(D-465): 물리 = 물리 공격력, 속성 = 속성 공격력(m.atk) */
export type AttackField = AttackProfile["kind"];

/** 무기 공격력 칸 하나(D-465): 공격력과 적정치(2차 스탯 단위, 무기 틀 D-420) */
export interface WeaponAttackField {
  readonly attack: number;
  readonly attackAppropriate: number;
}

export interface WeaponSpec {
  /**
   * 공격력 칸(D-465): 하나 또는 둘(마검 등). 스킬은 기반(물리·속성)에 맞는 칸을 쓰고, 든 무기에 없으면 유닛 종류의
   * 맨손(타고난 무기 D-436)·맨손 속성 자료(D-463)의 칸을 쓴다. 칸이 하나도 없으면 틀린 자료다(팩 검사가 막는다)
   */
  readonly physical?: WeaponAttackField | undefined;
  readonly elemental?: WeaponAttackField | undefined;
  /** 기본 공격(스킬 없음)이 쓰는 칸(질문 235 가): 두 칸 무기는 꼭 적는다(팩 검사). 없으면 그 무기의 한 칸 */
  readonly basic?: AttackField | undefined;
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
  /**
   * 사람형 맨손(타고난 무기, 팩 unit_kinds naturalWeapon unarmed): 기본 공격의 실제 공격력을 맨손 식(bare_attack, D-488)으로
   * 셈한다. 크리쳐 발톱 같은 다른 타고난 무기는 무기 틀 그대로(질문 275)
   */
  readonly unarmed?: boolean | undefined;
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
   * 유닛 종류의 타고난 무기(D-436)·맨손 속성 자료(D-463). 든 무기에 스킬 기반의 칸이 없을 때 쓴다(D-465:
   * 물리 기반 + 물리 칸 없음 → 맨손의 물리 칸, 속성 기반 + 속성 칸 없음 → 맨손 속성의 속성 칸). 없으면(그 칸이 없어도) UNARMED·UNARMED_ELEMENTAL
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
  /** 레벨(맨손 식의 적정 DEX, D-488). 없으면 1 */
  readonly level?: number | undefined;
  readonly skills?: readonly CombatSkill[] | undefined;
}

const ZERO = Array.from({ length: ELEMENT_COUNT }, () => 0);

/** 기본 공격이 쓰는 칸(질문 235 가): 적은 칸(basic), 없으면 그 무기의 한 칸(물리 먼저) */
export function basicFieldOf(weapon: WeaponSpec): AttackField {
  return weapon.basic ?? (weapon.physical ? "physical" : "elemental");
}

export function specFromStats(
  body: UnitBody,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
): CombatUnitSpec {
  const p = body.primaries;
  const primaries = p ? [p.str, p.dex, p.agi, p.vit, p.int, p.wis] : [0, 0, 0, 0, 0, 0];
  const s = (id: string): number => body.stats[id] ?? 0;
  const w = body.weapon;
  /**
   * 무기의 한 칸 → 공격 사양(물리 칸 = 물리 공격력, 속성 칸 = 속성 공격력. 무기 틀 D-420). 명중·크리·옵션 계수는 무기 값.
   * bare = 맨손 일반 공격(D-488): 1차·레벨을 싣고 실제 공격력을 맨손 식으로 셈한다
   */
  const profileOf = (
    weapon: WeaponSpec,
    kind: AttackField,
    field: WeaponAttackField,
    bare = false,
  ): AttackProfile => ({
    ...(bare ? { unarmed: true, primaries, level: body.level ?? 1 } : {}),
    kind,
    weaponAttack: field.attack,
    attackStat: kind === "physical" ? s("physical_attack") : s("elemental_attack"),
    attackAppropriate: field.attackAppropriate,
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
  const basic = basicFieldOf(w);
  const basicField = w[basic];
  if (!basicField) throw new RangeError(`weapon has no ${basic} attack field`);
  const attack = profileOf(w, basic, basicField, w.unarmed === true && basic === "physical");
  /**
   * 스킬 기반의 공격 사양(D-465): 든 무기에 그 칸이 있으면 그 칸, 없으면 맨손(그 칸이 없으면 기본값)의 칸.
   * 맨손 식은 기본 공격에만 쓴다(스킬은 무기 틀 그대로, D-490 맨손 스킬은 스킬 편집기 몫)
   */
  const skillProfile = (
    kind: AttackField,
    natural: WeaponSpec | undefined,
    fallback: WeaponSpec,
    fallbackField: WeaponAttackField,
  ): AttackProfile => {
    const held = w[kind];
    if (held) return kind === basic && !attack.unarmed ? attack : profileOf(w, kind, held);
    const own = natural?.[kind];
    return natural && own ? profileOf(natural, kind, own) : profileOf(fallback, kind, fallbackField);
  };
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
      physical: skillProfile("physical", body.naturalWeapon, UNARMED, UNARMED.physical),
      elemental: skillProfile(
        "elemental",
        body.naturalElementalWeapon,
        UNARMED_ELEMENTAL,
        UNARMED_ELEMENTAL.elemental,
      ),
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
    attackIntervalMs: attackIntervalMs(w.intervalMs, s("action_speed"), w.speedAppropriate, c),
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
