// 스탯 → 전투 유닛 사양 — docs/adr/2026-10-31-combat-core.md "스탯"
// 2차 스탯(stats.ts computeSecondary 결과)과 무기에서 전투 사양을 만든다. 서버·시뮬·(나중의) 개발자 페이지 전투 시뮬레이터가 같이 쓴다.
// 공격력 = 스탯 공격력(2차 물리·속성 공격력) + 무기 공격력 × min(N10, STR·INT ÷ 무기 적정 STR·INT)(D-502, 사용자 답 296).
// 명중·크리 = 무기 값 × min(N10, DEX ÷ 적정 DEX), 공격 간격 = 무기 간격 ÷ min(N10, AGI ÷ 적정 AGI)(사용자 답 297·298). 적정은 무기의
// 1차 적정 스탯(몫마다 하나, 없으면 비율 100%). 맨손(무기 unarmed)은 무기 몫 0, 적정 DEX·AGI = 계산식 bare_appropriate(레벨 × 1.5 + 10).
// 맨손 크리·기본 공격 간격은 옛 맨손 규칙 식(bare_crit·bare_interval, 사용자 요청 2026-11-12): 스탯이 적정을 넘으면 더 오른다.
// 무기의 속성 계수(skillElementsPm)는 물리 칸이면 옵션(속성 몫, D-459)이다.
// 무기는 공격력 칸을 물리·속성 하나 또는 둘 가진다(D-465). 스킬은 기반에 맞는 칸, 기본 공격은 basic 칸(질문 235 가).
// 맨손으로는 스킬을 쓸 수 없다(D-490, 맨손 스킬 제외): 사양에 든 무기의 칸 목록(weaponFields)을 적고, 맨손 스킬은 타고난 무기로 센다.
// HP 회복 = 2차 스탯 hp_regen, 아머 회복 = 최대 아머 HP × 설정 칸 ‰(D-514, 둘 다 분당).
import type { CombatUnitSpec } from "./battleTypes.ts";
import {
  type CombatCoefficients,
  TEST_COMBAT_COEFFICIENTS,
  armorRegenOf,
  staminaScore,
} from "./coefficients.ts";
import { UNARMED, UNARMED_ELEMENTAL } from "./catalog.ts";
import { type AttackProfile, ELEMENT_COUNT } from "./formula.ts";
import {
  attackIntervalMs,
  bareAppropriateMilli,
  bareIntervalMs,
  realStaminaRegen,
  staminaAppropriateMilli,
} from "./formulas.ts";
import type { CombatSkill } from "./skills.ts";
import type { Primaries } from "./stats.ts";

/** 공격력 칸 종류(D-465): 물리 = 물리 공격력, 속성 = 속성 공격력(m.atk) */
export type AttackField = AttackProfile["kind"];

/** 무기 공격력 칸 하나(D-465): 무기 공격력(공격력 = 스탯 공격력 + 이 값 × 적정 비율, D-502) */
export interface WeaponAttackField {
  readonly attack: number;
}

/**
 * 무기 1차 적정 스탯(D-502, 사용자 답 296~298): 몫마다 하나 — str 물리 공격 몫, int 속성 공격 몫, dex 명중·크리, agi 공격 간격.
 * 없는 칸(또는 0 이하)은 비율 100%. 1차를 섞지 않는다
 */
export interface WeaponAppropriate {
  readonly str?: number | undefined;
  readonly int?: number | undefined;
  readonly dex?: number | undefined;
  readonly agi?: number | undefined;
}

