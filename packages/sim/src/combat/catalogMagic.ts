// 마법 스킬·속성 지팡이 시험 자료 — 팩(`effects`·`skills`·`items`)의 임시 자료와 같은 값(서버 시험이 맞춰 본다).
// docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-01, 마법 스킬)". 기획: 속성 12칸·6계열(50 §2, D-457), 스킬 = 부품 조합(D-428),
// 속성 스킬 = MP(D-415), 기반 칸(D-463), 무기 공격력 칸(D-465). [임시] 모든 수치(설정값 출발값 전, D-5032)
import type { EffectDef } from "./effects.ts";
import type { EquipDef } from "./equipment.ts";
import type { SkillData } from "./skills.ts";
import type { WeaponSpec } from "./unitSpec.ts";

const GRADES = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 2000];

/** 마법 스킬이 새로 쓰는 효과: 냉기(느리게, 이동 속도 ‰) */
export const MAGIC_EFFECTS: readonly EffectDef[] = [
  {
    id: "chill",
    durationMs: 3000,
    kind: "debuff",
    stat: "move_speed",
    valueMode: "permille",
    tickMs: 0,
    stacking: "refresh",
    maxStacks: 1,
  },
];

/** 속성 기반·MP 스킬(모양마다 하나 이상): 서리 화살·연쇄 번개·화염 폭발·바위 가시·치유의 빛·빛의 보호막·어둠의 저주 */
const mp = { trigger: "active", resource: "mp", base: "elemental", gradePm: GRADES } as const;

export const MAGIC_SKILLS: readonly SkillData[] = [
  {
    ...mp,
    id: "frost_bolt",
    shape: "projectile",
    cost: 14,
    castMs: 700,
    cooldownMs: 4500,
    target: "enemy",
    range: 6,
    radius: 0,
    damage: "elemental",
    // 물 × 5% + 빙결 × 5% 하이브리드(D-457 예)
    formula: [
      { part: "attack_mul", pm: 1100 },
      { part: "element", element: 0, pm: 50 },
      { part: "element", element: 1, pm: 50 },
    ],
    conditions: [],
    effects: [{ effect: "chill", value: 300, chancePm: 1000 }],
  },
  {
    ...mp,
    id: "chain_lightning",
    shape: "chain",
    cost: 22,
    castMs: 900,
    cooldownMs: 7000,
    target: "enemy",
    range: 6,
    radius: 0,
    chain: { targets: 3, jump: 3, falloffPm: 700 },
    damage: "elemental",
    formula: [
      { part: "attack_mul", pm: 1000 },
      { part: "element", element: 5, pm: 100 },
    ],
    conditions: [],
    effects: [],
  },
  {
    ...mp,
    id: "flame_burst",
    shape: "area",
    cost: 28,
    castMs: 1200,
    cooldownMs: 9000,
    target: "enemy",
    range: 5,
    radius: 2,
    damage: "elemental",
    formula: [
      { part: "attack_mul", pm: 900 },
      { part: "element", element: 2, pm: 100 },
    ],
    conditions: [],
    effects: [{ effect: "burn", value: 4, chancePm: 500 }],
  },
  {
    ...mp,
    id: "stone_spike",
    shape: "single",
    cost: 18,
    castMs: 600,
    cooldownMs: 8000,
    target: "enemy",
    range: 4,
    radius: 0,
    damage: "elemental",
    formula: [
      { part: "attack_mul", pm: 1300 },
      { part: "element", element: 6, pm: 100 },
    ],
    conditions: [],
    effects: [{ effect: "stun", value: 0, chancePm: 500, durationMs: 800 }],
  },
  {
    ...mp,
    id: "light_heal",
    shape: "heal",
    cost: 20,
    castMs: 1000,
    cooldownMs: 6000,
    target: "ally",
    range: 5,
    radius: 0,
    damage: "none",
    formula: [{ part: "heal", pm: 250 }],
    conditions: [{ part: "target_hp_below", pct: 70 }],
    effects: [],
  },
  {
    ...mp,
    id: "radiant_ward",
    shape: "buff",
    cost: 18,
    castMs: 600,
    cooldownMs: 10_000,
    target: "ally",
    range: 5,
    radius: 0,
    damage: "none",
    formula: [{ part: "shield", pm: 400 }],
    conditions: [],
    effects: [],
  },
  {
    ...mp,
    id: "dark_curse",
    shape: "debuff",
    cost: 16,
    castMs: 800,
    cooldownMs: 10_000,
    target: "enemy",
    range: 5,
    radius: 0,
    damage: "none",
    formula: [],
    conditions: [],
    effects: [{ effect: "defense_down", value: 150, chancePm: 1000, durationMs: 6000 }],
  },
];

