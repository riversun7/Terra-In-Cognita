// 옛 모양 덮어쓰기 줄 고쳐 읽기 시험(legacy.ts, 팩 core@26) — D-501 옛 효과량 칸(스탯 1점당 ‰)·범위 밖 오차, D-501 지운 중분류(ammo),
// D-502 옛 무기 적정(core@27), 295 옛 기준 가치 칸 baseValue → 시작 시세 startPrice(core@28), 302 묶음 크기 칸 lotSize(core@29).
// 켤 때 고르기에서 그 줄이 지워지지 않고(다른 고친 칸은 남는다) 싣기 뒤 실효 항목이 지금 스키마로 읽힌다.
import { ITEM_SCHEMA_LIMITS } from "@terra/content";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { LEGACY_VARIANCE_RANGE, upgradeLegacyEntry, upgradeLegacyRows } from "./legacy.ts";
import { type ContentOverrideRecord, type EntryJson, createContentEditState } from "./state.ts";

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
const source = loaded.source;
const fresh = () => createContentEditState(source);

const record = (id: string, entry: EntryJson, packHash: string | null): ContentOverrideRecord => ({
  category: "items",
  id,
  entry,
  packHash,
  contentVersion: "core@25",
  note: null,
  updatedById: null,
  updatedByName: null,
  updatedAtMs: 1_000,
});

/** core@25에서 저장한 소모품 줄(옛 효과량 칸, 범위 밖 오차, 지운 중분류) */
const oldPotion = {
  id: "e2e_old_potion",
  name: { ko: "옛 물약", en: "Old potion" },
  category: "consumable",
  subcategory: "ammo",
  tier: 1,
  baseValue: 5,
  use: {
    effects: [
      { effect: "mend", value: 40, chancePm: 1000, scale: { stat: "vit", pmPerPoint: 10 } },
      { effect: "mend", value: 10, chancePm: 1000, variancePm: 100 },
      { effect: "mend", value: 20, chancePm: 1000, scale: { stat: "wis", appropriate: 15 }, variancePm: 300 },
    ],
  },
  enabled: true,
};

describe("옛 모양 덮어쓰기 줄(팩 core@26)", () => {
  it("오차 범위는 팩 스키마와 같다", () => {
    expect(LEGACY_VARIANCE_RANGE).toEqual({
      min: ITEM_SCHEMA_LIMITS.useVarianceMinPm,
      max: ITEM_SCHEMA_LIMITS.useVarianceMaxPm,
    });
  });

  it("옛 scale·범위 밖 오차·지운 중분류만 빼고 나머지(새 모양 줄·다른 칸)는 그대로 둔다", () => {
    const state = fresh();
    const { rows, upgraded } = upgradeLegacyRows(state.core, [record("e2e_old_potion", oldPotion, null)]);
    expect(upgraded).toEqual(["items/e2e_old_potion"]);
    const entry = rows[0]?.entry;
    expect(entry?.subcategory).toBeUndefined();
    expect(entry?.use).toEqual({
      effects: [
        { effect: "mend", value: 40, chancePm: 1000 },
        { effect: "mend", value: 10, chancePm: 1000 },
        {
          effect: "mend",
          value: 20,
          chancePm: 1000,
          scale: { stat: "wis", appropriate: 15 },
          variancePm: 300,
        },
      ],
    });
    expect(entry?.name).toEqual(oldPotion.name);
    // 고칠 것이 없는 줄은 같은 객체(키도 남기지 않는다)
    const { baseValue, ...current } = oldPotion;
    const clean = record(
      "e2e_clean",
      {
        ...current,
        startPrice: baseValue,
        subcategory: "medicine",
        use: { effects: oldPotion.use.effects.slice(2) },
      },
      null,
    );
    const again = upgradeLegacyRows(state.core, [clean]);
    expect(again.rows[0]).toBe(clean);
    expect(again.upgraded).toEqual([]);
  });

  it("켤 때 고르기에서 지워지지 않고, 싣기 뒤 실효 항목이 된다(DB 줄 원본은 바꾸지 않는다)", () => {
    const state = fresh();
    const pack = state.packEntry("items", "ration");
    const packHash = state.packHash("items", "ration");
    if (!pack || packHash === null) throw new Error("fixture ration");
    // 팩 항목을 고친 줄(무게)에 옛 효과량 칸이 든 사용 효과도 있다
    const edited = record("ration", { ...pack, weight: 321, use: oldPotion.use }, packHash);
    const created = record("e2e_old_potion", oldPotion, null);
    const selection = state.selectAtBoot([edited, created]);
    expect(selection.dropped).toEqual([]);
    expect(selection.keep.map((row) => row.id).toSorted()).toEqual(["e2e_old_potion", "ration"]);
    expect(selection.upgraded?.toSorted()).toEqual(["items/e2e_old_potion", "items/ration"]);
    state.install([edited, created], 1);
    const ration = state.effective().items.find((item) => item.id === "ration");
    expect(ration?.weight).toBe(321);
    expect(ration?.use?.effects.map((line) => line.scale ?? null)).toEqual([
      null,
      null,
      { stat: "wis", appropriate: 15 },
    ]);
    const potion = state.effective().items.find((item) => item.id === "e2e_old_potion");
    expect(potion?.subcategory).toBeUndefined();
    expect(created.entry).toBe(oldPotion);
  });
});

