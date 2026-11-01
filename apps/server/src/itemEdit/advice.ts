// 아이템 권고 — 저장을 막지 않는 문제(설계안 2.7 "권고"). 서버가 그 세계의 실효 항목으로 셈해 목록에는 개수로, 편집 칸에는 줄로 보인다.
// 코드(advice_*)와 값(params)을 단다: 화면은 메시지 키로 보인다. 규칙이 아니라 알림이다(문턱 값은 기술 상수 [A]).
import type { EffectEntry, ItemEntry, NecessityEntry, RecipeEntry, StatRowEntry } from "@terra/content";
import type { ContentIssueView } from "@terra/shared/contentEdit";
import { ITEM_PRIMARY_SLOTS } from "@terra/shared/itemEditor";
import { MAX_STAT_INPUT } from "@terra/sim";
import type { ContentEffective } from "../contentEdit/state.ts";

/** 기준 가치가 레시피 원가의 몇 배를 넘으면 알리나(기술 상수) */
const VALUE_OVER_COST = 10n;
/** 1차 스탯 합이 상한의 몇 ‰를 넘으면 알리나 */
const OVERFLOW_WARN_PM = 900;
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

/** 레시피 하나로 이 아이템 하나를 만드는 원가(입력 기준 가치 합 ÷ 이 아이템 출력 수량, 내림). 입력 값을 모르면 null */
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
  const skillsOn = enabledIds(effective.skills);
  const effectsOn = enabledIds(ctx.effects);
  const rowsOn = enabledIds(ctx.statRows);
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

  const equip = item.equip;
  if (equip) {
    const typesOn = enabledIds(effective.weaponTypes);
    if (equip.weaponType) disabledRef("equip.weaponType", "weapon_types", equip.weaponType.id, typesOn);
    if (equip.weapon?.ammo) disabledRef("equip.weapon.ammo", "weapon_types", equip.weapon.ammo.id, typesOn);
    equip.stats.forEach((range, index) => {
      if (typeof range.stat !== "string")
        disabledRef(`equip.stats[${index}].stat`, "stat_rows", range.stat.id, rowsOn);
    });
    (equip.skills ?? []).forEach((skill, index) => {
      disabledRef(`equip.skills[${index}]`, "skills", skill.id, skillsOn);
    });
    // 입을 수 있는 켜진 유닛 종류(그 칸이 있고, kinds가 있으면 그 안)
    const allowed = equip.kinds ? new Set(equip.kinds.map((kind) => kind.id)) : null;
    const wearers = effective.unitKinds.filter(
      (kind) => kind.enabled && kind.slots.includes(equip.slot) && (!allowed || allowed.has(kind.id)),
    );
    if (wearers.length === 0) add("equip.slot", "advice_no_wearer", { slot: equip.slot });
    const slotCount = wearers.length > 0 ? Math.min(...wearers.map((kind) => kind.skillSlots.base)) : 0;
    const granted = equip.skills ?? [];
    if (wearers.length > 0 && granted.length > slotCount)
      add("equip.skills", "advice_skills_over_slots", { count: granted.length, slots: slotCount });
    // 이 무기의 칸으로 쓸 수 없는 장비 스킬(D-490)
    const weapon = equip.weapon;
    if (weapon) {
      const fields = new Set([
        ...(weapon.physical ? ["physical"] : []),
        ...(weapon.elemental ? ["elemental"] : []),
      ]);
      granted.forEach((ref, index) => {
        const skill = effective.skills.find((entry) => entry.id === ref.id);
        if (!skill || skill.bareHand === true) return;
        const need = skill.weaponField ?? skill.base;
        const usable = need === "any" ? fields.size > 0 : fields.has(need);
        if (!usable) add(`equip.skills[${index}]`, "advice_skill_unusable", { skill: skill.id, field: need });
      });
      // 적정치 0: 실효 식 if(A <= 0, W, …)라 유닛 스탯과 상관없이 무기 값 그대로
      const zero = (path: string, value: number | undefined) => {
        if (value === 0) add(`equip.weapon.${path}`, "advice_appropriate_zero", { field: path });
      };
      zero("physical.attackAppropriate", weapon.physical?.attackAppropriate);
      zero("elemental.attackAppropriate", weapon.elemental?.attackAppropriate);
      zero("hitAppropriate", weapon.hitAppropriate);
      zero("critAppropriate", weapon.critAppropriate);
      if (weapon.appropriate) add("equip.weapon.appropriate", "advice_appropriate_pending");
    }
    if (equip.maxDurability !== undefined && ctx.destroyAt !== null && equip.maxDurability <= ctx.destroyAt)
      add("equip.maxDurability", "advice_durability_low", { destroyAt: ctx.destroyAt });
    (equip.combat?.resistPm ?? []).forEach((pm, index) => {
      if (pm >= 1000) add(`equip.combat.resistPm[${index}]`, "advice_resist_immune", { element: index });
    });
    if (ITEM_PRIMARY_SLOTS.includes(equip.slot)) {
      const sum = equip.stats.reduce((total, range) => total + Math.max(0, range.max), 0);
      if (sum * 1000 > MAX_STAT_INPUT * OVERFLOW_WARN_PM) add("equip.stats", "advice_stat_overflow", { sum });
    }
  }

  // 경제: 레시피 티어·원가, 끄면 멈추는 것, 생필품
  const values = new Map(effective.items.map((entry) => [entry.id, entry.baseValue]));
  const tiers = new Map(effective.items.map((entry) => [entry.id, entry.tier]));
  for (const recipe of ctx.recipes) {
    if (!recipe.enabled || !recipe.outputs.some((stack) => stack.item.id === item.id)) continue;
    const top = Math.max(-1, ...recipe.inputs.map((stack) => tiers.get(stack.item.id) ?? -1));
    if (top >= 0 && top !== item.tier)
      add("tier", "advice_tier_mismatch", { recipe: recipe.id, inputTier: top });
    const cost = recipeCost(recipe, item.id, values);
    if (cost === null || cost <= 0n) continue;
    const value = BigInt(item.baseValue);
    if (value < cost) add("baseValue", "advice_value_below_cost", { recipe: recipe.id, cost: String(cost) });
    else if (value > cost * VALUE_OVER_COST)
      add("baseValue", "advice_value_above_cost", { recipe: recipe.id, cost: String(cost) });
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
