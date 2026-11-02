// 아이템 편집기 화면 모델 — 찾기·거르기·정렬, 대분류마다의 새 항목 틀, 대분류·칸을 바꿀 때 맞춰 주는 칸, 보낼 항목 다듬기, 담은 변경,
// 칸 문제(서버 검사 코드) 모으기. 계산이 없는 순수 함수만 둔다(시험: itemModel.test.ts). 칸마다의 규칙은 서버가 팩 스키마로 다시 본다
// (docs/adr/2026-11-01-item-editor.md 3절).
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  EFFECT_KIND_IDS,
  ITEM_CATEGORY_IDS,
  ITEM_EDIT_CATEGORIES,
  ITEM_FORBIDDEN_ROWS,
  ITEM_PERISH_CATEGORIES,
  ITEM_PRIMARY_CODES,
  ITEM_PRIMARY_SLOTS,
  type EffectJson,
  type ItemCategoryId,
  type ItemEditCategory,
  type ItemEditorChange,
  type ItemEquipJson,
  type ItemJson,
  type ItemRow,
  type ItemTagJson,
  type ItemWeaponJson,
  type SubcategoryJson,
  type WeaponTypeJson,
} from "@terra/shared/itemEditor";
import type { EquipSlot } from "@terra/shared/roster";

export const ITEM_ORIGIN_FILTERS = ["all", "pack", "edited", "created"] as const;
export type ItemOriginFilter = (typeof ITEM_ORIGIN_FILTERS)[number];
export const ITEM_SORTS = ["name", "id", "tier", "baseValue", "weight"] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

/** 목록 찾기·거르기(설계안 3.3). 등급으로는 거르지 않는다(등급은 만든 물건마다, D-5003) */
export interface ItemQuery {
  readonly text: string;
  readonly category: ItemCategoryId | "all";
  /** 중분류 ID, "all" = 거르지 않음 */
  readonly subcategory: string;
  readonly slot: EquipSlot | "all";
  /** 유닛 종류 ID, "all" = 거르지 않음 */
  readonly kind: string;
  readonly origin: ItemOriginFilter;
  readonly enabled: "all" | "on" | "off";
  readonly tierMin: number;
  readonly tierMax: number;
  /** 권고가 있는 것만 */
  readonly advice: boolean;
  /** 담은 변경이 있는 것만 */
  readonly staged: boolean;
}

export const EMPTY_QUERY: ItemQuery = {
  text: "",
  category: "all",
  subcategory: "all",
  slot: "all",
  kind: "all",
  origin: "all",
  enabled: "all",
  tierMin: 0,
  tierMax: 9,
  advice: false,
  staged: false,
};

const lower = (text: string): string => text.toLocaleLowerCase();

/** 찾기(ID·이름 ko/en·태그)와 거르기. staged = 담은 변경이 있는 아이템 ID */
export function filterItems(
  rows: readonly ItemRow[],
  query: ItemQuery,
  staged: ReadonlySet<string>,
): ItemRow[] {
  const text = lower(query.text.trim());
  return rows.filter((row) => {
    if (query.category !== "all" && row.category !== query.category) return false;
    if (query.subcategory !== "all" && row.subcategory !== query.subcategory) return false;
    if (query.slot !== "all" && row.slot !== query.slot) return false;
    if (query.kind !== "all" && row.kinds.length > 0 && !row.kinds.includes(query.kind)) return false;
    if (query.origin !== "all" && row.origin !== query.origin) return false;
    if (query.enabled === "on" && !row.enabled) return false;
    if (query.enabled === "off" && row.enabled) return false;
    if (row.tier < query.tierMin || row.tier > query.tierMax) return false;
    if (query.advice && row.advice === 0) return false;
    if (query.staged && !staged.has(row.id)) return false;
    if (text === "") return true;
    return (
      lower(row.id).includes(text) ||
      lower(row.name.ko).includes(text) ||
      lower(row.name.en).includes(text) ||
      row.tags.some((tag) => lower(tag).includes(text))
    );
  });
}

const byId = (a: ItemRow, b: ItemRow): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 정렬(같으면 ID 차례). 무게가 없는 항목은 뒤로 */
export function sortItems(rows: readonly ItemRow[], sort: ItemSort, locale: "ko" | "en"): ItemRow[] {
  const compare: Record<ItemSort, (a: ItemRow, b: ItemRow) => number> = {
    name: (a, b) => a.name[locale].localeCompare(b.name[locale], locale) || byId(a, b),
    id: byId,
    tier: (a, b) => a.tier - b.tier || byId(a, b),
    baseValue: (a, b) => a.baseValue - b.baseValue || byId(a, b),
    weight: (a, b) =>
      (a.weight ?? Number.MAX_SAFE_INTEGER) - (b.weight ?? Number.MAX_SAFE_INTEGER) || byId(a, b),
  };
  return rows.toSorted(compare[sort]);
}

