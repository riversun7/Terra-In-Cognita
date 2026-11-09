// 아이템 분류 나무 — 대분류(고정 9, D-497) → 중분류(major로 대분류에 붙음) → 무기 종류(장비 대분류의 무기·보조 무기 중분류 아래).
// [아이템] 탭(타일·잇따른 거르기)과 [아이템 분류] 탭(타일 → 나무 → 고른 마디)이 같은 나무를 쓴다. 계산이 없는 순수 함수만 둔다
// (시험: itemTree.test.ts). docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09 분류 나무)".
// 자료 모양 그대로 보인다:
// - 무기 종류는 스키마에서 중분류가 아니라 장착 칸(slot: weapon·offhand)에 묶인다. 나무는 팩 관례(장비 중분류 무기·보조 무기)로 칸 →
//   중분류를 잇는다(WEAPON_SLOT_SUBCATEGORY). 그 중분류가 없으면 장비 대분류 바로 아래 "중분류 없이 붙은 무기 종류"로 둔다(질문 896).
// - 중분류가 없는(또는 지금 없는 중분류를 가리키는) 아이템은 그 대분류의 "중분류 없음"으로 센다(질문 897).
import {
  ITEM_CATEGORY_IDS,
  type ItemCategoryId,
  type ItemJson,
  type ItemRow,
  type SubcategoryJson,
  type TaxonomyRow,
  type WeaponTypeJson,
} from "@terra/shared/itemEditor";
import type { Staged, TaxonomyJson } from "./itemModel.ts";

/** 무기 종류의 칸 → 그 종류를 보일 중분류 ID(팩 관례. 스키마에는 이 연결이 없다, 질문 896) */
export const WEAPON_SLOT_SUBCATEGORY = { weapon: "weapon", offhand: "offhand_weapon" } as const;

/** 거르기·나무에서 "중분류 없음"을 뜻하는 값(콘텐츠 ID 꼴 ^[a-z]…이 아니라 겹치지 않는다) */
export const NO_SUBCATEGORY = "-";

/** 나무가 세는 아이템 한 줄(목록 줄이나 담은 초안에서) */
export interface TreeItem {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly category: ItemCategoryId;
  readonly subcategory: string | null;
  readonly weaponType: string | null;
  readonly tier: number;
}

/** 분류 자료 한 항목의 실효 보기(담은 초안이 있으면 그 값) */
export interface TaxEntry<T> {
  readonly id: string;
  /** 보이는 값(담은 초안 → 실효 항목) */
  readonly entry: T;
  /** 서버 목록 줄(새로 만들어 담은 항목은 null) */
  readonly row: TaxonomyRow<T> | null;
  readonly staged: Staged<TaxonomyJson> | undefined;
}

export interface KindNode {
  readonly id: string;
  readonly entry: WeaponTypeJson;
  /** 이 무기 종류를 단 아이템 수(equip.weaponType) */
  readonly count: number;
}

export interface SubNode {
  readonly id: string;
  readonly entry: SubcategoryJson;
  readonly count: number;
  /** 이 중분류 아래 보이는 무기 종류(장비 무기·보조 무기만) */
  readonly kinds: readonly KindNode[];
}

export interface MajorNode {
  readonly id: ItemCategoryId;
  readonly count: number;
  readonly subs: readonly SubNode[];
  /** 중분류가 없거나 지금 없는 중분류를 가리키는 아이템 수 */
  readonly unsorted: number;
  /** 이을 중분류가 없어 대분류 바로 아래 붙은 무기 종류(장비만) */
  readonly looseKinds: readonly KindNode[];
}

/** 고른 마디(대분류 · 그 대분류의 중분류 없음 · 중분류 · 무기 종류) */
export type TreeNodeRef =
  | { readonly kind: "major"; readonly id: ItemCategoryId }
  | { readonly kind: "unsorted"; readonly id: ItemCategoryId }
  | { readonly kind: "sub"; readonly id: string }
  | { readonly kind: "weapon"; readonly id: string };