/** core@26에서 저장한 무기 줄(옛 2차 점수 적정치 칸) */
const oldSwordWeapon = {
  physical: { attack: 25, attackAppropriate: 40 },
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

/** 줄의 장비 칸 무기(없으면 undefined) */
const weaponOf = (row: ContentOverrideRecord | undefined): unknown => {
  const equip = row?.entry.equip;
  return typeof equip === "object" && equip !== null ? Reflect.get(equip, "weapon") : undefined;
};

describe("옛 모양 무기 줄(팩 core@27, D-502 무기 1차 적정 스탯)", () => {
  it("팩 무기를 고친 줄: 옛 2차 적정치 칸을 빼고, 적정은 팩의 지금 값(검 STR 25·DEX 12·AGI 12)", () => {
    const state = fresh();
    const pack = state.packEntry("items", "test_sword");
    const packHash = state.packHash("items", "test_sword");
    if (!pack || packHash === null) throw new Error("fixture test_sword");
    const packEquip = pack.equip;
    if (typeof packEquip !== "object" || packEquip === null) throw new Error("fixture equip");
    const edited = record(
      "test_sword",
      { ...pack, equip: { ...packEquip, weapon: oldSwordWeapon } },
      packHash,
    );
    const { rows, upgraded } = upgradeLegacyRows(state.core, [edited]);
    expect(upgraded).toEqual(["items/test_sword"]);
    expect(weaponOf(rows[0])).toEqual({
      physical: { attack: 25 },
      hitPm: 900,
      critPm: 100,
      intervalMs: 1000,
      range: 1,
      arc: false,
      staminaCost: 10,
      mpCost: 0,
      appropriate: { str: 25, dex: 12, agi: 12 },
    });
    // 켤 때 지워지지 않고 실효 항목이 된다(고친 공격력 25는 남는다)
    const selection = state.selectAtBoot([edited]);
    expect(selection.dropped).toEqual([]);
    state.install([edited], 1);
    const sword = state.effective().items.find((item) => item.id === "test_sword");
    expect(sword?.equip?.weapon?.physical).toEqual({ attack: 25 });
    expect(sword?.equip?.weapon?.appropriate).toEqual({ str: 25, dex: 12, agi: 12 });
  });

  it("만든 무기: 옛 1차 적정은 str·int·dex·agi 1 이상만 남기고(vit·0은 뺀다), 다 빠지면 칸을 뺀다", () => {
    const state = fresh();
    const base = state.packEntry("items", "test_sword");
    if (!base) throw new Error("fixture test_sword");
    const equip = base.equip;
    if (typeof equip !== "object" || equip === null) throw new Error("fixture equip");
    const made = (appropriate: Record<string, number>) =>
      record(
        "e2e_old_blade",
        { ...base, id: "e2e_old_blade", equip: { ...equip, weapon: { ...oldSwordWeapon, appropriate } } },
        null,
      );
    const kept = upgradeLegacyRows(state.core, [made({ str: 20, dex: 15, vit: 30, agi: 0 })]).rows[0];
    expect(weaponOf(kept)).toHaveProperty("appropriate", { str: 20, dex: 15 });
    const none = upgradeLegacyRows(state.core, [made({ vit: 30, wis: 10 })]).rows[0];
    expect(weaponOf(none)).not.toHaveProperty("appropriate");
  });

  it("유닛 종류 줄(스킬 편집기 소모 바꿈): 맨손은 무기 몫 0·적정 없음, 맨손 속성 자료도 맨손", () => {
    const state = fresh();
    const pack = state.packEntry("unit_kinds", "human");
    const packHash = state.packHash("unit_kinds", "human");
    if (!pack || packHash === null) throw new Error("fixture human");
    const oldNatural = { ...oldSwordWeapon, physical: { attack: 5, attackAppropriate: 20 }, unarmed: true };
    const { physical: _drop, ...body } = oldSwordWeapon;
    const oldElemental = { ...body, elemental: { attack: 5, attackAppropriate: 20 } };
    const edited: ContentOverrideRecord = {
      ...record(
        "human",
        { ...pack, naturalWeapon: oldNatural, naturalElementalWeapon: oldElemental },
        packHash,
      ),
      category: "unit_kinds",
    };
    const { rows, upgraded } = upgradeLegacyRows(state.core, [edited]);
    expect(upgraded).toEqual(["unit_kinds/human"]);
    expect(rows[0]?.entry.naturalWeapon).toMatchObject({ physical: { attack: 0 }, unarmed: true });
    expect(rows[0]?.entry.naturalWeapon).not.toHaveProperty("hitAppropriate");
    expect(rows[0]?.entry.naturalElementalWeapon).toMatchObject({ elemental: { attack: 0 }, unarmed: true });
    const selection = state.selectAtBoot([edited]);
    expect(selection.dropped).toEqual([]);
  });
});

describe("옛 기준 가치 칸(팩 core@28, 295 시작 시세)", () => {
  it("baseValue는 startPrice로 옮기고(같은 값), 둘 다 있으면 startPrice를 둔다", () => {
    const state = fresh();
    const pack = state.packEntry("items", "iron_ore");
    const packHash = state.packHash("items", "iron_ore");
    if (!pack || packHash === null) throw new Error("fixture iron_ore");
    const { startPrice: _drop, ...rest } = pack;
    const edited = record("iron_ore", { ...rest, baseValue: 12, weight: 500 }, packHash);
    const { rows, upgraded } = upgradeLegacyRows(state.core, [edited]);
    expect(upgraded).toEqual(["items/iron_ore"]);
    expect(rows[0]?.entry).toEqual({ ...rest, startPrice: 12, weight: 500 });
    const both = upgradeLegacyEntry(state.core, "items", "iron_ore", { ...pack, baseValue: 3 });
    expect(both).toEqual(pack);
    // 켤 때 지워지지 않고 실효 항목이 된다(고친 무게도 남는다)
    expect(state.selectAtBoot([edited]).dropped).toEqual([]);
    state.install([edited], 1);
    const ore = state.effective().items.find((item) => item.id === "iron_ore");
    expect([ore?.startPrice, ore?.weight]).toEqual([12, 500]);
  });

  it("감사 기록의 옛 판 항목(다시 담기)도 같은 함수로 읽는다: 고칠 것이 없으면 같은 객체", () => {
    const state = fresh();
    const pack = state.packEntry("items", "grain");
    if (!pack) throw new Error("fixture grain");
    expect(upgradeLegacyEntry(state.core, "items", "grain", pack)).toBe(pack);
    expect(upgradeLegacyEntry(state.core, "effects", "burn", { id: "burn", baseValue: 1 })).toEqual({
      id: "burn",
      baseValue: 1,
    });
  });
});

describe("묶음 크기 칸(팩 core@29, 302·D-506 광석 1g·1kg 묶음)", () => {
  it("core@28까지 저장한 철광석 줄에 lotSize가 없으면 팩 값(1,000)을 넣는다: 값은 그대로 1kg 묶음당", () => {
    const state = fresh();
    const pack = state.packEntry("items", "iron_ore");
    const packHash = state.packHash("items", "iron_ore");
    if (!pack || packHash === null) throw new Error("fixture iron_ore");
    expect(pack.lotSize).toBe(1000);
    const { lotSize: _lot, weight: _weight, ...old } = pack;
    const edited = {
      ...record("iron_ore", { ...old, tier: 1, startPrice: 9 }, packHash),
      contentVersion: "core@28",
    };
    const { rows, upgraded } = upgradeLegacyRows(state.core, [edited]);
    expect(upgraded).toEqual(["items/iron_ore"]);
    // 무게는 옮기지 않는다(옛 줄 값 그대로), 다른 고친 칸(티어·시작 시세)도 남는다
    expect(rows[0]?.entry).toEqual({ ...old, tier: 1, startPrice: 9, lotSize: 1000 });
    expect(state.selectAtBoot([edited]).dropped).toEqual([]);
    state.install([edited], 1);
    const ore = state.effective().items.find((item) => item.id === "iron_ore");
    expect([ore?.lotSize, ore?.startPrice]).toEqual([1000, 9]);
  });

  it("core@29부터 저장한 줄은 그대로, 판을 모르는 감사 옛 판 항목은 팩 값을 넣는다", () => {
    const state = fresh();
    const pack = state.packEntry("items", "iron_ore");
    const packHash = state.packHash("items", "iron_ore");
    if (!pack || packHash === null) throw new Error("fixture iron_ore");
    const { lotSize: _lot, ...cleared } = pack;
    const now = { ...record("iron_ore", cleared, packHash), contentVersion: "core@29" };
    expect(upgradeLegacyRows(state.core, [now]).upgraded).toEqual([]);
    expect(upgradeLegacyEntry(state.core, "items", "iron_ore", cleared)).toEqual(pack);
    // 팩에 묶음 칸이 없는 아이템(곡물)은 손대지 않는다
    const grain = state.packEntry("items", "grain");
    if (!grain) throw new Error("fixture grain");
    expect(upgradeLegacyEntry(state.core, "items", "grain", grain)).toBe(grain);
  });
});