/** 대분류마다 개수(타일) */
export function categoryCounts(rows: readonly ItemRow[]): Record<ItemCategoryId, number> {
  const out: Record<ItemCategoryId, number> = {
    raw: 0,
    processed: 0,
    part: 0,
    equipment: 0,
    consumable: 0,
    gem: 0,
    construction: 0,
    document: 0,
    precious: 0,
  };
  for (const row of rows) out[row.category] += 1;
  return out;
}

/** 무기 사양 출발값(팩 검사를 통과하는 가장 작은 모양, 시험용 검과 같은 틀. 1차 적정 스탯은 비움 = 모든 몫 100%, D-502) */
export function newWeapon(): ItemWeaponJson {
  return {
    physical: { attack: 10 },
    hitPm: 900,
    critPm: 50,
    intervalMs: 1000,
    range: 1,
    arc: false,
    staminaCost: 10,
    mpCost: 0,
  };
}

/** 새 항목 틀(대분류마다 팩 검사를 통과하는 모양). 새 항목은 꺼진 채로 만든다(덜 만든 항목이 세계에 나오지 않게, 설계안 3.4) */
export function newItemTemplate(
  id: string,
  category: ItemCategoryId,
  name: { ko: string; en: string },
): ItemJson {
  const base: ItemJson = { id, name, category, tier: 0, baseValue: 1, enabled: false };
  if (category === "equipment") return { ...base, stackMax: 1, equip: { slot: "head", stats: [] } };
  return base;
}

const isPrimarySlot = (slot: EquipSlot): boolean => ITEM_PRIMARY_SLOTS.includes(slot);
const isPrimaryStat = (stat: string): boolean => (ITEM_PRIMARY_CODES as readonly string[]).includes(stat);

/** 칸을 바꾸면 그 칸에 맞춘다: 무기 사양(무기 칸만), 스탯 묶음(1차 칸·2차 칸), 무기 종류(무기·보조 칸만), 양손·탄약은 무기 사양 안 */
export function withSlot(equip: ItemEquipJson, slot: EquipSlot): ItemEquipJson {
  const { weapon: _weapon, weaponType, ...rest } = equip;
  const stats = equip.stats.filter(
    (range) => isPrimaryStat(range.stat) === isPrimarySlot(slot) && !ITEM_FORBIDDEN_ROWS.includes(range.stat),
  );
  const keepType = slot === "weapon" || slot === "offhand";
  return {
    ...rest,
    slot,
    stats,
    ...(slot === "weapon" ? { weapon: equip.weapon ?? newWeapon() } : {}),
    ...(keepType && weaponType !== undefined ? { weaponType } : {}),
  };
}

/** 대분류를 바꾸면 맞지 않는 묶음을 뺀다(장비 칸·신선도·사용 효과·중분류), 장비면 스택 1과 장비 칸 */
export function withCategory(item: ItemJson, category: ItemCategoryId): ItemJson {
  const { equip, perish, use, subcategory: _subcategory, stackMax, ...rest } = item;
  const next: ItemJson = { ...rest, category };
  return {
    ...next,
    ...(category === "equipment"
      ? { stackMax: 1, equip: equip ?? { slot: "head", stats: [] } }
      : stackMax === undefined
        ? {}
        : { stackMax }),
    ...(perish && ITEM_PERISH_CATEGORIES.includes(category) ? { perish } : {}),
    ...(use && category === "consumable" ? { use } : {}),
  };
}

/** 대분류를 바꾸면 빠지는 묶음(먼저 묻는다) */
export function droppedBundles(
  item: ItemJson,
  category: ItemCategoryId,
): ("equip" | "perish" | "use" | "subcategory")[] {
  const out: ("equip" | "perish" | "use" | "subcategory")[] = [];
  if (item.equip && category !== "equipment") out.push("equip");
  if (item.perish && !ITEM_PERISH_CATEGORIES.includes(category)) out.push("perish");
  if (item.use && category !== "consumable") out.push("use");
  if (item.subcategory !== undefined) out.push("subcategory");
  return out;
}