/** 목록 줄 → 나무 줄 */
export const treeItemOfRow = (row: ItemRow): TreeItem => ({
  id: row.id,
  name: row.name,
  category: row.category,
  subcategory: row.subcategory,
  weaponType: row.weaponType,
  tier: row.tier,
});

/** 아이템 초안 → 나무 줄 */
export const treeItemOfJson = (item: ItemJson): TreeItem => ({
  id: item.id,
  name: item.name,
  category: item.category,
  subcategory: item.subcategory ?? null,
  weaponType: item.equip?.weaponType ?? null,
  tier: item.tier,
});

/** 목록 줄에 담은 아이템 초안을 얹는다(고친 칸·새로 만든 아이템이 바로 나무 수에 든다. 되돌리기·버림은 목록 값 그대로) */
export function treeItems(
  rows: readonly ItemRow[],
  staged: ReadonlyMap<string, Staged<ItemJson>>,
): TreeItem[] {
  const out = rows.map((row) => {
    const draft = staged.get(row.id);
    return draft?.op === "put" && draft.entry ? treeItemOfJson(draft.entry) : treeItemOfRow(row);
  });
  const known = new Set(rows.map((row) => row.id));
  for (const [id, draft] of staged)
    if (!known.has(id) && draft.op === "put" && draft.entry) out.push(treeItemOfJson(draft.entry));
  return out;
}

/** 분류 자료 목록 줄 + 담은 변경 → 실효 보기(목록 차례, 새로 만든 것은 뒤에) */
export function taxEntries<T extends TaxonomyJson>(
  rows: readonly TaxonomyRow<T>[],
  staged: ReadonlyMap<string, Staged<TaxonomyJson>>,
  isEntry: (value: TaxonomyJson) => value is T,
): TaxEntry<T>[] {
  const out: TaxEntry<T>[] = rows.map((row) => {
    const draft = staged.get(row.entry.id);
    const entry = draft?.op === "put" && draft.entry && isEntry(draft.entry) ? draft.entry : row.entry;
    return { id: row.entry.id, entry, row, staged: draft };
  });
  const known = new Set(rows.map((row) => row.entry.id));
  for (const [id, draft] of staged)
    if (!known.has(id) && draft.op === "put" && draft.entry && isEntry(draft.entry))
      out.push({ id, entry: draft.entry, row: null, staged: draft });
  return out;
}

export const isSubcategoryJson = (value: TaxonomyJson): value is SubcategoryJson => "major" in value;
export const isWeaponTypeJson = (value: TaxonomyJson): value is WeaponTypeJson => "slot" in value;

/** order가 있으면 작은 것부터, 없으면 팩 차례(안정 정렬). order 없는 것은 order 있는 것 뒤 */
function byOrder<T extends { readonly entry: { readonly order?: number | undefined } }>(
  rows: readonly T[],
): T[] {
  return rows.toSorted(
    (a, b) => (a.entry.order ?? Number.MAX_SAFE_INTEGER) - (b.entry.order ?? Number.MAX_SAFE_INTEGER),
  );
}

/** 무기 종류가 보일 중분류 ID(칸 관례) */
export const kindParentId = (kind: WeaponTypeJson): string => WEAPON_SLOT_SUBCATEGORY[kind.slot];

/**
 * 나무 만들기. subs·kinds는 실효 보기(taxEntries)의 항목, items는 실효 아이템(treeItems).
 * 대분류 9개는 늘 있다(아이템이 0이어도). 아이템 수는 겹쳐 세지 않는다: 대분류 수 = 중분류 수 합 + 중분류 없음
 */
