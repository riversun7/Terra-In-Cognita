// 장비 → 스탯 — docs/adr/2026-10-31-combat-core.md 7절, 기획 D-422(장비 칸)·D-423(올리는 스탯)·D-424(적정치 미달)·D-426·D-427(스킬 칸)
// - 칸 배치는 유닛 종류마다 자료다(콘텐츠 팩 `unit_kinds`, 구조 값 D-5054): 사람형 공통 6칸 + 종류별 강화 칸, 크리쳐 3칸(D-494).
// - 장비 하나 = 칸 종류 + 스탯 목록 {스탯 코드, 값}(팩에는 {최소, 최대}, 값은 만들 때 정한다) + (무기면) 무기 사양 + 장비 스킬.
// - 무기·방어구(무기·보조·머리·몸·안장)는 2차 수치, 장신구·인공장기·부품은 1차 스탯을 올린다(D-423). 칸과 스탯 묶음이 맞지 않으면 거절한다.
// - 착용에 스탯 요구가 없다(D-424). 성능은 판정 때 무기의 1차 적정 스탯 대비 비율(상한 N10 1000‰, D-502)로 준다(formula.ts).
// 기획 48 §5와 맞췄다(안장 = 1차, 스탯 공격력은 장비가 올리지 않음 — 무기 몫은 무기 사양). [임시] 칸 이름(코드)·장비 스킬(소켓 인챈트 전 단계).
// 전투 연결(아이템 편집기 WP-5, docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-02)"): 장비의 속성값은 자기 값과 더해 칸마다 10에서
// 자르고(D-450, @terra/shared sumElementSources 하나), 저항‰·고정 방어·비율 관통‰은 더한다(D-178·D-421). 양손 무기를 든 동안 보조 칸
// 장비와 그 유닛 종류가 입을 수 없는 장비(kinds, D-494)는 던지지 않고 빼서 ignored로 알린다. 1차·장비 2차 합은 입력 범위에서 자른다
// (넘침에 던지지 않는다). 무기의 1차 적정 스탯(D-502)은 무기 사양 칸(WeaponSpec.appropriate)이다.
import {
  type ElementSource,
  elementsFromArray,
  elementsToArray,
  sumElementSources,
} from "@terra/shared/cyborg";
import { EQUIP_SLOTS, PRIMARY_EQUIP_SLOTS } from "@terra/shared/roster";
import type { GemRef } from "./gems.ts";
import { MAX_STAT_INPUT, type Primaries, type StatRow, computeSecondary } from "./stats.ts";
import type { WeaponSpec } from "./unitSpec.ts";

export const PRIMARY_CODES = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export type PrimaryCode = (typeof PRIMARY_CODES)[number];

/** 장비 칸 종류(D-422). 목록은 @terra/shared/roster EQUIP_SLOTS 하나다(팩 스키마·화면과 같은 목록) */
export const SLOT_KINDS = EQUIP_SLOTS;
export type SlotKind = (typeof SLOT_KINDS)[number];

/** 1차 스탯을 올리는 칸(D-423, 48 §5.2: 장신구·인공장기·부품·크리쳐 안장). 나머지 칸은 2차 수치 */
export const PRIMARY_SLOTS: ReadonlySet<SlotKind> = new Set(PRIMARY_EQUIP_SLOTS);

/** 장비가 올리지 않는 2차 행: 스탯 공격력은 1차·장신구·버프만으로 계산한다(D-438 1, 무기 몫은 무기 사양이 더한다 D-502) */
export const GEAR_FORBIDDEN_ROWS: ReadonlySet<string> = new Set(["physical_attack", "elemental_attack"]);

export interface StatRange {
  readonly stat: string;
  readonly min: number;
  readonly max: number;
}