/** 보낼 항목: 빈 설명·빈 목록·계정 귀속이면 거래 가능을 뺀다(팩 항목과 같은 내용이면 서버가 덮어쓰기를 두지 않게) */
export function cleanItem(item: ItemJson): ItemJson {
  const { description, tags, tradable, ...rest } = item;
  const hasDescription = description && (description.ko.trim() !== "" || description.en.trim() !== "");
  return {
    ...rest,
    ...(hasDescription ? { description } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(tradable === undefined || item.bound === true ? {} : { tradable }),
  };
}

/** 담은 변경 하나(기기 안에서만, 적용하면 서버 묶음 하나) */
export interface Staged<T> {
  readonly op: "put" | "revert" | "discard_sleeping";
  /** put이면 보낼 항목 */
  readonly entry: T | null;
  /** 고치기 시작할 때의 실효 항목(3방향 합치기의 바탕, 새 항목 null) */
  readonly base: T | null;
  /** 고치기 시작할 때의 실효 항목 해시(새 항목 null) */
  readonly baseHash: string | null;
}

/** 분류 자료(중분류·태그·무기 종류) */
export type TaxonomyCategory = "item_subcategories" | "item_tags" | "weapon_types";
export type TaxonomyJson = SubcategoryJson | ItemTagJson | WeaponTypeJson;

/** 담은 변경 전부(분류마다). 효과 사전(effects)은 [효과 사전] 탭이 고친다(WP-6) */
export interface Stage {
  readonly items: ReadonlyMap<string, Staged<ItemJson>>;
  readonly item_subcategories: ReadonlyMap<string, Staged<TaxonomyJson>>;
  readonly item_tags: ReadonlyMap<string, Staged<TaxonomyJson>>;
  readonly weapon_types: ReadonlyMap<string, Staged<TaxonomyJson>>;
  readonly effects: ReadonlyMap<string, Staged<EffectJson>>;
}

export const EMPTY_STAGE: Stage = {
  items: new Map(),
  item_subcategories: new Map(),
  item_tags: new Map(),
  weapon_types: new Map(),
  effects: new Map(),
};

export const stageKey = (category: string, id: string): string => `${category}/${id}`;

export function stageSize(stage: Stage): number {
  return ITEM_EDIT_CATEGORIES.reduce((sum, category: ItemEditCategory) => sum + stage[category].size, 0);
}

/** 담은 변경 키 목록(분류/ID) */
export function stageKeys(stage: Stage): string[] {
  return ITEM_EDIT_CATEGORIES.flatMap((category) =>
    [...stage[category].keys()].map((id) => stageKey(category, id)),
  );
}

function setIn<T>(
  map: ReadonlyMap<string, Staged<T>>,
  id: string,
  staged: Staged<T> | null,
): Map<string, Staged<T>> {
  const next = new Map(map);
  if (staged === null) next.delete(id);
  else next.set(id, staged);
  return next;
}

/** 아이템 변경 하나를 바꾼 새 담은 변경(null = 뺀다) */
export const stageItem = (stage: Stage, id: string, staged: Staged<ItemJson> | null): Stage => ({
  ...stage,
  items: setIn(stage.items, id, staged),
});

/** 분류 자료 변경 하나를 바꾼 새 담은 변경(null = 뺀다) */
export function stageTaxonomy(
  stage: Stage,
  category: TaxonomyCategory,
  id: string,
  staged: Staged<TaxonomyJson> | null,
): Stage {
  if (category === "item_subcategories")
    return { ...stage, item_subcategories: setIn(stage.item_subcategories, id, staged) };
  if (category === "item_tags") return { ...stage, item_tags: setIn(stage.item_tags, id, staged) };
  return { ...stage, weapon_types: setIn(stage.weapon_types, id, staged) };
}

/** 효과 사전 변경 하나를 바꾼 새 담은 변경(null = 뺀다, WP-6) */
export const stageEffect = (stage: Stage, id: string, staged: Staged<EffectJson> | null): Stage => ({
  ...stage,
  effects: setIn(stage.effects, id, staged),
});

/** 항목 JSON → 보낼 객체(팩 파일 한 줄) */
const toRecord = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value));

function changeOf(category: ItemEditCategory, id: string, staged: Staged<object>): ItemEditorChange {
  if (staged.op === "discard_sleeping") return { op: "discard_sleeping", category, id };
  if (staged.op === "revert" || staged.entry === null)
    return { op: "revert", category, id, baseHash: staged.baseHash };
  return { op: "put", category, entry: toRecord(staged.entry), baseHash: staged.baseHash };
}

/**
 * 담은 변경 → 서버 묶음: 분류 자료·효과 사전 먼저, 아이템은 다듬어서(cleanItem). 서버는 묶음 전체를 얹은 실효 팩으로 보니 차례는
 * 읽기 편의다
 */
export function changesOf(stage: Stage): ItemEditorChange[] {
  const taxonomy = (["item_subcategories", "item_tags", "weapon_types", "effects"] as const).flatMap(
    (category) => [...stage[category]].map(([id, staged]) => changeOf(category, id, staged)),
  );
  const items = [...stage.items].map(([id, staged]) =>
    changeOf("items", id, staged.entry ? { ...staged, entry: cleanItem(staged.entry) } : staged),
  );
  return [...taxonomy, ...items];
}