/** 속성 칸 하나만 50‰(속성 × 5%, 48 §4.5 예와 같은 크기)인 옵션 계수 */
const only = (element: number): number[] => Array.from({ length: 12 }, (_, i) => (i === element ? 50 : 0));

/** [임시] 시험 무기의 적정 DEX·AGI(D-502): 새 사이보그(1차 모두 10)가 약간 못 미치고 Lv 30 균형형(39)은 넘는 값 */
export const TEST_WEAPON_DEX = 12;
export const TEST_WEAPON_AGI = 12;

/**
 * 속성 지팡이 사양(속성 공격력 칸만, D-465): 공격력·적정 INT(D-502 [임시] = 공격력 × 1.25 반올림)·명중·크리·간격·사거리·옵션 계수 칸.
 * 적정 DEX·AGI는 시험 무기 공통값
 */
function staff(
  attack: number,
  appropriate: number,
  hitPm: number,
  critPm: number,
  intervalMs: number,
  range: number,
  element: number,
): WeaponSpec {
  return {
    elemental: { attack },
    appropriate: { int: appropriate, dex: TEST_WEAPON_DEX, agi: TEST_WEAPON_AGI },
    hitPm,
    critPm,
    intervalMs,
    range,
    arc: false,
    staminaCost: 10,
    mpCost: 5,
    skillElementsPm: only(element),
  };
}

const MP = { stat: "mp", min: 10, max: 30 };

/** 속성 지팡이 여섯(계열마다 기본형 하나, 50 §2.1). 지팡이마다 그 계열 스킬을 장비 스킬로 준다 */
export const MAGIC_STAFFS: readonly EquipDef[] = [
  {
    id: "fire_staff",
    slot: "weapon",
    stats: [MP],
    weapon: staff(20, 25, 900, 60, 1200, 6, 2),
    skills: ["flame_burst"],
  },
  {
    id: "water_staff",
    slot: "weapon",
    stats: [MP, { stat: "mp_regen", min: 5, max: 15 }],
    weapon: staff(18, 23, 900, 50, 1200, 6, 0),
    skills: ["frost_bolt"],
  },
  {
    id: "wind_staff",
    slot: "weapon",
    stats: [MP],
    weapon: staff(16, 20, 950, 80, 1000, 7, 4),
    skills: ["chain_lightning"],
  },
  {
    id: "earth_staff",
    slot: "weapon",
    stats: [MP, { stat: "armor_hp", min: 10, max: 20 }],
    weapon: staff(24, 30, 850, 40, 1400, 5, 6),
    skills: ["stone_spike"],
  },
  {
    id: "light_staff",
    slot: "weapon",
    stats: [MP, { stat: "shield_regen", min: 5, max: 15 }],
    weapon: staff(15, 19, 900, 50, 1300, 6, 8),
    skills: ["light_heal", "radiant_ward"],
  },
  {
    id: "dark_staff",
    slot: "weapon",
    stats: [MP],
    weapon: staff(20, 25, 900, 70, 1200, 6, 10),
    skills: ["dark_curse"],
  },
];