export interface WeaponSpec {
  /**
   * 공격력 칸(D-465): 하나 또는 둘(마검 등). 스킬은 기반(물리·속성)에 맞는 칸을 쓰고, 든 무기에 그 칸이 없으면 그 스킬을 쓸 수 없다
   * (D-490, 맨손 스킬 제외). 칸이 하나도 없으면 틀린 자료다(팩 검사가 막는다)
   */
  readonly physical?: WeaponAttackField | undefined;
  readonly elemental?: WeaponAttackField | undefined;
  /** 기본 공격(스킬 없음)이 쓰는 칸(질문 235 가): 두 칸 무기는 꼭 적는다(팩 검사). 없으면 그 무기의 한 칸 */
  readonly basic?: AttackField | undefined;
  /** 1차 적정 스탯(D-502). 없으면 모든 몫이 비율 100% */
  readonly appropriate?: WeaponAppropriate | undefined;
  readonly hitPm: number;
  readonly critPm: number;
  /** 기본 공격 간격(ms) */
  readonly intervalMs: number;
  readonly range: number;
  readonly arc: boolean;
  /** 공격 한 번에 드는 스태미나(걷기 말고 모든 행동, D-418)·MP(속성) */
  readonly staminaCost: number;
  readonly mpCost: number;
  readonly skillElementsPm?: readonly number[] | undefined;
  /**
   * 맨손(타고난 무기·맨손 속성 자료, 팩 unit_kinds unarmed, D-502): 무기 몫이 없고(공격력 = 스탯 공격력) 적정 DEX·AGI는 계산식
   * bare_appropriate(레벨 × 1.5 + 10). 크리쳐 발톱 같은 다른 타고난 무기는 무기와 같다(무기 공격력·1차 적정 스탯)
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
   * 무기 칸이 비어 맨손인가(D-490): 참이면 스킬에 쓸 무기 칸이 없다(맨손 스킬만 쓴다). 타고난 무기를 무기로 치는 종류(크리쳐 발톱)는
   * 거짓이다(장비 loadoutOf의 bareHanded). 없으면 거짓(weapon을 든 무기로 본다)
   */
  readonly bareHanded?: boolean | undefined;
  /**
   * 유닛 종류의 타고난 무기(D-436)·맨손 속성 자료(D-463). 맨손 스킬(D-490)이 쓴다(물리 기반 → 타고난 무기의 물리 칸,
   * 속성 기반 → 맨손 속성의 속성 칸). 없으면(그 칸이 없어도) UNARMED·UNARMED_ELEMENTAL
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
  /** 레벨(맨손 적정 DEX·AGI bare_appropriate D-502, 적정 STA 점수 stamina_appropriate D-511). 없으면 1 */
  readonly level?: number | undefined;
  readonly skills?: readonly CombatSkill[] | undefined;
}

const ZERO = Array.from({ length: ELEMENT_COUNT }, () => 0);

/** 적정 1차 → 밀리점(없거나 0 이하면 0 = 적정 없음) */
const milliOf = (value: number | undefined): number => (value === undefined || value <= 0 ? 0 : value * 1000);

/**
 * 무기 몫마다 적정치(밀리점, D-502): 공격 몫(물리 STR·속성 INT), DEX(명중·크리), AGI(공격 간격). 맨손은 공격 몫 없음(무기 몫 0)이고
 * DEX·AGI = bareMilli(bare_appropriate 식 값). @terra/shared weaponAppropriateMilli(계산식 미리 보기)와 같은 규칙이다
 */
export function appropriateMilliOf(
  weapon: Pick<WeaponSpec, "appropriate" | "unarmed">,
  kind: AttackField,
  bareMilli: number,
): { readonly attack: number; readonly dex: number; readonly agi: number } {
  if (weapon.unarmed === true) return { attack: 0, dex: bareMilli, agi: bareMilli };
  const a = weapon.appropriate;
  return {
    attack: milliOf(kind === "physical" ? a?.str : a?.int),
    dex: milliOf(a?.dex),
    agi: milliOf(a?.agi),
  };
}

