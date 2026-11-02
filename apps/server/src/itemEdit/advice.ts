// 아이템 권고 — 저장을 막지 않는 문제(설계안 2.7 "권고"). 서버가 그 세계의 실효 항목으로 셈해 목록에는 개수로, 편집 칸에는 줄로 보인다.
// 코드(advice_*)와 값(params)을 단다: 화면은 메시지 키로 보인다. 규칙이 아니라 알림이다(문턱 값은 기술 상수 [A]).
// 장비 칸 권고는 adviceEquip.ts(파일 크기).
import type { EffectEntry, ItemEntry, NecessityEntry, RecipeEntry, StatRowEntry } from "@terra/content";
import type { ContentIssueView } from "@terra/shared/contentEdit";
import type { ContentEffective } from "../contentEdit/state.ts";
import { equipAdvice } from "./adviceEquip.ts";

/** 시작 시세가 레시피 원가의 몇 배를 넘으면 알리나(기술 상수) */
const VALUE_OVER_COST = 10n;
/** 이름 길이(F19 범위: 한글 2~8자, 영문 3~16자, 49_Settings.md. 대상이 크리쳐 등이라 권고만) */
const NAME_LENGTH = { ko: { min: 2, max: 8 }, en: { min: 3, max: 16 } } as const;

export interface AdviceContext {
  readonly effective: ContentEffective;
  readonly effects: readonly EffectEntry[];
  readonly statRows: readonly StatRowEntry[];
  readonly recipes: readonly RecipeEntry[];
  readonly necessities: readonly NecessityEntry[];
  /** 장비 파괴 문턱(설정 칸 F12 f12_destroy_at 실효 값). 없으면 null */
  readonly destroyAt: number | null;
}

const warning = (
  item: string,
  path: string | null,
  code: string,
  params: Record<string, string | number | boolean> = {},
): ContentIssueView => ({
  level: "warning",
  file: "items.json",
  id: item,
  path,
  code,
  params,
  message: code,
});

const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
/** 글자 수(합친 글자 하나 = 1) */
const graphemes = (text: string): number => [...segmenter.segment(text.trim())].length;

/** 켜진 항목 ID */
const enabledIds = (list: readonly { id: string; enabled: boolean }[]): Set<string> =>
  new Set(list.filter((entry) => entry.enabled).map((entry) => entry.id));

/**
 * 레시피 하나로 이 아이템 하나를 만드는 원가(입력 시작 시세 합 ÷ 이 아이템 출력 수량, 내림). 입력 값을 모르면 null.
 * 시작 시세(295)는 시장이 처음 열릴 때의 첫 가격이라, 이 원가도 "세계가 처음 열릴 때"의 원가다(그 뒤는 시장 시세)
 */
export function recipeCost(
  recipe: RecipeEntry,
  itemId: string,
  values: ReadonlyMap<string, number>,
): bigint | null {
  const out = recipe.outputs.find((stack) => stack.item.id === itemId);
  if (!out) return null;
  let sum = 0n;
  for (const stack of recipe.inputs) {
    const value = values.get(stack.item.id);
    if (value === undefined) return null;
    sum += BigInt(value) * BigInt(stack.qty);
  }
  return sum / BigInt(out.qty);
}

export function itemAdvice(ctx: AdviceContext, item: ItemEntry): ContentIssueView[] {
  const out: ContentIssueView[] = [];
  const add = (path: string | null, code: string, params?: Record<string, string | number | boolean>) =>
    out.push(warning(item.id, path, code, params));
  const { effective } = ctx;
  if (item.weight === undefined) add("weight", "advice_no_weight");
  if (item.subcategory === undefined) add("subcategory", "advice_no_subcategory");
  if (item.description === undefined) add("description", "advice_no_description");
  for (const lang of ["ko", "en"] as const) {
    const length = graphemes(item.name[lang]);
    const range = NAME_LENGTH[lang];
    if (length < range.min || length > range.max)
      add(`name.${lang}`, "advice_name_length", { lang, length, min: range.min, max: range.max });
  }

  // 꺼진 것을 가리킨다(참조 검사는 켬·끔을 보지 않는다. 전투 자료는 꺼진 스킬·효과를 걸러 낸다)
  const effectsOn = enabledIds(ctx.effects);
  const itemsOn = enabledIds(effective.items);
  const disabledRef = (path: string, category: string, id: string, on: ReadonlySet<string>) => {
    if (!on.has(id)) add(path, "advice_disabled_ref", { category, id });
  };
  if (item.subcategory)
    disabledRef(
      "subcategory",
      "item_subcategories",
      item.subcategory.id,
      enabledIds(effective.itemSubcategories),
    );
  (item.tags ?? []).forEach((tag, index) => {
    disabledRef(`tags[${index}]`, "item_tags", tag.id, enabledIds(effective.itemTags));
  });
  if (item.perish) disabledRef("perish.spoilsTo", "items", item.perish.spoilsTo.id, itemsOn);
  (item.use?.effects ?? []).forEach((part, index) => {
    disabledRef(`use.effects[${index}].effect`, "effects", part.effect.id, effectsOn);
  });

  if (item.equip) equipAdvice(ctx, item.equip, add);

  // 경제: 레시피 티어·원가(시작 시세끼리), 끄면 멈추는 것, 생필품
  const values = new Map(effective.items.map((entry) => [entry.id, entry.startPrice]));
  const tiers = new Map(effective.items.map((entry) => [entry.id, entry.tier]));
  for (const recipe of ctx.recipes) {
    if (!recipe.enabled || !recipe.outputs.some((stack) => stack.item.id === item.id)) continue;
    const top = Math.max(-1, ...recipe.inputs.map((stack) => tiers.get(stack.item.id) ?? -1));
    if (top >= 0 && top !== item.tier)
      add("tier", "advice_tier_mismatch", { recipe: recipe.id, inputTier: top });
    const cost = recipeCost(recipe, item.id, values);
    if (cost === null || cost <= 0n) continue;
    const value = BigInt(item.startPrice);
    if (value < cost) add("startPrice", "advice_value_below_cost", { recipe: recipe.id, cost: String(cost) });
    else if (value > cost * VALUE_OVER_COST)
      add("startPrice", "advice_value_above_cost", { recipe: recipe.id, cost: String(cost) });
  }
  const needs = ctx.necessities.filter((need) => need.enabled && need.item.id === item.id);
  if (needs.length > 0 && (item.tradable === false || item.bound === true))
    add("tradable", "advice_necessity_untradable", { necessity: needs[0]?.id ?? "" });
  if (!item.enabled) {
    const recipes = ctx.recipes
      .filter(
        (recipe) =>
          recipe.enabled && [...recipe.inputs, ...recipe.outputs].some((s) => s.item.id === item.id),
      )
      .map((recipe) => recipe.id);
    if (recipes.length + needs.length > 0)
      add("enabled", "advice_disable_cascade", {
        recipes: recipes.join(", "),
        necessities: needs.map((need) => need.id).join(", "),
      });
  }
  const sub = item.subcategory
    ? effective.itemSubcategories.find((entry) => entry.id === item.subcategory?.id)
    : undefined;
  if (sub?.food === true && !item.perish && item.category !== "equipment")
    add("perish", "advice_food_no_perish");
  return out;
}
