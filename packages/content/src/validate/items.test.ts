// 아이템 분류 시험 — 공통 칸·대분류별 묶음·분류 자료(중분류·태그·무기 종류)와 항목 사이 규칙(docs/adr/2026-11-01-item-editor.md 2절).
// 문제마다 코드(code)를 단다: 편집기가 메시지 키로 보인다.
import { describe, expect, it } from "vitest";
import { ITEM_FIELDS, fixture } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const name = { ko: "이름", en: "Name" };
const WEAPON_BODY = {
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
};
const statRows = {
  entries: [{ id: "armor_hp", name, shape: "quantity", base: 0, weights: [0, 0, 0, 0, 0, 0], enabled: true }],
};
const effects = {
  entries: [
    {
      id: "mend",
      name,
      kind: "heal",
      valueMode: "flat",
      durationMs: 0,
      tickMs: 0,
      stacking: "refresh",
      maxStacks: 1,
      enabled: true,
    },
  ],
};
const subcategories = {
  entries: [
    { id: "ore", name, major: "raw", enabled: true },
    { id: "fish", name, major: "raw", storage: "food", food: true, foodFamily: "fishing", enabled: true },
    { id: "dish", name, major: "consumable", storage: "food", food: true, enabled: true },
    { id: "weapon", name, major: "equipment", storage: "armory", enabled: true },
  ],
};
const weaponTypes = {
  entries: [
    { id: "bow", name, slot: "weapon", enabled: true },
    { id: "quiver", name, slot: "offhand", enabled: true },
  ],
};
const unitKinds = {
  entries: [
    {
      id: "creature",
      name,
      slots: ["weapon", "body", "accessory"],
      skillSlots: { base: 3, perRebirth: 1, max: 10 },
      naturalWeapon: { ...WEAPON_BODY, physical: { attack: 5, attackAppropriate: 20 } },
      naturalElementalWeapon: { ...WEAPON_BODY, elemental: { attack: 5, attackAppropriate: 20 } },
      enabled: true,
    },
  ],
};

/** 활(무기 종류·탄약 연결·1차 적정 스탯·양손·전투 직접 값·크리쳐 보유를 다 적은 장비) */
const bow = {
  id: "short_bow",
  name,
  ...ITEM_FIELDS,
  category: "equipment",
  subcategory: "weapon",
  weight: 1200,
  stackMax: 1,
  tradable: true,
  equip: {
    slot: "weapon",
    stats: [],
    weaponType: "bow",
    maxDurability: 200,
    combat: { resistPm: [0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0], defenseFlat: 2, penetrationPm: 50 },
    kinds: ["creature"],
    creature: { weight: 10, stealPm: 300 },
    weapon: {
      ...WEAPON_BODY,
      physical: { attack: 22, attackAppropriate: 40 },
      range: 6,
      appropriate: { dex: 14, agi: 8 },
      twoHanded: true,
      ammo: "quiver",
    },
  },
};
const rawFish = {
  id: "raw_fish",
  name,
  ...ITEM_FIELDS,
  subcategory: "fish",
  perish: { shelfLifeMs: 259_200_000, spoilsTo: "rotten_fish" },
};
const rottenFish = { id: "rotten_fish", name, ...ITEM_FIELDS, subcategory: "fish", bound: true };
const potion = {
  id: "red_potion",
  name,
  ...ITEM_FIELDS,
  category: "consumable",
  stackMax: 100,
  use: { effects: [{ effect: "mend", value: 50, chancePm: 1000 }] },
};

const issuesOf = (items: readonly unknown[], extra: Record<string, unknown> = {}) =>
  validatePack(
    fixture({
      "items.json": { entries: items },
      "stat_rows.json": statRows,
      "effects.json": effects,
      "item_subcategories.json": subcategories,
      "item_tags.json": { entries: [{ id: "starter", name, enabled: true }] },
      "weapon_types.json": weaponTypes,
      "unit_kinds.json": unitKinds,
      ...extra,
    }),
  ).issues;
const codes = (items: readonly unknown[], extra: Record<string, unknown> = {}) =>
  issuesOf(items, extra).map((issue) => [issue.id, issue.path, issue.code]);

describe("아이템 공통 칸·묶음", () => {
  it("새 칸을 다 적은 장비·식재료·물약이 통과한다(옛 칸만 적은 항목도 그대로)", () => {
    expect(issuesOf([bow, rawFish, rottenFish, potion, { id: "plain", name, ...ITEM_FIELDS }])).toEqual([]);
  });

  it("대분류와 묶음이 맞아야 한다(장비 칸·신선도·사용 효과)", () => {
    const { equip, ...noEquip } = bow;
    expect(
      codes([
        noEquip,
        { ...rawFish, equip, id: "fish_gear" },
        { ...bow, id: "bow_perish", perish: rawFish.perish },
        { ...rawFish, id: "raw_use", use: potion.use },
        rottenFish,
      ]),
    ).toEqual([
      ["short_bow", "equip", "item_equip_required"],
      ["fish_gear", "equip", "item_equip_category"],
      ["bow_perish", "perish", "item_perish_category"],
      ["raw_use", "use", "item_use_category"],
    ]);
  });

  it("장비는 쌓지 않고, 계정 귀속은 거래할 수 없고, 태그는 겹치지 않는다", () => {
    expect(
      codes([
        { ...bow, stackMax: 5 },
        { ...potion, bound: true, tradable: true },
        { ...potion, id: "tagged", tags: ["starter", "starter"] },
      ]),
    ).toEqual([
      ["short_bow", "stackMax", "item_stack_equipment"],
      ["red_potion", "tradable", "item_bound_tradable"],
      ["tagged", "tags[1]", "item_tag_duplicate"],
    ]);
  });

  it("범위 밖 값은 Zod 문제 코드와 한계 값을 싣는다", () => {
    const [issue] = issuesOf([{ ...potion, weight: 100_000_001 }]);
    expect(issue).toMatchObject({
      id: "red_potion",
      path: "weight",
      code: "too_big",
      params: { maximum: 100_000_000, inclusive: true },
    });
  });
});

