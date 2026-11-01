// 아이템 권고 시험(설계안 2.7 "권고") — 실제 팩으로: 무게·중분류 없음, 이 무기로 못 쓰는 장비 스킬(D-490), 내구도 ≤ 파괴 문턱,
// 끄면 멈추는 레시피·생필품, 기준 가치와 레시피 원가, 1차 적정 스탯 전투 연결 전(WP-5).
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
import { effectsOf } from "../world/combatCatalog.ts";
import { type AdviceContext, itemAdvice } from "./advice.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const source = loaded.source;
const state = createContentEditState(source, effectsOf(source));
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

  it("이 무기의 칸으로 못 쓰는 장비 스킬, 내구도 ≤ 파괴 문턱, 1차 적정 스탯은 아직 전투에 잇지 않음", () => {
    const sword = item("test_sword", (raw) => {
      const equip = { ...objectOf(raw.equip) };
      equip.skills = ["fire_bolt"];
      equip.maxDurability = 10;
      equip.weapon = { ...objectOf(equip.weapon), appropriate: { str: 12 } };
      return { ...raw, equip };
    });
    expect(codes(sword)).toEqual(
      expect.arrayContaining([
        "advice_skill_unusable",
        "advice_durability_low",
        "advice_appropriate_pending",
      ]),
    );
  });

  it("끄면 그 아이템을 쓰는 레시피·생필품이 함께 멈춘다고 알린다", () => {
    const off = item("ration", (raw) => ({ ...raw, enabled: false }));
    const cascade = itemAdvice(ctx, off).find((issue) => issue.code === "advice_disable_cascade");
    expect(cascade?.params.recipes).toContain("cook_ration");
    expect(cascade?.params.necessities).toContain("food");
  });

  it("기준 가치가 레시피 원가보다 낮다", () => {
    const cheap = item("iron_ingot", (raw) => ({ ...raw, baseValue: 1 }));
    expect(codes(cheap)).toContain("advice_value_below_cost");
  });
});
