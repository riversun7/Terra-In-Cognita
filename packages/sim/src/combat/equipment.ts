// 장비 → 스탯 — docs/adr/2026-10-31-combat-core.md 7절, 기획 D-422(장비 칸)·D-423(올리는 스탯)·D-424(적정치 미달)·D-426·D-427(스킬 칸)
// - 칸 배치는 유닛 종류마다 자료다(콘텐츠 팩 `unit_kinds`, 구조 값 D-5054): 사람형 공통 6칸 + 종류별 강화 칸, 크리쳐 2칸.
// - 장비 하나 = 칸 종류 + 스탯 목록 {스탯 코드, 값}(팩에는 {최소, 최대}, 값은 만들 때 정한다) + (무기면) 무기 사양 + 장비 스킬.
// - 무기·방어구(무기·보조·머리·몸·안장)는 2차 수치, 장신구·인공장기·부품은 1차 스탯을 올린다(D-423). 칸과 스탯 묶음이 맞지 않으면 거절한다.
// - 착용에 스탯 요구가 없다(D-424). 성능은 판정 때 무기 틀 min(2, 유닛 값 ÷ 적정치)으로 준다(formula.ts weaponScaled).
// 기획 48 §5와 맞췄다(안장 = 1차, 2차 공격력은 장비가 올리지 않음). [임시] 칸 이름(코드)·장비 스킬(소켓 인챈트 전 단계).
import { type Primaries, type StatRow, computeSecondary } from "./stats.ts";
import type { WeaponSpec } from "./unitSpec.ts";

export const PRIMARY_CODES = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export type PrimaryCode = (typeof PRIMARY_CODES)[number];

export const SLOT_KINDS = [
  "weapon",
  "offhand",
  "head",
  "body",
  "accessory",
  "organ",
  "part",
  "saddle",
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

/** 1차 스탯을 올리는 칸(D-423, 48 §5.2: 장신구·인공장기·부품·크리쳐 안장). 나머지 칸은 2차 수치 */
export const PRIMARY_SLOTS: ReadonlySet<SlotKind> = new Set(["accessory", "organ", "part", "saddle"]);

/** 장비가 올리지 않는 2차 행: 2차 공격력은 1차·장신구·버프만으로 계산한다(D-438 1, 무기 공격력은 무기 사양) */
export const GEAR_FORBIDDEN_ROWS: ReadonlySet<string> = new Set(["physical_attack", "elemental_attack"]);

export interface StatRange {
  readonly stat: string;
  readonly min: number;
  readonly max: number;
}

/** 장비 정의(팩 `items`의 equip 칸) */
export interface EquipDef {
  readonly id: string;
  readonly slot: SlotKind;
  readonly stats: readonly StatRange[];
  readonly weapon?: WeaponSpec | undefined;
  /** 장비 스킬(D-426. 지금은 아이템이 스킬을 바로 가진다. 스킬석 소켓은 뒤 단계) */
  readonly skills: readonly string[];
}

/** 만들어진 장비 하나(스탯 값이 정해짐) */
export interface EquippedItem {
  readonly item: string;
  readonly slot: SlotKind;
  readonly values: readonly { readonly stat: string; readonly value: number }[];
  readonly weapon?: WeaponSpec | undefined;
  readonly skills: readonly string[];
}

const isPrimary = (stat: string): stat is PrimaryCode => (PRIMARY_CODES as readonly string[]).includes(stat);

/** 칸과 스탯 묶음이 맞는지(D-423). 틀리면 그 스탯 코드 */
export function wrongStatGroup(
  slot: SlotKind,
  stats: readonly { readonly stat: string }[],
): string | undefined {
  const wantPrimary = PRIMARY_SLOTS.has(slot);
  return stats.find((entry) => isPrimary(entry.stat) !== wantPrimary || GEAR_FORBIDDEN_ROWS.has(entry.stat))
    ?.stat;
}

/** 장비를 만든다: 스탯마다 [최소, 최대]에서 하나(roll(n) = 0..n−1, 서버 시드 난수) */
export function rollItem(def: EquipDef, roll: (n: number) => number): EquippedItem {
  return {
    item: def.id,
    slot: def.slot,
    values: def.stats.map((range) => ({
      stat: range.stat,
      value: range.min + roll(range.max - range.min + 1),
    })),
    weapon: def.weapon,
    skills: def.skills,
  };
}

/** 장비를 만든다: 스탯마다 범위의 ‰ 자리(시험·시뮬레이터의 정해진 값) */
export function itemAt(def: EquipDef, pm: number): EquippedItem {
  return {
    item: def.id,
    slot: def.slot,
    values: def.stats.map((range) => ({
      stat: range.stat,
      value: range.min + Math.floor(((range.max - range.min) * pm) / 1000),
    })),
    weapon: def.weapon,
    skills: def.skills,
  };
}

/** 스킬 칸 수(D-427) = 종 기본 + 환생 횟수, 상한(구조 값 10) */
export function skillSlotCount(base: number, rebirths: number, max: number): number {
  return Math.max(0, Math.min(max, base + Math.max(0, rebirths)));
}

export interface Loadout {
  /** 1차 스탯(기본 + 장신구·인공장기·부품) */
  readonly primaries: Primaries;
  /** 2차 스탯(가중치 표 + 무기·방어구 수치 + 버프) */
  readonly stats: Record<string, number>;
  readonly weapon: WeaponSpec;
  /** 쓸 스킬 ID: 고유 스킬 먼저, 그다음 장비 스킬, 스킬 칸 수까지(D-426·D-427) */
  readonly skills: readonly string[];
}

/**
 * 칸 배치에 장비를 끼우고 스탯을 계산한다. equipped[i]는 slots[i] 칸의 장비(없으면 null).
 * 칸 종류가 다르거나 스탯 묶음이 틀리면 RangeError(팩 검사·서버가 먼저 막는 값). 스탯 요구 검사는 없다(D-424).
 */
export function loadoutOf(options: {
  readonly base: Primaries;
  readonly slots: readonly SlotKind[];
  readonly equipped: readonly (EquippedItem | null)[];
  readonly table: readonly StatRow[];
  readonly unarmed: WeaponSpec;
  readonly innateSkills?: readonly string[];
  readonly skillSlots?: number;
  readonly buffs?: Readonly<Record<string, number>>;
}): Loadout {
  const { slots, equipped } = options;
  if (equipped.length > slots.length) throw new RangeError("more items than slots");
  const primary: Record<PrimaryCode, number> = { ...options.base };
  const gear: Record<string, number> = {};
  let weapon = options.unarmed;
  const equipSkills: string[] = [];
  for (let i = 0; i < equipped.length; i++) {
    const item = equipped[i];
    if (!item) continue;
    if (item.slot !== slots[i]) throw new RangeError(`item ${item.item} does not fit slot ${slots[i]}`);
    const wrong = wrongStatGroup(item.slot, item.values);
    if (wrong !== undefined)
      throw new RangeError(`item ${item.item}: stat ${wrong} not allowed in ${item.slot}`);
    for (const { stat, value } of item.values) {
      if (isPrimary(stat)) primary[stat] += value;
      else gear[stat] = (gear[stat] ?? 0) + value;
    }
    if (item.slot === "weapon" && item.weapon) weapon = item.weapon;
    equipSkills.push(...item.skills);
  }
  const skills = [...new Set([...(options.innateSkills ?? []), ...equipSkills])];
  return {
    primaries: primary,
    stats: computeSecondary(primary, options.table, gear, options.buffs ?? {}),
    weapon,
    skills: skills.slice(0, options.skillSlots ?? skills.length),
  };
}