describe("아이템 사이 규칙", () => {
  it("중분류의 대분류가 아이템 대분류와 같아야 한다", () => {
    expect(codes([{ ...potion, subcategory: "ore" }])).toEqual([
      ["red_potion", "subcategory", "item_subcategory_major"],
    ]);
  });

  it("무기 종류는 무기·보조 칸에만, 그 종류의 칸과 같게. 탄약 연결은 보조 칸 종류만", () => {
    const head = { ...bow, id: "cap", equip: { slot: "head", stats: [], weaponType: "bow" } };
    const quiverOnWeapon = { ...bow, id: "odd_bow", equip: { ...bow.equip, weaponType: "quiver" } };
    const ammoBow = {
      ...bow,
      id: "self_ammo",
      equip: { ...bow.equip, weapon: { ...bow.equip.weapon, ammo: "bow" } },
    };
    // 스키마 단계 문제가 있으면 항목 사이 검사는 돌지 않는다(팩 검사 차례)
    expect(codes([head, quiverOnWeapon])).toEqual([["cap", "equip.weaponType", "equip_weapon_type_slot"]]);
    expect(codes([quiverOnWeapon, ammoBow])).toEqual([
      ["odd_bow", "equip.weaponType", "item_weapon_type_slot"],
      ["self_ammo", "equip.weapon.ammo", "item_ammo_type"],
    ]);
  });

  it("신선도 0이면 바뀌는 아이템은 자기 자신이 아니고, 사슬이 돌지 않는다", () => {
    const self = { ...rawFish, id: "self_fish", perish: { shelfLifeMs: 3_600_000, spoilsTo: "self_fish" } };
    const loopA = { ...rawFish, id: "loop_a", perish: { shelfLifeMs: 3_600_000, spoilsTo: "loop_b" } };
    const loopB = { ...rawFish, id: "loop_b", perish: { shelfLifeMs: 3_600_000, spoilsTo: "loop_a" } };
    expect(codes([self, loopA, loopB, rottenFish])).toEqual([
      ["self_fish", "perish.spoilsTo", "item_spoils_self"],
      ["loop_a", "perish.spoilsTo", "item_spoils_cycle"],
    ]);
  });

  it("없는 중분류·태그·무기 종류·유닛 종류·효과·바뀌는 아이템은 참조 문제(ref_missing)다", () => {
    const issues = issuesOf([
      { ...rawFish, subcategory: "meat", tags: ["rare"] },
      { ...bow, equip: { ...bow.equip, kinds: ["dragon"] } },
      { ...potion, use: { effects: [{ effect: "haste", value: 1, chancePm: 1000 }] } },
    ]);
    expect(issues.map((issue) => [issue.path, issue.code, issue.params?.category])).toEqual([
      ["subcategory", "ref_missing", "item_subcategories"],
      ["tags[0]", "ref_missing", "item_tags"],
      ["perish.spoilsTo", "ref_missing", "items"],
      ["equip.kinds[0]", "ref_missing", "unit_kinds"],
      ["use.effects[0].effect", "ref_missing", "effects"],
    ]);
  });
});

describe("장비 칸", () => {
  it("1차 적정 스탯은 적어도 하나, 유닛 종류는 겹치지 않고, 속성 저항은 12칸", () => {
    const withWeapon = (weapon: Record<string, unknown>) => ({
      ...bow,
      equip: { ...bow.equip, weapon: { ...bow.equip.weapon, ...weapon } },
    });
    expect(codes([withWeapon({ appropriate: {} })])).toEqual([
      ["short_bow", "equip.weapon.appropriate", "weapon_appropriate_empty"],
    ]);
    expect(codes([{ ...bow, equip: { ...bow.equip, kinds: ["creature", "creature"] } }])).toEqual([
      ["short_bow", "equip.kinds[1]", "equip_kind_duplicate"],
    ]);
    expect(codes([{ ...bow, equip: { ...bow.equip, combat: { resistPm: [0, 0] } } }])).toEqual([
      ["short_bow", "equip.combat.resistPm", "too_small"],
    ]);
  });
});

describe("분류 자료", () => {
  it("식재료 계열은 식품 중분류에만, 무기 종류 칸은 무기·보조만", () => {
    expect(
      codes([], {
        "item_subcategories.json": {
          entries: [{ id: "ore", name, major: "raw", foodFamily: "crop", enabled: true }],
        },
        "weapon_types.json": { entries: [{ id: "helm", name, slot: "head", enabled: true }] },
      }),
    ).toEqual([
      ["ore", "foodFamily", "subcategory_food_family"],
      ["helm", "slot", "invalid_value"],
    ]);
  });
});