/** 장비 하나가 전투에 더하는 칸(정의에서 만든 물건으로 그대로 옮긴다. 없으면 0·없음) */
export interface GearCombat {
  /** 속성값 출처(D-450: 칸 ID → 1~10). 유닛 속성값 = 자기 값 + 출처 합, 칸마다 10에서 자름 */
  readonly elements?: ElementSource | undefined;
  /** 속성별 저항‰ 12칸(ELEMENT_IDS 차례, D-421). 장비마다 더한다(D-178) */
  readonly resistPm?: readonly number[] | undefined;
  /** 고정 방어(D-421) */
  readonly defenseFlat?: number | undefined;
  /** 비율 관통‰(D-421) */
  readonly penetrationPm?: number | undefined;
  /** 이동 속도‰(D-558 1548 장비 옵션 — 걷기 빠르기에 곱한다, 걸린 효과 move_speed와 같은 합) */
  readonly moveSpeedPm?: number | undefined;
  /** 양손 무기(무기 칸, 48 §5.5): 든 동안 보조 칸 장비를 쓰지 않는다 */
  readonly twoHanded?: boolean | undefined;
  /** 입을 수 있는 유닛 종류(D-494 전용 장비 등). 없으면 그 칸을 가진 모든 종류 */
  readonly kinds?: readonly string[] | undefined;
}

/** 장비 정의(팩 `items`의 equip 칸) */
export interface EquipDef extends GearCombat {
  readonly id: string;
  readonly slot: SlotKind;
  readonly stats: readonly StatRange[];
  /** 무기 사양(1차 적정 스탯 D-502 포함) */
  readonly weapon?: WeaponSpec | undefined;
  /** 장비 스킬(D-426. 지금은 아이템이 스킬을 바로 가진다. 스킬석 소켓은 뒤 단계) */
  readonly skills: readonly string[];
}

/** 만들어진 장비 하나(스탯 값이 정해짐) */
export interface EquippedItem extends GearCombat {
  readonly item: string;
  readonly slot: SlotKind;
  readonly values: readonly { readonly stat: string; readonly value: number }[];
  readonly weapon?: WeaponSpec | undefined;
  readonly skills: readonly string[];
  /** 소켓에 끼운 보석(D-435): 스킬 보석 = 장비 스킬, 스탯 보석 = 1차 스탯(D-423) */
  readonly gems?: readonly GemRef[] | undefined;
}

const isPrimary = (stat: string): stat is PrimaryCode => (PRIMARY_CODES as readonly string[]).includes(stat);

/** 정의의 전투 칸 가운데 적은 것만(만든 물건이 정의와 같은 칸을 든다) */
function gearCombatOf(def: GearCombat): GearCombat {
  return {
    ...(def.elements === undefined ? {} : { elements: def.elements }),
    ...(def.resistPm === undefined ? {} : { resistPm: def.resistPm }),
    ...(def.defenseFlat === undefined ? {} : { defenseFlat: def.defenseFlat }),
    ...(def.penetrationPm === undefined ? {} : { penetrationPm: def.penetrationPm }),
    ...(def.moveSpeedPm === undefined ? {} : { moveSpeedPm: def.moveSpeedPm }),
    ...(def.twoHanded === undefined ? {} : { twoHanded: def.twoHanded }),
    ...(def.kinds === undefined ? {} : { kinds: def.kinds }),
  };
}

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
    ...gearCombatOf(def),
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
    ...gearCombatOf(def),
  };
}

/** 스킬 칸 수(D-427) = 종 기본 + 환생 횟수, 상한(구조 값 10) */
export function skillSlotCount(base: number, rebirths: number, max: number): number {
  return Math.max(0, Math.min(max, base + Math.max(0, rebirths)));
}

/** 끼웠지만 쓰지 않은 장비의 까닭: 양손 무기를 든 동안의 보조 칸, 그 유닛 종류가 입을 수 없음(kinds) */
export type IgnoredReason = "two_handed" | "kind";

export interface IgnoredItem {
  /** 칸 번호(slots 차례) */
  readonly index: number;
  readonly item: string;
  readonly reason: IgnoredReason;
}

