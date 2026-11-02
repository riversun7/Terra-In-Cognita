// 아이템 권고 시험(설계안 2.7 "권고") — 실제 팩으로: 무게·중분류 없음, 이 무기로 못 쓰는 장비 스킬(D-490), 내구도 ≤ 파괴 문턱,
// 끄면 멈추는 레시피·생필품, 시작 시세와 레시피 원가, 1차 적정 스탯으로 셈한 2차 적정치 0(WP-5), 입을 수 있는 종류·크리쳐 보유(WP-C),
// 탄약 장비의 내구도(D-497).
import {
  itemEntrySchema,
  necessityEntrySchema,
  readCategoryFile,
  recipeEntrySchema,
  statRowEntrySchema,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { type AdviceContext, itemAdvice } from "./advice.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const source = loaded.source;
const state = createContentEditState(source);
const ctx: AdviceContext = {
  effective: state.effective(),
  effects: state.effects,
  statRows: readCategoryFile(source, "stat_rows").entries.map((raw) => statRowEntrySchema.parse(raw)),
  recipes: readCategoryFile(source, "recipes").entries.map((raw) => recipeEntrySchema.parse(raw)),
  necessities: readCategoryFile(source, "necessities").entries.map((raw) => necessityEntrySchema.parse(raw)),
  destroyAt: 10,
};
const item = (
  id: string,
  change: (raw: Record<string, unknown>) => Record<string, unknown> = (raw) => raw,
) => {
  const raw = state.packEntry("items", id);
  if (!raw) throw new Error(`fixture ${id}`);
  return itemEntrySchema.parse(change(structuredClone({ ...raw })));
};
const codes = (entry: ReturnType<typeof item>) => itemAdvice(ctx, entry).map((issue) => issue.code);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const objectOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

describe("아이템 권고", () => {
  it("지금 팩 항목: 무게·중분류·설명이 없다(저장은 막지 않는다)", () => {
    expect(codes(item("grain"))).toEqual(
      expect.arrayContaining(["advice_no_weight", "advice_no_subcategory", "advice_no_description"]),
    );
  });

  it("이 무기의 칸으로 못 쓰는 장비 스킬, 내구도 ≤ 파괴 문턱, STR만 적은 1차 적정 스탯은 명중·크리 적정치가 0", () => {
    const sword = item("test_sword", (raw) => {
      const equip = { ...objectOf(raw.equip) };
      equip.skills = ["fire_bolt"];
      equip.maxDurability = 10;
      equip.weapon = { ...objectOf(equip.weapon), appropriate: { str: 12 } };
      return { ...raw, equip };
    });
    const advice = itemAdvice(ctx, sword);
    expect(advice.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["advice_skill_unusable", "advice_durability_low"]),
    );
    // D-502: 적정 1차가 없는 몫(명중·크리 DEX, 공격 간격 AGI)은 유닛 스탯을 타지 않는다(물리 칸은 STR가 있다)
    expect(advice.find((issue) => issue.code === "advice_appropriate_missing")?.params.stats).toBe(
      "DEX, AGI",
    );
    // 무기에 있는 칸의 적정만 적었으니 쓰지 않는 적정은 없다
    expect(advice.some((issue) => issue.code === "advice_appropriate_unused")).toBe(false);
  });

  it("입을 수 있는 종류에 그 칸이 없거나, 크리쳐 보유 칸인데 크리쳐가 못 입는다(D-494)", () => {
    const ring = item("test_ring", (raw) => ({
      ...raw,
      equip: { ...objectOf(raw.equip), kinds: ["human"], creature: { weight: 10, stealPm: 200 } },
    }));
    expect(codes(ring)).toContain("advice_creature_unwearable");
    const heart = item("test_heart", (raw) => ({
      ...raw,
      equip: { ...objectOf(raw.equip), kinds: ["human", "cyborg"] },
    }));
    const kindAdvice = itemAdvice(ctx, heart).find((issue) => issue.code === "advice_kind_no_slot");
    expect(kindAdvice?.params).toMatchObject({ kind: "human", slot: "organ" });
  });

  it("탄약 장비(화살통 종류)는 최대 내구도 = 담는 탄 수가 있어야 한다고 알린다(D-497)", () => {
    const quiver = item("test_helmet", (raw) => ({
      ...raw,
      equip: { slot: "offhand", stats: [], weaponType: "quiver" },
    }));
    expect(codes(quiver)).toContain("advice_ammo_capacity");
    const filled = item("test_helmet", (raw) => ({
      ...raw,
      equip: { slot: "offhand", stats: [], weaponType: "quiver", maxDurability: 200 },
    }));
    expect(codes(filled)).not.toContain("advice_ammo_capacity");
    // 방패 종류를 탄약으로 가리킨 활
    const bow = item("test_sword", (raw) => {
      const equip = { ...objectOf(raw.equip) };
      equip.weapon = { ...objectOf(equip.weapon), ammo: "shield" };
      return { ...raw, equip };
    });
    expect(codes(bow)).toContain("advice_ammo_type_not_ammo");
  });

  it("끄면 그 아이템을 쓰는 레시피·생필품이 함께 멈춘다고 알린다", () => {
    const off = item("ration", (raw) => ({ ...raw, enabled: false }));
    const cascade = itemAdvice(ctx, off).find((issue) => issue.code === "advice_disable_cascade");
    expect(cascade?.params.recipes).toContain("cook_ration");
    expect(cascade?.params.necessities).toContain("food");
  });

  it("시작 시세가 레시피 원가보다 낮다", () => {
    const cheap = item("iron_ingot", (raw) => ({ ...raw, startPrice: 1 }));
    expect(codes(cheap)).toContain("advice_value_below_cost");
  });
});
