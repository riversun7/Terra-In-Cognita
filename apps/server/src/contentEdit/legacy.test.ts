// 옛 모양 덮어쓰기 줄 고쳐 읽기 시험(legacy.ts, 팩 core@26) — D-501 옛 효과량 칸(스탯 1점당 ‰)·범위 밖 오차, D-501 지운 중분류(ammo).
// 켤 때 고르기에서 그 줄이 지워지지 않고(다른 고친 칸은 남는다) 싣기 뒤 실효 항목이 지금 스키마로 읽힌다.
import { ITEM_SCHEMA_LIMITS } from "@terra/content";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { LEGACY_VARIANCE_RANGE, upgradeLegacyRows } from "./legacy.ts";
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
    const clean = record(
      "e2e_clean",
      { ...oldPotion, subcategory: "medicine", use: { effects: oldPotion.use.effects.slice(2) } },
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
