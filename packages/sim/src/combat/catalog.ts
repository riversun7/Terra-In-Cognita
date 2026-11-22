// 전투 자료 묶음 — 스탯 표·효과 사전·스킬·장비·유닛 종류(칸 배치). docs/adr/2026-10-31-combat-core.md 7절
// 원본은 콘텐츠 팩(`stat_rows`·`effects`·`skills`·`items`의 equip 칸·`unit_kinds`)이고, 실행 도구가 팩에서 이 모양을 만든다.
// TEST_COMBAT_CATALOG는 시험·기본값이고 팩의 임시 자료와 같은 값이다(마법 스킬·속성 지팡이는 catalogMagic.ts). [임시] 모든 수치(기획 Step 5·본문 48 전).
import {
  MAGIC_EFFECTS,
  MAGIC_SKILLS,
  MAGIC_STAFFS,
  TEST_WEAPON_AGI,
  TEST_WEAPON_DEX,
} from "./catalogMagic.ts";
import { DISPLACE_EFFECTS } from "./moveParts.ts";
import type { EffectDef } from "./effects.ts";
import type { EquipDef, SlotKind } from "./equipment.ts";
import { type CombatSkill, type SkillData, skillFromData } from "./skills.ts";
import { type StatRow, TEST_STAT_TABLE } from "./stats.ts";
import type { WeaponAttackField, WeaponSpec } from "./unitSpec.ts";

/** 유닛 종류(D-422 장비 칸, D-427 스킬 칸). 칸 수는 구조 값(D-5054) */
export interface UnitKindDef {
  readonly id: string;
  readonly slots: readonly SlotKind[];
  readonly skillSlots: { readonly base: number; readonly perRebirth: number; readonly max: number };
  /** 타고난 무기(D-436, 사람형은 맨손). 무기 칸이 비었을 때 */
  readonly naturalWeapon: WeaponSpec;
  /** 맨손 속성 자료(D-463 211): 속성 기반 맨손 스킬이 쓴다(D-490) */
  readonly naturalElementalWeapon: WeaponSpec;
  /**
   * 타고난 무기를 스킬용 무기로 치나(D-490·D-436): 참이면 무기 칸이 비어도 타고난 무기의 칸으로 스킬을 쓴다(크리쳐 발톱).
   * 거짓이면 맨손 = 맨손 스킬만(사람형)
   */
  readonly naturalWeaponIsWeapon: boolean;
}

export interface CombatCatalog {
  readonly statTable: readonly StatRow[];
  readonly effects: readonly EffectDef[];
  readonly skills: readonly SkillData[];
  readonly equipment: readonly EquipDef[];
  readonly unitKinds: readonly UnitKindDef[];
}

/**
 * 가중치 표를 바꾼 전투 자료(밸런스 화면 가중치 칸·행 식 덮어쓰기, 시뮬 --tuning). 같은 표면 같은 묶음(같은 객체 = 같은 캐시).
 * 무기 적정은 1차 스탯 그대로라(D-502) 표가 바뀌어도 장비는 다시 셈하지 않는다
 */
export function withStatTable(catalog: CombatCatalog, table: readonly StatRow[]): CombatCatalog {
  return catalog.statTable === table ? catalog : { ...catalog, statTable: table };
}

/** 맨손 무기의 공격력 칸 말고 나머지(명중·크리·간격·사거리·비용) */
const UNARMED_BODY = {
  hitPm: 850,
  critPm: 50,
  intervalMs: 1000,
  range: 1,
  arc: false,
  staminaCost: 10,
  mpCost: 0,
};

/**
 * [임시] 사람형 맨손 무기(D-436 "맨손 무기" 데이터. 값은 기획 전 시험값). 물리 칸만 있다(물리 기반 맨손 스킬이 이 칸을 쓴다,
 * D-490). 맨손은 무기 몫이 없어(D-502) 공격력 = 스탯 공격력이고, 적정 DEX·AGI는 계산식 bare_appropriate(레벨 × 1.5 + 10,
 * Lv 1 = 11.5: 새 사이보그 명중 850‰ × 10 ÷ 11.5 = 738‰)
 */
export const UNARMED: WeaponSpec & { readonly physical: WeaponAttackField } = {
  physical: { attack: 0 },
  ...UNARMED_BODY,
  unarmed: true,
};

/**
 * [임시] 맨손 속성 자료(D-463 211): 속성 기반 맨손 스킬(D-490)이 쓰는 무기 자료. 맨손 무기(D-436)처럼 유닛 종류 데이터
 * (팩 unit_kinds naturalElementalWeapon)이고, 속성 칸만 있다. 맨손이라 무기 몫 0(D-502). 기본 공격에는 쓰지 않는다
 */
export const UNARMED_ELEMENTAL: WeaponSpec & { readonly elemental: WeaponAttackField } = {
  elemental: { attack: 0 },
  ...UNARMED_BODY,
  unarmed: true,
};