export interface Loadout {
  /** 1차 스탯(기본 + 장신구·인공장기·부품). 입력 범위(±MAX_STAT_INPUT)에서 자른다 */
  readonly primaries: Primaries;
  /** 2차 스탯(가중치 표 + 무기·방어구 수치 + 버프) */
  readonly stats: Record<string, number>;
  /** 무기·방어구가 2차 스탯 행에 더한 수치(행 ID → 합). 화면의 스탯 풀이(explainSecondary)가 쓴다 */
  readonly gear: Readonly<Record<string, number>>;
  readonly weapon: WeaponSpec;
  /**
   * 맨손인가(D-490): 무기 칸에 무기가 없고 타고난 무기를 무기로 치지 않는 종류(naturalIsWeapon 거짓). 참이면 맨손 스킬만 쓴다.
   * 전투 사양(specFromStats UnitBody.bareHanded)에 그대로 넘긴다
   */
  readonly bareHanded: boolean;
  /** 쓸 스킬 ID: 고유 스킬 먼저, 그다음 장비 스킬, 스킬 칸 수까지(D-426·D-427) */
  readonly skills: readonly string[];
  /** 속성값 12칸(ELEMENT_IDS 차례): 자기 값 + 장비 출처, 칸마다 10에서 자름(D-450, sumElementSources) */
  readonly elements: readonly number[];
  /** 속성별 저항‰ 12칸: 자기 값 + 장비 합(D-178·D-421) */
  readonly resistPm: readonly number[];
  /** 고정 방어: 자기 값 + 장비 합 */
  readonly defenseFlat: number;
  /** 비율 관통‰: 자기 값 + 장비 합 */
  readonly penetrationPm: number;
  /** 이동 속도‰: 장비 합(D-558 1548). 없으면 0 */
  readonly moveSpeedPm: number;
  /** 끼웠지만 쓰지 않은 장비(화면이 "양손 무기라 보조 칸 꺼짐"·"이 종류는 못 입음"을 보인다) */
  readonly ignored: readonly IgnoredItem[];
}

const ELEMENT_COUNT = 12;
/** 입력 범위 안으로(1차·장비 2차 합의 넘침에 던지지 않는다) */
const clampStat = (value: number): number => Math.max(-MAX_STAT_INPUT, Math.min(MAX_STAT_INPUT, value));
/** 12칸 배열(모자란 칸 0) */
const twelve = (values: readonly number[] | undefined): number[] =>
  Array.from({ length: ELEMENT_COUNT }, (_, index) => values?.[index] ?? 0);

/**
 * 칸 배치에 장비를 끼우고 스탯을 계산한다. equipped[i]는 slots[i] 칸의 장비(없으면 null).
 * 칸 종류가 다르거나 스탯 묶음이 틀리면 RangeError(팩 검사·서버가 먼저 막는 값, 부르는 쪽이 칸이 맞는 장비만 넣는다).
 * 양손 무기를 든 동안의 보조 칸 장비와 그 종류(kind)가 입을 수 없는 장비는 던지지 않고 빼서 ignored에 적는다. 스탯 요구 검사는 없다(D-424).
 */