export function buildItemTree(
  items: readonly TreeItem[],
  subs: readonly { readonly id: string; readonly entry: SubcategoryJson }[],
  kinds: readonly { readonly id: string; readonly entry: WeaponTypeJson }[],
): MajorNode[] {
  const subIds = new Set(subs.map((sub) => sub.id));
  const subMajor = new Map(subs.map((sub) => [sub.id, sub.entry.major]));
  const perSub = new Map<string, number>();
  const perKind = new Map<string, number>();
  const perMajor = new Map<ItemCategoryId, number>();
  const unsorted = new Map<ItemCategoryId, number>();
  for (const item of items) {
    perMajor.set(item.category, (perMajor.get(item.category) ?? 0) + 1);
    // 다른 대분류의 중분류를 가리키면(팩 검사가 막는 틀린 초안) 중분류 없음으로 센다: 대분류 수 = 아래 수의 합
    if (
      item.subcategory !== null &&
      subIds.has(item.subcategory) &&
      subMajor.get(item.subcategory) === item.category
    )
      perSub.set(item.subcategory, (perSub.get(item.subcategory) ?? 0) + 1);
    else unsorted.set(item.category, (unsorted.get(item.category) ?? 0) + 1);
    if (item.weaponType !== null) perKind.set(item.weaponType, (perKind.get(item.weaponType) ?? 0) + 1);
  }
  const kindNodes = byOrder(kinds).map(
    (kind): KindNode => ({ id: kind.id, entry: kind.entry, count: perKind.get(kind.id) ?? 0 }),
  );
  const equipmentSubs = new Set(subs.filter((sub) => sub.entry.major === "equipment").map((sub) => sub.id));
  const placed = (kind: KindNode): boolean => equipmentSubs.has(kindParentId(kind.entry));
  return ITEM_CATEGORY_IDS.map((major): MajorNode => {
    const mine = byOrder(subs.filter((sub) => sub.entry.major === major)).map(
      (sub): SubNode => ({
        id: sub.id,
        entry: sub.entry,
        count: perSub.get(sub.id) ?? 0,
        kinds: major === "equipment" ? kindNodes.filter((kind) => kindParentId(kind.entry) === sub.id) : [],
      }),
    );
    return {
      id: major,
      count: perMajor.get(major) ?? 0,
      subs: mine,
      unsorted: unsorted.get(major) ?? 0,
      looseKinds: major === "equipment" ? kindNodes.filter((kind) => !placed(kind)) : [],
    };
  });
}

/** 대분류마다 아이템 수(타일) */
export function treeCounts(tree: readonly MajorNode[]): Record<ItemCategoryId, number> {
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
  for (const major of tree) out[major.id] = major.count;
  return out;
}

/** 마디에 든 아이템(나무 수와 같은 규칙) */
export function itemsOfNode(
  node: TreeNodeRef,
  items: readonly TreeItem[],
  subs: readonly { readonly id: string; readonly entry: SubcategoryJson }[],
): TreeItem[] {
  const subMajor = new Map(subs.map((sub) => [sub.id, sub.entry.major]));
  const sorted = (item: TreeItem): boolean =>
    item.subcategory !== null && subMajor.get(item.subcategory) === item.category;
  switch (node.kind) {
    case "major":
      return items.filter((item) => item.category === node.id);
    case "unsorted":
      return items.filter((item) => item.category === node.id && !sorted(item));
    case "sub":
      return items.filter((item) => item.subcategory === node.id && sorted(item));
    case "weapon":
      return items.filter((item) => item.weaponType === node.id);
    default:
      return [];
  }
}

/** 마디 하나 찾기(없으면 null: 지운 항목 등) */
export function findSub(tree: readonly MajorNode[], id: string): SubNode | null {
  for (const major of tree) for (const sub of major.subs) if (sub.id === id) return sub;
  return null;
}

export function findKind(
  tree: readonly MajorNode[],
  id: string,
): { kind: KindNode; parent: SubNode | null } | null {
  for (const major of tree) {
    for (const sub of major.subs) {
      const kind = sub.kinds.find((item) => item.id === id);
      if (kind) return { kind, parent: sub };
    }
    const loose = major.looseKinds.find((item) => item.id === id);
    if (loose) return { kind: loose, parent: null };
  }
  return null;
}

/** 무기 칸이 아닌 보조 칸 종류(방패·화살통·탄창): "무기 종류" 목록에 들어 있지만 무기가 아니다(질문 895) */
export const isOffhandKind = (kind: WeaponTypeJson): boolean => kind.slot === "offhand";
