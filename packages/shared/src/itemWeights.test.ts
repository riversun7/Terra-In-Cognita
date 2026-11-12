// 아이템 무게 출발값 시험 — itemWeights.ts(D-535 1137 나)
import { describe, expect, it } from "vitest";
import { ITEM_WEIGHT_FALLBACK, defaultItemWeight } from "./itemWeights.ts";

describe("분류로 고른 무게(g)", () => {
  it("장비는 칸으로, 무기는 물리(검) 1.2kg·원소(지팡이) 1.8kg", () => {
    expect(
      defaultItemWeight({ category: "equipment", equip: { slot: "weapon", weapon: { physical: {} } } }),
    ).toBe(1200);
    expect(
      defaultItemWeight({ category: "equipment", equip: { slot: "weapon", weapon: { elemental: {} } } }),
    ).toBe(1800);
    expect(defaultItemWeight({ category: "equipment", equip: { slot: "body" } })).toBe(4000);
    expect(defaultItemWeight({ category: "equipment", equip: { slot: "head" } })).toBe(1400);
    expect(defaultItemWeight({ category: "equipment", equip: { slot: "accessory" } })).toBe(10);
    expect(defaultItemWeight({ category: "equipment", equip: { slot: "organ" } })).toBe(400);
  });

  it("장비가 아니면 중분류 → 대분류 → 기본", () => {
    expect(defaultItemWeight({ category: "consumable", subcategory: "buff_item" })).toBe(1000);
    expect(defaultItemWeight({ category: "document", subcategory: "blueprint" })).toBe(20);
    expect(defaultItemWeight({ category: "gem" })).toBe(5);
    expect(defaultItemWeight({ category: "unknown" })).toBe(ITEM_WEIGHT_FALLBACK);
  });
});