export function loadoutOf(options: {
  readonly base: Primaries;
  readonly slots: readonly SlotKind[];
  readonly equipped: readonly (EquippedItem | null)[];
  readonly table: readonly StatRow[];
  readonly unarmed: WeaponSpec;
  /** 타고난 무기(unarmed)를 스킬용 무기로 치나(유닛 종류 naturalWeaponIsWeapon, 크리쳐 발톱). 없으면 거짓 */
  readonly naturalIsWeapon?: boolean;
  readonly innateSkills?: readonly string[];
  readonly skillSlots?: number;
  readonly buffs?: Readonly<Record<string, number>>;
  /** 레벨(행 식의 LV, 없으면 1) */
  readonly level?: number;
  /** 유닛 종류 ID(장비 kinds 거르기, D-494). 없으면 거르지 않는다 */
  readonly kind?: string;
  /** 자기 속성값 12칸(생성·환생·신앙 등 장비 밖 출처의 합). 없으면 0 */
  readonly elements?: readonly number[];
  /** 자기 전투 직접 값(전투 실험실 직접 값 등). 없으면 0 */
  readonly resistPm?: readonly number[];
  readonly defenseFlat?: number;
  readonly penetrationPm?: number;
}): Loadout {
  const { slots, equipped } = options;
  if (equipped.length > slots.length) throw new RangeError("more items than slots");
  const wearable = (item: EquippedItem): boolean =>
    options.kind === undefined || item.kinds === undefined || item.kinds.includes(options.kind);
  // 양손 무기(입을 수 있는 것만): 든 동안 보조 칸 장비를 쓰지 않는다
  const twoHanded = equipped.some(
    (item, index) => item?.twoHanded === true && slots[index] === "weapon" && wearable(item),
  );
  const primary: Record<PrimaryCode, number> = { ...options.base };
  const gear: Record<string, number> = {};
  let weapon = options.unarmed;
  let armed = false;
  const equipSkills: string[] = [];
  const ignored: IgnoredItem[] = [];
  const sources: ElementSource[] = [];
  const resist = twelve(options.resistPm);
  let defenseFlat = options.defenseFlat ?? 0;
  let penetrationPm = options.penetrationPm ?? 0;
  let moveSpeedPm = 0;
  for (let i = 0; i < equipped.length; i++) {
    const item = equipped[i];
    if (!item) continue;
    if (item.slot !== slots[i]) throw new RangeError(`item ${item.item} does not fit slot ${slots[i]}`);
    if (!wearable(item)) {
      ignored.push({ index: i, item: item.item, reason: "kind" });
      continue;
    }
    if (twoHanded && item.slot === "offhand") {
      ignored.push({ index: i, item: item.item, reason: "two_handed" });
      continue;
    }
    const wrong = wrongStatGroup(item.slot, item.values);
    if (wrong !== undefined)
      throw new RangeError(`item ${item.item}: stat ${wrong} not allowed in ${item.slot}`);
    for (const { stat, value } of item.values) {
      if (isPrimary(stat)) primary[stat] += value;
      else gear[stat] = (gear[stat] ?? 0) + value;
    }
    if (item.slot === "weapon" && item.weapon) {
      weapon = item.weapon;
      armed = true;
    }
    equipSkills.push(...item.skills);
    for (const gem of item.gems ?? []) {
      if (gem.kind === "skill") equipSkills.push(gem.skill);
      else if (isPrimary(gem.stat)) primary[gem.stat] += gem.value;
    }
    if (item.elements) sources.push(item.elements);
    const itemResist = item.resistPm;
    if (itemResist)
      for (let e = 0; e < ELEMENT_COUNT; e++) resist[e] = (resist[e] ?? 0) + (itemResist[e] ?? 0);
    defenseFlat += item.defenseFlat ?? 0;
    penetrationPm += item.penetrationPm ?? 0;
    moveSpeedPm += item.moveSpeedPm ?? 0;
  }
  // 넘침에 던지지 않는다: 입력 범위(MAX_STAT_INPUT)에서 자른다(실제 값은 이보다 훨씬 작다, 기술 보호)
  for (const code of PRIMARY_CODES) primary[code] = clampStat(primary[code]);
  for (const row of Object.keys(gear)) gear[row] = clampStat(gear[row] ?? 0);
  const skills = [...new Set([...(options.innateSkills ?? []), ...equipSkills])];
  return {
    primaries: primary,
    stats: computeSecondary(primary, options.table, gear, options.buffs ?? {}, options.level ?? 1),
    gear,
    weapon,
    bareHanded: !armed && options.naturalIsWeapon !== true,
    skills: skills.slice(0, options.skillSlots ?? skills.length),
    elements: elementsToArray(sumElementSources(elementsFromArray(twelve(options.elements)), sources)),
    resistPm: resist,
    defenseFlat,
    penetrationPm,
    moveSpeedPm,
    ignored,
  };
}
