// 전투 자료 묶음 — 스탯 표·효과 사전·스킬·장비·유닛 종류(칸 배치). docs/adr/2026-10-31-combat-core.md 7절
// 원본은 콘텐츠 팩(`stat_rows`·`effects`·`skills`·`items`의 equip 칸·`unit_kinds`)이고, 실행 도구가 팩에서 이 모양을 만든다.
// TEST_COMBAT_CATALOG는 시험·기본값이고 팩의 임시 자료와 같은 값이다(마법 스킬·속성 지팡이는 catalogMagic.ts). [임시] 모든 수치(기획 Step 5·본문 48 전).
import { MAGIC_EFFECTS, MAGIC_SKILLS, MAGIC_STAFFS } from "./catalogMagic.ts";
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
  /** 맨손 속성 자료(D-463 211): 속성 무기를 들지 않았을 때 속성 기반 스킬이 쓴다 */
  readonly naturalElementalWeapon: WeaponSpec;
}

export interface CombatCatalog {
  readonly statTable: readonly StatRow[];
  readonly effects: readonly EffectDef[];
  readonly skills: readonly SkillData[];
  readonly equipment: readonly EquipDef[];
  readonly unitKinds: readonly UnitKindDef[];
}

/** 맨손 무기의 공격력 칸 말고 나머지(명중·크리·간격·사거리·비용) */
const UNARMED_BODY = {
  hitPm: 850,
  hitAppropriate: 20,
  critPm: 50,
  critAppropriate: 20,
  intervalMs: 1000,
  speedAppropriate: 100,
  range: 1,
  arc: false,
  staminaCost: 10,
  mpCost: 0,
};

/**
 * [임시] 사람형 맨손 무기(D-436 "맨손 무기" 데이터. 값은 기획 전 시험값). 물리 칸만 있다(D-465: 물리 칸이 없는 무기를 든
 * 유닛의 물리 기반 스킬이 이 칸을 쓴다). 명중·크리 적정은 점수 단위(D-458):
 * 1차 모두 11쯤인 처음 유닛(명중 점수 = DEX × 1.2 + AGI × 0.6, 크리 점수 = DEX × 1.5)이 1배
 */
export const UNARMED: WeaponSpec & { readonly physical: WeaponAttackField } = {
  physical: { attack: 5, attackAppropriate: 20 },
  ...UNARMED_BODY,
  // 기본 공격의 실제 공격력은 맨손 식(bare_attack, D-488). 공격력 5·적정 20은 맨손 스킬·건물 피해의 무기 틀에만 남는다
  unarmed: true,
};

/**
 * [임시] 맨손 속성 자료(D-463 211, D-465): 속성 칸이 없는 무기를 든(또는 맨손인) 유닛이 속성 기반 스킬을 쓸 때의 무기 자료.
 * 맨손 무기(D-436)처럼 유닛 종류 데이터(팩 unit_kinds naturalElementalWeapon)이고, 속성 칸만 있으며 공격력·적정치가 낮다.
 * 기본 공격에는 쓰지 않는다
 */
export const UNARMED_ELEMENTAL: WeaponSpec & { readonly elemental: WeaponAttackField } = {
  elemental: { attack: 5, attackAppropriate: 20 },
  ...UNARMED_BODY,
};

/** [임시] 크리쳐 타고난 무기(D-436, 종 데이터 전 단계) */
const CLAWS: WeaponSpec = {
  ...UNARMED_BODY,
  physical: { attack: 12, attackAppropriate: 30 },
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
  // 시험 무기의 명중·크리 적정은 점수 단위(D-458): 시뮬레이터 유닛(1차 40 + 기술 × 8)이 옛 확률 모양 때와 비슷한 비율이 되게
  equipment: [
    {
      id: "test_sword",
      slot: "weapon",
      stats: [{ stat: "crit_chance", min: 0, max: 20 }],
      weapon: {
        physical: { attack: 20, attackAppropriate: 40 },
        hitPm: 900,
        hitAppropriate: 50,
        critPm: 100,
        critAppropriate: 100,
        intervalMs: 1000,
        speedAppropriate: 100,
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
        elemental: { attack: 18, attackAppropriate: 40 },
        hitPm: 900,
        hitAppropriate: 50,
        critPm: 50,
        critAppropriate: 100,
        intervalMs: 1200,
        speedAppropriate: 100,
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
    { id: "test_heart", slot: "organ", stats: [{ stat: "vit", min: 2, max: 4 }], skills: [] },
    ...MAGIC_STAFFS,
  ],
  unitKinds: [
    {
      id: "cyborg",
      slots: [...COMMON, "organ", "organ", "organ"],
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
      naturalWeapon: UNARMED,
      naturalElementalWeapon: UNARMED_ELEMENTAL,
    },
    {
      id: "human",
      slots: COMMON,
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
      naturalWeapon: UNARMED,
      naturalElementalWeapon: UNARMED_ELEMENTAL,
    },
    {
      id: "android",
      slots: [...COMMON, "part", "part", "part"],
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
      naturalWeapon: UNARMED,
      naturalElementalWeapon: UNARMED_ELEMENTAL,
    },
    {
      id: "creature",
      slots: ["accessory", "saddle"],
      skillSlots: { base: 4, perRebirth: 1, max: 10 },
      naturalWeapon: CLAWS,
      naturalElementalWeapon: UNARMED_ELEMENTAL,
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
