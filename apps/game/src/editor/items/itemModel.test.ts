import type { ItemJson, ItemRow } from "@terra/shared/itemEditor";
import { describe, expect, it } from "vitest";
import {
  EMPTY_QUERY,
  EMPTY_STAGE,
  changedPaths,
  changesOf,
  cleanItem,
  codeRefRisks,
  droppedBundles,
  duplicateItem,
  filterItems,
  isItemJson,
  isTaxonomyJson,
  newItemTemplate,
  shelfMs,
  shelfParts,
  sortItems,
  stageItem,
  stageKeys,
  stageTaxonomy,
  weightText,
  withCategory,
  withSlot,
} from "./itemModel.ts";
import { changedKeysOf, rebaseStage, stageDiscard } from "./itemRebase.ts";

const row = (id: string, extra: Partial<ItemRow> = {}): ItemRow => ({
  id,
  name: { ko: `한 ${id}`, en: `En ${id}` },
  category: "raw",
  subcategory: null,
  tags: [],
  tier: 0,
  startPrice: 1,
  weight: null,
  enabled: true,
  origin: "pack",
  hash: "0".repeat(64),
  storage: "general",
  market: "book",
  slot: null,
  weaponType: null,
  kinds: [],
  attack: null,
  appropriate: null,
  stats: [],
  effects: [],
  shelfLifeMs: null,
  advice: 0,
  codeRef: false,
  ...extra,
});

const sword: ItemJson = {
  id: "test_sword",
  name: { ko: "시험 검", en: "Test sword" },
  category: "equipment",
  tier: 1,
  startPrice: 100,
  stackMax: 1,
  equip: {
    slot: "weapon",
    stats: [{ stat: "hit_bonus", min: 1, max: 3 }],
    weaponType: "blade",
    weapon: {
      physical: { attack: 10 },
      appropriate: { str: 12, dex: 10, agi: 10 },
      hitPm: 900,
      critPm: 50,
      intervalMs: 1000,
      range: 1,
      arc: false,
      staminaCost: 10,
      mpCost: 0,
    },
  },
  enabled: true,
};

describe("아이템 편집기 모델: 목록", () => {
  it("찾기는 ID·이름 ko/en·태그, 거르기는 대분류·티어·담은 변경", () => {
    const rows = [
      row("iron_ore", { tags: ["metal"], tier: 2 }),
      row("wheat", { category: "processed" }),
      row("test_sword", { category: "equipment", slot: "weapon", tier: 1 }),
    ];
    const ids = (query: Partial<typeof EMPTY_QUERY>, staged = new Set<string>()) =>
      filterItems(rows, { ...EMPTY_QUERY, ...query }, staged).map((item) => item.id);
    expect(ids({ text: "METAL" })).toEqual(["iron_ore"]);
    expect(ids({ text: "en whe" })).toEqual(["wheat"]);
    expect(ids({ category: "equipment" })).toEqual(["test_sword"]);
    expect(ids({ tierMin: 1, tierMax: 1 })).toEqual(["test_sword"]);
    expect(ids({ staged: true }, new Set(["wheat"]))).toEqual(["wheat"]);
    expect(ids({ slot: "weapon" })).toEqual(["test_sword"]);
    // 낱말 여럿은 모두 맞는 것, 대분류 ID로도 찾는다
    expect(ids({ text: "equipment sword" })).toEqual(["test_sword"]);
    expect(ids({ text: "equipment wheat" })).toEqual([]);
  });

  it("무게 정렬은 무게 없는 항목을 뒤로, 같으면 ID 차례", () => {
    const rows = [
      row("b", { weight: null }),
      row("c", { weight: 500 }),
      row("a", { weight: 500 }),
      row("d", { weight: 10 }),
    ];
    expect(sortItems(rows, "weight", "ko").map((item) => item.id)).toEqual(["d", "a", "c", "b"]);
  });
});

