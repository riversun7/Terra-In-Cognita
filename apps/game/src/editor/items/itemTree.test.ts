import type { ItemJson, SubcategoryJson, TaxonomyRow, WeaponTypeJson } from "@terra/shared/itemEditor";
import { describe, expect, it } from "vitest";
import type { Staged, TaxonomyJson } from "./itemModel.ts";
import {
  type TreeItem,
  buildItemTree,
  findKind,
  findSub,
  isOffhandKind,
  isSubcategoryJson,
  isWeaponTypeJson,
  itemsOfNode,
  taxEntries,
  treeItems,
} from "./itemTree.ts";

const name = (id: string) => ({ ko: `한 ${id}`, en: `En ${id}` });
const sub = (id: string, major: SubcategoryJson["major"], order?: number) => ({
  id,
  entry: { id, name: name(id), major, enabled: true, ...(order === undefined ? {} : { order }) },
});
const kind = (id: string, slot: WeaponTypeJson["slot"], order?: number) => ({
  id,
  entry: { id, name: name(id), slot, enabled: true, ...(order === undefined ? {} : { order }) },
});
const item = (id: string, extra: Partial<TreeItem> = {}): TreeItem => ({
  id,
  name: name(id),
  category: "raw",
  subcategory: null,
  weaponType: null,
  tier: 0,
  ...extra,
});

const SUBS = [
  sub("ore", "raw"),
  sub("wood", "raw"),
  sub("weapon", "equipment"),
  sub("offhand_weapon", "equipment"),
  sub("armor", "equipment"),
];
const KINDS = [kind("blade", "weapon"), kind("bow", "weapon"), kind("shield", "offhand")];

describe("buildItemTree", () => {
  it("대분류 9개가 늘 있고, 중분류는 major 대분류 아래, 무기 종류는 칸 관례로 무기·보조 무기 아래", () => {
    const tree = buildItemTree([], SUBS, KINDS);
    expect(tree.map((major) => major.id)).toEqual([
      "raw",
      "processed",
      "part",
      "equipment",
      "consumable",
      "gem",
      "construction",
      "document",
      "precious",
    ]);
    const raw = tree.find((major) => major.id === "raw");
    expect(raw?.subs.map((node) => node.id)).toEqual(["ore", "wood"]);
    expect(raw?.subs.every((node) => node.kinds.length === 0)).toBe(true);
    const equipment = tree.find((major) => major.id === "equipment");
    expect(equipment?.subs.map((node) => [node.id, node.kinds.map((k) => k.id)])).toEqual([
      ["weapon", ["blade", "bow"]],
      ["offhand_weapon", ["shield"]],
      ["armor", []],
    ]);
    expect(equipment?.looseKinds).toEqual([]);
  });

  it("아이템 수: 대분류 = 중분류 합 + 중분류 없음(없는 중분류·다른 대분류의 중분류도 없음), 무기 종류는 따로", () => {
    const items = [
      item("a", { subcategory: "ore" }),
      item("b", { subcategory: "ore" }),
      item("c"),
      item("d", { subcategory: "gone" }),
      item("e", { subcategory: "weapon" }),
      item("f", { category: "equipment", subcategory: "weapon", weaponType: "blade" }),
      item("g", { category: "equipment", weaponType: "blade" }),
      item("h", { category: "equipment", subcategory: "offhand_weapon", weaponType: "shield" }),
    ];
    const tree = buildItemTree(items, SUBS, KINDS);
    const raw = tree.find((major) => major.id === "raw");
    expect(raw?.count).toBe(5);
    expect(raw?.subs.find((node) => node.id === "ore")?.count).toBe(2);
    expect(raw?.unsorted).toBe(3);
    const equipment = tree.find((major) => major.id === "equipment");
    expect(equipment?.count).toBe(3);
    expect(equipment?.unsorted).toBe(1);
    const weapon = equipment?.subs.find((node) => node.id === "weapon");
    expect(weapon?.count).toBe(1);
    expect(weapon?.kinds.find((k) => k.id === "blade")?.count).toBe(2);
    expect(itemsOfNode({ kind: "unsorted", id: "raw" }, items, SUBS).map((i) => i.id)).toEqual([
      "c",
      "d",
      "e",
    ]);
    expect(itemsOfNode({ kind: "sub", id: "ore" }, items, SUBS).map((i) => i.id)).toEqual(["a", "b"]);
    expect(itemsOfNode({ kind: "weapon", id: "blade" }, items, SUBS).map((i) => i.id)).toEqual(["f", "g"]);
    expect(itemsOfNode({ kind: "major", id: "equipment" }, items, SUBS)).toHaveLength(3);
  });

  it("order가 있으면 작은 것부터, 없으면 팩 차례(order 있는 것 뒤)", () => {
    const tree = buildItemTree(
      [],
      [sub("x", "raw"), sub("y", "raw", 5), sub("z", "raw"), sub("w", "raw", 1)],
      [kind("k1", "weapon"), kind("k2", "weapon", 0)],
    );
    expect(tree[0]?.subs.map((node) => node.id)).toEqual(["w", "y", "x", "z"]);
    expect(findSub(tree, "weapon")).toBeNull();
    // 무기 칸 중분류가 없으면 무기 종류는 장비 대분류 바로 아래(이을 곳 없음)
    const equipment = tree.find((major) => major.id === "equipment");
    expect(equipment?.looseKinds.map((k) => k.id)).toEqual(["k2", "k1"]);
    expect(findKind(tree, "k1")?.parent).toBeNull();
  });

  it("보조 칸 종류(방패·화살통·탄창)는 표시가 붙는다", () => {
    const tree = buildItemTree([], SUBS, KINDS);
    const found = findKind(tree, "shield");
    expect(found?.parent?.id).toBe("offhand_weapon");
    expect(found && isOffhandKind(found.kind.entry)).toBe(true);
    expect(isOffhandKind(KINDS[0]?.entry ?? kind("q", "weapon").entry)).toBe(false);
  });
});