/** [임시] 크리쳐 타고난 무기(D-436, 종 데이터 전 단계): 무기와 같은 공식(D-502), 공격력 12·적정 STR 15(= 12 × 1.25)·DEX·AGI 12 */
const CLAWS: WeaponSpec = {
  ...UNARMED_BODY,
  physical: { attack: 12 },
  appropriate: { str: 15, dex: TEST_WEAPON_DEX, agi: TEST_WEAPON_AGI },
  hitPm: 850,
  critPm: 100,
  intervalMs: 900,
};

const ELEMENTS = 12;
const fireOnly = Array.from({ length: ELEMENTS }, (_, i) => (i === 2 ? 100 : 0));
const COMMON: readonly SlotKind[] = ["weapon", "offhand", "head", "body", "accessory", "accessory"];
const GRADES = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 2000];

export const TEST_COMBAT_CATALOG: CombatCatalog = {
  statTable: TEST_STAT_TABLE,
  effects: [
    {
      id: "burn",
      durationMs: 3000,
      kind: "dot",
      valueMode: "flat",
      tickMs: 1000,
      stacking: "stack",
      maxStacks: 3,
    },
    {
      id: "stun",
      durationMs: 1500,
      kind: "status",
      status: "stun",
      valueMode: "flat",
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
      resist: { cap: 600, halfConstant: 100, weights: [0, 0, 0, 1000, 0, 200] },
    },
    {
      id: "attack_up",
      durationMs: 6000,
      kind: "buff",
      stat: "attack",
      valueMode: "permille",
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
    },
    {
      id: "defense_down",
      durationMs: 4000,
      kind: "debuff",
      stat: "defense_rate",
      valueMode: "flat",
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
    },
    {
      id: "guard",
      durationMs: 0,
      kind: "buff",
      stat: "defense_rate",
      valueMode: "flat",
      tickMs: 0,
      stacking: "ignore",
      maxStacks: 1,
    },
    {
      id: "mend",
      durationMs: 0,
      kind: "heal",
      valueMode: "permille",
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
    },
    ...MAGIC_EFFECTS,
    // 밀림 상태이상(질문 1806 → D-429, 팩과 같은 차례·값)
    ...DISPLACE_EFFECTS,
    // 신전 축복(D-571 답 1968 — 기도하면 걸리는 이동 속도 버프, 값·시간은 서버가 설정 칸으로 건다, 팩과 같은 값)
    {
      id: "temple_blessing",
      durationMs: 1_800_000,
      kind: "buff",
      stat: "move_speed",
      valueMode: "permille",
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
    },
  ],
  skills: [
    {
      id: "power_strike",
      shape: "single",
      trigger: "active",
      resource: "stamina",
      cost: 10,
      castMs: 0,
      cooldownMs: 5000,
      target: "enemy",
      range: 1,
      radius: 0,
      damage: "physical",
      base: "physical",
      formula: [
        { part: "attack_mul", pm: 1800 },
        { part: "penetration", pm: 150 },
      ],
      conditions: [{ part: "appropriate_met" }],
      effects: [{ effect: "defense_down", value: 100, chancePm: 1000 }],
      gradePm: GRADES,
    },
    {
      id: "fire_bolt",
      shape: "projectile",
      trigger: "active",
      resource: "mp",
      cost: 15,
      castMs: 800,
      cooldownMs: 4000,
      target: "enemy",
      range: 6,
      radius: 0,
      damage: "elemental",
      base: "elemental",
      formula: [
        { part: "attack_mul", pm: 1200 },
        { part: "element", element: 2, pm: 100 },
      ],
      conditions: [],
      effects: [{ effect: "burn", value: 5, chancePm: 600 }],
      gradePm: GRADES,
    },
    {
      id: "shock_bash",
      shape: "single",
      trigger: "active",
      resource: "stamina",
      cost: 15,
      castMs: 0,
      cooldownMs: 8000,
      target: "enemy",
      range: 1,
      radius: 0,
      damage: "physical",
      base: "physical",
      formula: [{ part: "attack_mul", pm: 800 }],
      conditions: [],
      effects: [{ effect: "stun", value: 0, chancePm: 500 }],
      gradePm: GRADES,
    },
    {
      id: "war_cry",
      shape: "buff",
      trigger: "active",
      resource: "stamina",
      cost: 10,
      castMs: 0,
      cooldownMs: 15_000,
      target: "ally",
      range: 0,
      radius: 3,
      damage: "none",
      base: "physical",
      formula: [],
      conditions: [],
      effects: [{ effect: "attack_up", value: 200, chancePm: 1000 }],
      gradePm: GRADES,
    },
    {
      id: "first_aid",
      shape: "heal",
      trigger: "active",
      resource: "stamina",
      cost: 5,
      castMs: 0,
      cooldownMs: 20_000,
      target: "self",
      range: 0,
      radius: 0,
      damage: "none",
      base: "physical",
      formula: [{ part: "heal", pm: 200 }],
      conditions: [{ part: "self_hp_below", pct: 50 }],
      effects: [],
      gradePm: GRADES,
    },
    {
      id: "iron_skin",
      shape: "buff",
      trigger: "passive",
      resource: "stamina",
      cost: 0,
      castMs: 0,
      cooldownMs: 0,
      target: "self",
      range: 0,
      radius: 0,
      damage: "none",
      base: "physical",
      formula: [],
      conditions: [],
      effects: [{ effect: "guard", value: 50, chancePm: 1000 }],
      gradePm: GRADES,
    },
    ...MAGIC_SKILLS,
  ],
  // 시험 무기의 1차 적정 스탯(D-502 [임시]): 공격 적정 = 무기 공격력 × 1.25(사용자 예 "공격력 20·적정 STR 25 검"), DEX·AGI 12.
  // 시험 검의 옵션 줄은 크리 점수 행(crit_chance)이 꺼져 크리 배율(crit_multiplier)로 옮겼다
  equipment: [
    {
      id: "test_sword",
      slot: "weapon",
      stats: [{ stat: "crit_multiplier", min: 0, max: 100 }],
      weapon: {
        physical: { attack: 20 },
        appropriate: { str: 25, dex: TEST_WEAPON_DEX, agi: TEST_WEAPON_AGI },
        hitPm: 900,
        critPm: 100,
        intervalMs: 1000,
        range: 1,
        arc: false,
        staminaCost: 10,
        mpCost: 0,
      },
      skills: [],
    },
    {
      id: "test_staff",
      slot: "weapon",
      stats: [{ stat: "mp", min: 10, max: 30 }],
      weapon: {
        elemental: { attack: 18 },
        appropriate: { int: 23, dex: TEST_WEAPON_DEX, agi: TEST_WEAPON_AGI },
        hitPm: 900,
        critPm: 50,
        intervalMs: 1200,
        range: 6,
        arc: false,
        staminaCost: 10,
        mpCost: 5,
        skillElementsPm: fireOnly,
      },
      skills: ["fire_bolt"],
    },
    {
      id: "test_vest",
      slot: "body",
      stats: [
        { stat: "defense_rate", min: 30, max: 60 },
        { stat: "armor_hp", min: 20, max: 40 },
      ],
      skills: [],
    },
    { id: "test_helmet", slot: "head", stats: [{ stat: "armor_hp", min: 10, max: 20 }], skills: [] },
    { id: "test_ring", slot: "accessory", stats: [{ stat: "str", min: 1, max: 3 }], skills: [] },
    // 속성값 불 2·빙결 3(D-450: 인공장기 스탯 묶음의 속성값 칸). 사이보그 시안이 코드에 박던 값을 팩으로 옮겼다(아이템 편집기 WP-5)
    {
      id: "test_heart",
      slot: "organ",
      stats: [{ stat: "vit", min: 2, max: 4 }],
      skills: [],
      elements: { fire: 2, frost: 3 },
    },
    ...MAGIC_STAFFS,
  ],
  unitKinds: [
    {
      id: "cyborg",
      slots: [...COMMON, "organ", "organ", "organ"],
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
      naturalWeapon: UNARMED,
      naturalElementalWeapon: UNARMED_ELEMENTAL,
      naturalWeaponIsWeapon: false,
    },
    {
      id: "human",
      slots: COMMON,
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
      naturalWeapon: UNARMED,
      naturalElementalWeapon: UNARMED_ELEMENTAL,
      naturalWeaponIsWeapon: false,
    },
    {
      id: "android",
      slots: [...COMMON, "part", "part", "part"],
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
      naturalWeapon: UNARMED,
      naturalElementalWeapon: UNARMED_ELEMENTAL,
      naturalWeaponIsWeapon: false,
    },
    // 크리쳐 장비 3칸: 전용 무기·방어구(몸)·장신구(D-494, "크리쳐 2칸"을 바꿈). 타고난 무기(발톱)는 무기 칸이 비었을 때 쓴다
    {
      id: "creature",
      slots: ["weapon", "body", "accessory"],
      skillSlots: { base: 4, perRebirth: 1, max: 10 },
      naturalWeapon: CLAWS,
      naturalElementalWeapon: UNARMED_ELEMENTAL,
      naturalWeaponIsWeapon: true,
    },
  ],
};

/** 스킬 ID 목록 → 전투용 스킬(등급 하나). 모르는 ID는 RangeError */
export function skillsOf(catalog: CombatCatalog, ids: readonly string[], grade = 1): CombatSkill[] {
  const effects = new Map(catalog.effects.map((effect) => [effect.id, effect]));
  const byId = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  return ids.map((id) => {
    const data = byId.get(id);
    if (!data) throw new RangeError(`unknown skill ${id}`);
    return skillFromData(data, grade, effects);
  });
}