describe("아이템 편집기 모델: 칸 맞추기", () => {
  it("무기 칸이면 무기 사양을 두고, 머리 칸으로 바꾸면 무기 사양·무기 종류를 뺀다", () => {
    const head = withSlot(sword.equip ?? { slot: "head", stats: [] }, "head");
    expect(head.weapon).toBeUndefined();
    expect(head.weaponType).toBeUndefined();
    expect(head.stats).toEqual([{ stat: "hit_bonus", min: 1, max: 3 }]);
    const back = withSlot(head, "weapon");
    expect(back.weapon?.physical).toEqual({ attack: 10 });
    // 새 무기는 1차 적정 스탯을 비운다(모든 몫 100%, D-502)
    expect(back.weapon?.appropriate).toBeUndefined();
  });

  it("1차 칸(장신구)은 1차 스탯 줄만, 2차 칸은 2차 줄만 남긴다", () => {
    const mixed = {
      slot: "head" as const,
      stats: [
        { stat: "str", min: 1, max: 2 },
        { stat: "hit_bonus", min: 1, max: 2 },
      ],
    };
    expect(withSlot(mixed, "accessory").stats.map((stat) => stat.stat)).toEqual(["str"]);
    expect(withSlot(mixed, "body").stats.map((stat) => stat.stat)).toEqual(["hit_bonus"]);
  });

  it("대분류를 바꾸면 맞지 않는 묶음을 빼고, 빠지는 묶음을 먼저 알려 준다", () => {
    const food: ItemJson = {
      ...newItemTemplate("bread", "processed", { ko: "빵", en: "Bread" }),
      subcategory: "baked",
      perish: { shelfLifeMs: 86_400_000, spoilsTo: "rotten_food" },
    };
    expect(droppedBundles(food, "consumable")).toEqual(["subcategory"]);
    expect(withCategory(food, "consumable").perish).toEqual(food.perish);
    expect(droppedBundles(food, "equipment")).toEqual(["perish", "subcategory"]);
    const equipment = withCategory(food, "equipment");
    expect(equipment.perish).toBeUndefined();
    expect(equipment.stackMax).toBe(1);
    expect(equipment.equip).toEqual({ slot: "head", stats: [] });
    expect(droppedBundles(sword, "raw")).toEqual(["equip"]);
  });

  it("보낼 항목은 빈 설명·빈 태그를 빼고, 계정 귀속이면 거래 가능을 뺀다", () => {
    const item: ItemJson = {
      ...newItemTemplate("gem_x", "gem", { ko: "보석", en: "Gem" }),
      description: { ko: " ", en: "" },
      tags: [],
      bound: true,
      tradable: true,
    };
    expect(cleanItem(item)).toEqual({
      id: "gem_x",
      name: { ko: "보석", en: "Gem" },
      category: "gem",
      tier: 0,
      startPrice: 1,
      bound: true,
      enabled: false,
    });
  });

  it("복제는 새 ID·두 언어 꼬리·꺼진 채", () => {
    expect(duplicateItem(sword, "test_sword_copy", { ko: "(복사)", en: "(Copy)" })).toMatchObject({
      id: "test_sword_copy",
      name: { ko: "시험 검 (복사)", en: "Test sword (Copy)" },
      enabled: false,
      equip: sword.equip,
    });
  });
});

describe("아이템 편집기 모델: 담은 변경", () => {
  it("묶음은 분류 자료 먼저, 아이템은 다듬어서. 되돌리기·잠든 줄 버리기도 싣는다", () => {
    let stage = stageItem(EMPTY_STAGE, "test_sword", {
      op: "put",
      entry: { ...sword, tags: [] },
      base: sword,
      baseHash: "a".repeat(64),
    });
    stage = stageItem(stage, "old_item", {
      op: "revert",
      entry: null,
      base: sword,
      baseHash: "b".repeat(64),
    });
    stage = stageTaxonomy(stage, "weapon_types", "lance", {
      op: "put",
      entry: { id: "lance", name: { ko: "창", en: "Lance" }, slot: "weapon", enabled: true },
      base: null,
      baseHash: null,
    });
    stage = stageTaxonomy(stage, "item_tags", "sleepy", {
      op: "discard_sleeping",
      entry: null,
      base: null,
      baseHash: null,
    });
    expect(stageKeys(stage)).toEqual([
      "items/test_sword",
      "items/old_item",
      "item_tags/sleepy",
      "weapon_types/lance",
    ]);
    const changes = changesOf(stage);
    expect(changes.map((change) => `${change.op}:${change.category}`)).toEqual([
      "discard_sleeping:item_tags",
      "put:weapon_types",
      "put:items",
      "revert:items",
    ]);
    expect(changes[2]).toEqual({
      op: "put",
      category: "items",
      entry: { ...sword },
      baseHash: "a".repeat(64),
    });
    expect(changes[3]).toEqual({ op: "revert", category: "items", id: "old_item", baseHash: "b".repeat(64) });
    expect(stageKeys(stageItem(stage, "test_sword", null))).not.toContain("items/test_sword");
  });

  it("팩 값과 다른 칸 경로(배열은 통째)", () => {
    const edited: ItemJson = {
      ...sword,
      tier: 2,
      equip: { ...(sword.equip ?? { slot: "weapon", stats: [] }), stats: [] },
    };
    expect(changedPaths(sword, edited)).toEqual(["equip.stats", "tier"]);
    expect(changedPaths(sword, sword)).toEqual([]);
  });

  it("감사 기록에서 받은 항목 모양 확인", () => {
    expect(isItemJson(sword)).toBe(true);
    expect(isItemJson({ ...sword, category: "weapon" })).toBe(false);
    expect(isItemJson({ id: "x" })).toBe(false);
    expect(
      isTaxonomyJson("weapon_types", {
        id: "bow",
        name: { ko: "활", en: "Bow" },
        slot: "weapon",
        enabled: true,
      }),
    ).toBe(true);
    expect(
      isTaxonomyJson("weapon_types", {
        id: "bow",
        name: { ko: "활", en: "Bow" },
        slot: "head",
        enabled: true,
      }),
    ).toBe(false);
    expect(
      isTaxonomyJson("item_subcategories", {
        id: "ore",
        name: { ko: "광석", en: "Ore" },
        major: "raw",
        enabled: true,
      }),
    ).toBe(true);
  });
});