describe("treeItems·taxEntries", () => {
  it("담은 아이템 초안이 목록 값을 덮고, 새로 만든 아이템이 더해진다(되돌리기는 목록 값)", () => {
    const base: ItemJson = {
      id: "n",
      name: name("n"),
      category: "equipment",
      tier: 1,
      startPrice: 1,
      enabled: false,
      equip: { slot: "weapon", stats: [], weaponType: "bow" },
    };
    const rows = [
      {
        id: "a",
        name: name("a"),
        category: "raw" as const,
        subcategory: null,
        tags: [],
        tier: 0,
        startPrice: 1,
        weight: null,
        enabled: true,
        origin: "pack" as const,
        hash: "0",
        storage: "general" as const,
        market: "book" as const,
        slot: null,
        weaponType: null,
        kinds: [],
        attack: null,
        appropriate: null,
        stats: [],
        effects: [],
        shelfLifeMs: null,
        stackMax: null,
        advice: 0,
        codeRef: false,
      },
    ];
    const staged = new Map<string, Staged<ItemJson>>([
      [
        "a",
        {
          op: "put",
          entry: { ...base, id: "a", category: "raw", subcategory: "ore" },
          base: null,
          baseHash: "0",
        },
      ],
      ["n", { op: "put", entry: base, base: null, baseHash: null }],
    ]);
    const out = treeItems(rows, staged);
    expect(out.map((i) => [i.id, i.category, i.subcategory, i.weaponType])).toEqual([
      ["a", "raw", "ore", "bow"],
      ["n", "equipment", null, "bow"],
    ]);
    const reverted = treeItems(
      rows,
      new Map([["a", { op: "revert", entry: null, base: null, baseHash: "0" }]]),
    );
    expect(reverted[0]?.subcategory).toBeNull();
  });

  it("분류 자료: 담은 초안 값, 새로 만든 항목은 뒤에(목록 줄 없음)", () => {
    const rows: TaxonomyRow<SubcategoryJson>[] = [
      { entry: sub("ore", "raw").entry, origin: "pack", hash: "h" },
    ];
    const staged = new Map<string, Staged<TaxonomyJson>>([
      [
        "ore",
        {
          op: "put",
          entry: { ...sub("ore", "raw").entry, name: { ko: "새 광석", en: "New ore" } },
          base: null,
          baseHash: "h",
        },
      ],
      ["fresh", { op: "put", entry: sub("fresh", "gem").entry, base: null, baseHash: null }],
      ["blade", { op: "put", entry: kind("blade", "weapon").entry, base: null, baseHash: null }],
    ]);
    const out = taxEntries(rows, staged, isSubcategoryJson);
    expect(out.map((e) => [e.id, e.entry.name.ko, e.row === null])).toEqual([
      ["ore", "새 광석", false],
      ["fresh", "한 fresh", true],
    ]);
    expect(taxEntries([], staged, isWeaponTypeJson).map((e) => e.id)).toEqual(["blade"]);
  });
});