/** 무기 공격 칸 모양(물리·속성 켬) */
const weaponFieldsOf = (item: ItemJson): string =>
  `${item.equip?.weapon?.physical ? "p" : ""}${item.equip?.weapon?.elemental ? "e" : ""}`;

/**
 * 코드·시나리오가 ID로 쓰는 아이템(isCodeRef)을 끄거나 칸·무기 공격 칸을 바꾸는 담은 변경의 ID(설계안 3.6: 적용 전에 묻는다).
 * 시뮬 장비·정원사 마법형 무기·시안 몸이 그 칸을 전제한다
 */
export function codeRefRisks(stage: Stage, isCodeRef: (id: string) => boolean): string[] {
  return [...stage.items].flatMap(([id, staged]) => {
    const { base, entry } = staged;
    if (!isCodeRef(id) || staged.op !== "put" || !entry || !base) return [];
    const changed =
      (base.enabled && !entry.enabled) ||
      base.equip?.slot !== entry.equip?.slot ||
      weaponFieldsOf(base) !== weaponFieldsOf(entry);
    return changed ? [id] : [];
  });
}

/** 한 아이템의 칸 문제(서버 검사·권고): 경로 → 문제들. 경로는 팩 검사 위치(예: equip.stats[0].min) */
export function issuesByPath(
  issues: readonly ContentIssueView[],
  id: string,
): Map<string, ContentIssueView[]> {
  const out = new Map<string, ContentIssueView[]>();
  for (const issue of issues) {
    if (issue.id !== null && issue.id !== id) continue;
    const path = issue.path ?? "";
    out.set(path, [...(out.get(path) ?? []), issue]);
  }
  return out;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 두 항목에서 다른 칸 경로(점으로 잇고, 배열·값은 통째로 본다). 팩 값과 실효 값 비교(설계안 3.10) */
export function changedPaths(a: unknown, b: unknown, path = ""): string[] {
  if (isRecord(a) && isRecord(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].toSorted();
    return keys.flatMap((key) => changedPaths(a[key], b[key], path === "" ? key : `${path}.${key}`));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [path === "" ? "." : path];
}

const isName = (value: unknown): value is { ko: string; en: string } =>
  isRecord(value) && typeof value.ko === "string" && typeof value.en === "string";

/** 서버가 준 항목(감사 기록 등)이 아이템 모양인가(칸마다의 규칙은 서버가 본다) */
export function isItemJson(value: unknown): value is ItemJson {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isName(value.name) &&
    ITEM_CATEGORY_IDS.some((category) => category === value.category) &&
    typeof value.tier === "number" &&
    typeof value.baseValue === "number" &&
    typeof value.enabled === "boolean"
  );
}

/** 서버가 준 항목이 분류 자료 모양인가 */
export function isTaxonomyJson(category: TaxonomyCategory, value: unknown): value is TaxonomyJson {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isName(value.name) ||
    typeof value.enabled !== "boolean"
  )
    return false;
  if (category === "item_subcategories") return ITEM_CATEGORY_IDS.some((major) => major === value.major);
  if (category === "weapon_types") return value.slot === "weapon" || value.slot === "offhand";
  return true;
}

/** 서버가 준 항목이 효과 사전 모양인가(칸마다의 규칙은 서버가 본다) */
export function isEffectJson(value: unknown): value is EffectJson {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isName(value.name) &&
    EFFECT_KIND_IDS.some((kind) => kind === value.kind) &&
    (value.valueMode === "flat" || value.valueMode === "permille") &&
    typeof value.durationMs === "number" &&
    typeof value.tickMs === "number" &&
    (value.stacking === "refresh" || value.stacking === "stack" || value.stacking === "ignore") &&
    typeof value.maxStacks === "number" &&
    typeof value.enabled === "boolean"
  );
}

/** 복제(설계안 3.8): 새 ID, 이름에 (복사)·(Copy), 꺼진 채로 */
export function duplicateItem(item: ItemJson, id: string, suffix: { ko: string; en: string }): ItemJson {
  return {
    ...item,
    id,
    name: { ko: `${item.name.ko} ${suffix.ko}`, en: `${item.name.en} ${suffix.en}` },
    enabled: false,
  };
}

/** g → 사람이 읽는 무게(kg·t). 정수 셈만 */
export function weightText(grams: number): string {
  if (grams >= 1_000_000) return `${(grams / 1_000_000).toFixed(grams % 1_000_000 === 0 ? 0 : 2)} t`;
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 2)} kg`;
  return `${grams} g`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 유통기한 ms → 일·시간 */
export function shelfParts(ms: number): { days: number; hours: number } {
  return { days: Math.floor(ms / DAY), hours: Math.floor((ms % DAY) / HOUR) };
}

/** 일·시간 → ms */
export const shelfMs = (days: number, hours: number): number => days * DAY + hours * HOUR;