describe("아이템 편집기 모델: 단위", () => {
  it("유통기한 일·시간 ↔ ms, 무게 g → kg·t", () => {
    expect(shelfParts(shelfMs(3, 5))).toEqual({ days: 3, hours: 5 });
    expect(shelfMs(0, 1)).toBe(3_600_000);
    expect(weightText(850)).toBe("850 g");
    expect(weightText(1500)).toBe("1.50 kg");
    expect(weightText(2_000_000)).toBe("2 t");
  });
});

const isCode = (id: string): boolean => id === "test_sword";
const issue = (code: string, details: string) => ({
  level: "error" as const,
  file: null,
  id: null,
  path: null,
  code,
  params: { details },
  message: code,
});

describe("아이템 편집기 모델: 코드 참조·다시 얹기", () => {
  it("코드가 ID로 쓰는 아이템을 끄거나 칸·무기 공격 칸을 바꾸면 적용 전에 묻는다(다른 칸은 묻지 않는다)", () => {
    const put = (entry: ItemJson) =>
      stageItem(EMPTY_STAGE, sword.id, { op: "put", entry, base: sword, baseHash: null });
    const head = withSlot(sword.equip ?? { slot: "weapon", stats: [] }, "head");
    expect(codeRefRisks(put({ ...sword, tier: 3 }), isCode)).toEqual([]);
    expect(codeRefRisks(put({ ...sword, enabled: false }), isCode)).toEqual(["test_sword"]);
    expect(codeRefRisks(put({ ...sword, equip: head }), isCode)).toEqual(["test_sword"]);
    expect(codeRefRisks(put({ ...sword, enabled: false }), () => false)).toEqual([]);
  });

  it("entry_changed: 다른 칸은 서버 항목 위에 내 칸만 얹고, 같은 칸은 충돌로 알린다(바탕·해시는 서버 것)", () => {
    const fresh = {
      contentVersion: "core@24",
      revision: 5,
      items: [],
      subcategories: [],
      tags: [],
      weaponTypes: [],
      unitKinds: [],
      skills: [],
      effects: [],
      statRows: [],
      retired: { items: [], item_subcategories: [], item_tags: [], weapon_types: [] },
      sleeping: [],
    };
    const theirs: ItemJson = { ...sword, tier: 2 };
    const stage = stageItem(EMPTY_STAGE, sword.id, {
      op: "put",
      entry: { ...sword, startPrice: 150 },
      base: sword,
      baseHash: "a".repeat(64),
    });
    const done = rebaseStage(
      stage,
      ["items/test_sword"],
      new Map([[sword.id, { entry: theirs, hash: "c".repeat(64) }]]),
      fresh,
    );
    expect(done.stage.items.get(sword.id)).toEqual({
      op: "put",
      entry: { ...sword, tier: 2, startPrice: 150 },
      base: theirs,
      baseHash: "c".repeat(64),
    });
    expect(done.conflicts.size).toBe(0);
    const clash = rebaseStage(
      stageItem(EMPTY_STAGE, sword.id, {
        op: "put",
        entry: { ...sword, tier: 4 },
        base: sword,
        baseHash: null,
      }),
      ["items/test_sword"],
      new Map([[sword.id, { entry: { ...sword, tier: 3 }, hash: "d".repeat(64) }]]),
      fresh,
    );
    expect(clash.stage.items.get(sword.id)?.entry?.tier).toBe(4);
    expect(clash.conflicts.get("items/test_sword")?.paths).toEqual(["tier"]);
  });

  it("검사 결과의 entry_changed 키를 뽑고, 잠든 줄 버리기는 그 분류에 담는다(모르는 분류는 그대로)", () => {
    expect(
      changedKeysOf([issue("entry_changed", "items/iron_ore, weapon_types/bow"), issue("too_small", "x")]),
    ).toEqual(["items/iron_ore", "weapon_types/bow"]);
    expect(changedKeysOf([issue("entry_changed", "")])).toEqual([]);
    expect(stageKeys(stageDiscard(EMPTY_STAGE, "item_tags", "old_tag"))).toEqual(["item_tags/old_tag"]);
    expect(stageDiscard(EMPTY_STAGE, "skills", "slash")).toBe(EMPTY_STAGE);
  });
});