/** 무기의 공격력 칸 목록(물리 먼저) */
export function weaponFieldsOf(weapon: WeaponSpec): AttackField[] {
  const fields: AttackField[] = [];
  if (weapon.physical) fields.push("physical");
  if (weapon.elemental) fields.push("elemental");
  return fields;
}

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
  // 맨손 적정 DEX·AGI(밀리점): 유닛 레벨로 한 번 셈한다(계산식 bare_appropriate)
  const bareMilli = bareAppropriateMilli(body.level ?? 1, c);
  // 적정 STA 점수(밀리점, D-511 계산식 stamina_appropriate): 유닛 레벨로 한 번. 1차가 없으면(시험) 적정 점수를 STA 점수로 본다(배율 1)
  const levelStaminaMilli = staminaAppropriateMilli(body.level ?? 1, c);
  const sta = p ? staminaScore(primaries, c) : Math.floor(levelStaminaMilli / 1000);
  const staAppropriate = p ? levelStaminaMilli : sta * 1000;
  /**
   * 무기의 한 칸 → 공격 사양(D-502): 스탯 공격력(물리 칸 = 물리 공격력, 속성 칸 = 속성 공격력) + 무기 몫(무기 공격력 × 적정 비율,
   * 맨손 0). 명중·크리·옵션 계수는 무기 값, 적정은 무기의 1차 적정 스탯(맨손은 레벨 식)
   */
  const profileOf = (weapon: WeaponSpec, kind: AttackField, field: WeaponAttackField): AttackProfile => {
    const appropriate = appropriateMilliOf(weapon, kind, bareMilli);
    return {
      kind,
      statAttack: kind === "physical" ? s("physical_attack") : s("elemental_attack"),
      weaponAttack: weapon.unarmed === true ? 0 : field.attack,
      attackPrimary: kind === "physical" ? (primaries[0] ?? 0) : (primaries[4] ?? 0),
      attackAppropriateMilli: appropriate.attack,
      weaponHitPm: weapon.hitPm,
      weaponCritPm: weapon.critPm,
      // 맨손 자료면 크리는 맨손 식(bare_crit, 사용자 요청 2026-11-12). 무기 사양에는 칸을 두지 않는다(옛 스냅숏·시뮬 바이트 그대로)
      ...(weapon.unarmed === true ? { unarmed: true } : {}),
      dex: primaries[1] ?? 0,
      dexAppropriateMilli: appropriate.dex,
      critMulPm: s("crit_multiplier"),
      agi: primaries[2],
      penetrationPm: body.penetrationPm ?? 0,
      skillMulPm: 1000,
      buffPm: 1000,
      elements: body.elements ?? ZERO,
      skillElementsPm: weapon.skillElementsPm ?? ZERO,
    };
  };
  const basic = basicFieldOf(w);
  const basicField = w[basic];
  if (!basicField) throw new RangeError(`weapon has no ${basic} attack field`);
  const attack = profileOf(w, basic, basicField);
  /** 맨손 자료의 칸(유닛 종류의 타고난 무기·맨손 속성 자료, 그 칸이 없으면 기본값) */
  const naturalProfile = (
    kind: AttackField,
    natural: WeaponSpec | undefined,
    fallback: WeaponSpec,
    fallbackField: WeaponAttackField,
  ): AttackProfile => {
    const own = natural?.[kind];
    return natural && own ? profileOf(natural, kind, own) : profileOf(fallback, kind, fallbackField);
  };
  const bareHandAttack = {
    physical: naturalProfile("physical", body.naturalWeapon, UNARMED, UNARMED.physical),
    elemental: naturalProfile(
      "elemental",
      body.naturalElementalWeapon,
      UNARMED_ELEMENTAL,
      UNARMED_ELEMENTAL.elemental,
    ),
  };
  /**
   * 스킬 기반의 공격 사양(D-465): 든 무기에 그 칸이 있으면 그 칸. 없으면 그 기반의 스킬은 쓸 수 없고(D-490, skillUsable이 막는다)
   * 맨손 자료를 넣어 둔다(필요한 칸이 any인 피해 없는 스킬의 적정 조건만 본다)
   */
  const skillProfile = (kind: AttackField): AttackProfile => {
    const held = w[kind];
    if (held) return kind === basic ? attack : profileOf(w, kind, held);
    return bareHandAttack[kind];
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
    skillAttack: { physical: skillProfile("physical"), elemental: skillProfile("elemental") },
    weaponFields: body.bareHanded === true ? [] : weaponFieldsOf(w),
    bareHandAttack,
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
    // 맨손 기본 공격은 맨손 식 bare_interval(옛 맨손 공속 min(2, AGI ÷ 적정)·최소 0.5, 사용자 요청 2026-11-12), 무기는 attack_interval
    attackIntervalMs:
      w.unarmed === true
        ? bareIntervalMs(w.intervalMs, primaries[2] ?? 0, bareMilli, c)
        : attackIntervalMs(w.intervalMs, primaries[2] ?? 0, appropriateMilliOf(w, basic, bareMilli).agi, c),
    moveIntervalMs: body.moveIntervalMs,
    staminaMax: Math.max(0, s("stamina")),
    staminaCost: w.staminaCost,
    staminaScore: sta,
    staminaAppropriateMilli: staAppropriate,
    // 실제 회복 = 2차 스탯 스태미나 회복 × min(2, 점수 ÷ 적정)(계산식 real_stamina_regen, D-511)
    staminaRegen: realStaminaRegen(Math.max(0, s("stamina_regen")), sta, staAppropriate, c),
    mpMax: Math.max(0, s("mp")),
    mpCost: w.mpCost,
    mpRegen: Math.max(0, s("mp_regen")),
    shieldRegen: Math.max(0, s("shield_regen")),
    // HP 회복(2차 스탯 hp_regen, D-514)·아머 회복(최대 × N54 설정 칸): 전투 중에도 쉴드처럼 찬다
    hpRegen: Math.max(0, s("hp_regen")),
    armorRegen: armorRegenOf(Math.max(0, s("armor_hp")), c),
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
