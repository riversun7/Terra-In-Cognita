// 전투 자료 묶음 — 스탯 표·효과 사전·스킬·장비·유닛 종류(칸 배치). docs/adr/2026-10-31-combat-core.md 7절
// 원본은 콘텐츠 팩(`stat_rows`·`effects`·`skills`·`items`의 equip 칸·`unit_kinds`)이고, 실행 도구가 팩에서 이 모양을 만든다.
// TEST_COMBAT_CATALOG는 시험·기본값이고 팩의 임시 자료와 같은 값이다. [임시] 모든 수치(기획 Step 5·본문 48 전).
import type { EffectDef } from "./effects.ts";
import type { EquipDef, SlotKind } from "./equipment.ts";
import { type CombatSkill, type SkillData, skillFromData } from "./skills.ts";
import { type StatRow, TEST_STAT_TABLE } from "./stats.ts";
import type { WeaponSpec } from "./unitSpec.ts";

/** 유닛 종류(D-422 장비 칸, D-427 스킬 칸). 칸 수는 구조 값(D-5054) */
export interface UnitKindDef {
  readonly id: string;
  readonly slots: readonly SlotKind[];
  readonly skillSlots: { readonly base: number; readonly perRebirth: number; readonly max: number };
}

export interface CombatCatalog {
  readonly statTable: readonly StatRow[];
  readonly effects: readonly EffectDef[];
  readonly skills: readonly SkillData[];
  readonly equipment: readonly EquipDef[];
  readonly unitKinds: readonly UnitKindDef[];
}

/** [임시] 맨손(무기 칸이 비었을 때) */
export const UNARMED: WeaponSpec = {
  kind: "physical",
  attack: 5,
  attackAppropriate: 20,
  hitPm: 850,
  hitAppropriate: 500,
  critPm: 50,
  critAppropriate: 200,
  intervalMs: 1000,
  speedAppropriate: 100,
  range: 1,
  arc: false,
  staminaCost: 2,
  mpCost: 0,
};

const ELEMENTS = 12;
const fireOnly = Array.from({ length: ELEMENTS }, (_, i) => (i === 2 ? 100 : 0));
const COMMON: readonly SlotKind[] = ["weapon", "offhand", "head", "body", "accessory", "accessory"];
const GRADES = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 2000];

export const TEST_COMBAT_CATALOG: CombatCatalog = {
  statTable: TEST_STAT_TABLE,
  effects: [
    { id: "burn", kind: "dot", valueMode: "flat", tickMs: 1000, stacking: "stack", maxStacks: 3 },
    {
      id: "stun",
      kind: "status",
      status: "stun",
      valueMode: "flat",
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
      resist: { cap: 800, halfConstant: 100, weights: [0, 0, 0, 1000, 0, 200] },
    },
    {
      id: "attack_up",
      kind: "buff",
      stat: "attack",
      valueMode: "permille",
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
    },
    {
      id: "defense_down",
      kind: "debuff",
      stat: "defense_rate",
      valueMode: "flat",
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
    },
    {
      id: "guard",
      kind: "buff",
      stat: "defense_rate",
      valueMode: "flat",
      tickMs: 0,
      stacking: "ignore",
      maxStacks: 1,
    },
    { id: "mend", kind: "heal", valueMode: "permille", tickMs: 0, stacking: "refresh", maxStacks: 1 },
  ],
  skills: [
    {
      id: "power_strike",
      trigger: "active",
      resource: "stamina",
      cost: 10,
      castMs: 0,
      cooldownMs: 5000,
      target: "enemy",
      range: 1,
      radius: 0,
      damage: "physical",
      formula: [
        { part: "attack_mul", pm: 1800 },
        { part: "penetration", pm: 150 },
      ],
      conditions: [{ part: "appropriate_met" }],
      effects: [{ effect: "defense_down", value: 100, chancePm: 1000, durationMs: 4000 }],
      gradePm: GRADES,
    },
    {
      id: "fire_bolt",
      trigger: "active",
      resource: "mp",
      cost: 15,
      castMs: 800,
      cooldownMs: 4000,
      target: "enemy",
      range: 6,
      radius: 0,
      damage: "elemental",
      formula: [
        { part: "attack_mul", pm: 1200 },
        { part: "element", element: 2, pm: 100 },
      ],
      conditions: [],
      effects: [{ effect: "burn", value: 5, chancePm: 600, durationMs: 3000 }],
      gradePm: GRADES,
    },
    {
      id: "shock_bash",
      trigger: "active",
      resource: "stamina",
      cost: 15,
      castMs: 0,
      cooldownMs: 8000,
      target: "enemy",
      range: 1,
      radius: 0,
      damage: "physical",
      formula: [{ part: "attack_mul", pm: 800 }],
      conditions: [],
      effects: [{ effect: "stun", value: 0, chancePm: 500, durationMs: 1500 }],
      gradePm: GRADES,
    },
    {
      id: "war_cry",
      trigger: "active",
      resource: "stamina",
      cost: 10,
      castMs: 0,
      cooldownMs: 15_000,
      target: "ally",
      range: 0,
      radius: 3,
      damage: "none",
      formula: [],
      conditions: [],
      effects: [{ effect: "attack_up", value: 200, chancePm: 1000, durationMs: 6000 }],
      gradePm: GRADES,
    },
    {
      id: "first_aid",
      trigger: "active",
      resource: "stamina",
      cost: 5,
      castMs: 0,
      cooldownMs: 20_000,
      target: "self",
      range: 0,
      radius: 0,
      damage: "none",
      formula: [{ part: "heal", pm: 200 }],
      conditions: [{ part: "self_hp_below", pct: 50 }],
      effects: [],
      gradePm: GRADES,
    },
    {
      id: "iron_skin",
      trigger: "passive",
      resource: "stamina",
      cost: 0,
      castMs: 0,
      cooldownMs: 0,
      target: "self",
      range: 0,
      radius: 0,
      damage: "none",
      formula: [],
      conditions: [],
      effects: [{ effect: "guard", value: 50, chancePm: 1000, durationMs: 0 }],
      gradePm: GRADES,
    },
  ],
  equipment: [
    {
      id: "test_sword",
      slot: "weapon",
      stats: [{ stat: "crit_chance", min: 0, max: 20 }],
      weapon: {
        kind: "physical",
        attack: 20,
        attackAppropriate: 40,
        hitPm: 900,
        hitAppropriate: 500,
        critPm: 100,
        critAppropriate: 200,
        intervalMs: 1000,
        speedAppropriate: 100,
        range: 1,
        arc: false,
        staminaCost: 5,
        mpCost: 0,
      },
      skills: [],
    },
    {
      id: "test_staff",
      slot: "weapon",
      stats: [{ stat: "mp", min: 10, max: 30 }],
      weapon: {
        kind: "elemental",
        attack: 18,
        attackAppropriate: 40,
        hitPm: 900,
        hitAppropriate: 500,
        critPm: 50,
        critAppropriate: 200,
        intervalMs: 1200,
        speedAppropriate: 100,
        range: 6,
        arc: false,
        staminaCost: 2,
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
  ],
  unitKinds: [
    {
      id: "cyborg",
      slots: [...COMMON, "organ", "organ", "organ"],
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
    },
    { id: "human", slots: COMMON, skillSlots: { base: 3, perRebirth: 1, max: 10 } },
    {
      id: "android",
      slots: [...COMMON, "part", "part", "part"],
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
    },
    { id: "creature", slots: ["accessory", "saddle"], skillSlots: { base: 4, perRebirth: 1, max: 10 } },
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
