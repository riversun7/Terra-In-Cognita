// 아이템 편집기 문구 표 — 대분류·칸·창고·거래 방식·출처·문제 코드·권고·오류·전투 식 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다,
// 표로 적는다). 대분류는 경제 화면 문구(economy_cat_*), 칸은 유닛 화면 문구(roster_slot_*)를 쓴다(설계안 3.11). 이 조각에만 든다.
import type { ContentEditOrigin, ContentIssueView, ContentSleepReason } from "@terra/shared/contentEdit";
import {
  ITEM_PRIMARY_CODES,
  type FoodFamilyId,
  type ItemCategoryId,
  type ItemCodeRef,
  type ItemEditorPreviewResponse,
  type ItemEditorReason,
  type ItemPrimaryCode,
  type MarketKind,
  type StorageKindId,
  type WeaponPartId,
} from "@terra/shared/itemEditor";
import { ELEMENT_CODES, type ElementCode, type EquipSlot } from "@terra/shared/roster";
import { m } from "../../paraglide/messages.js";
import type { ContentErrorInfo } from "../content/contentEditorModel.ts";

type Text = () => string;

export const CATEGORY_TEXT: Readonly<Record<ItemCategoryId, Text>> = {
  raw: m.economy_cat_raw,
  processed: m.economy_cat_processed,
  part: m.economy_cat_part,
  equipment: m.economy_cat_equipment,
  consumable: m.economy_cat_consumable,
  gem: m.economy_cat_gem,
  construction: m.economy_cat_construction,
  document: m.economy_cat_document,
  precious: m.economy_cat_precious,
};

export const SLOT_TEXT: Readonly<Record<EquipSlot, Text>> = {
  weapon: m.roster_slot_weapon,
  offhand: m.roster_slot_offhand,
  head: m.roster_slot_head,
  body: m.roster_slot_body,
  accessory: m.roster_slot_accessory,
  organ: m.roster_slot_organ,
  part: m.roster_slot_part,
  saddle: m.roster_slot_saddle,
  hands: m.roster_slot_hands,
  feet: m.roster_slot_feet,
  totem: m.roster_slot_totem,
  ring: m.roster_slot_ring,
  necklace: m.roster_slot_necklace,
  organ_head: m.roster_slot_organ_head,
  organ_body: m.roster_slot_organ_body,
  organ_heart: m.roster_slot_organ_heart,
  organ_arm: m.roster_slot_organ_arm,
  organ_leg: m.roster_slot_organ_leg,
  implant: m.roster_slot_implant,
};

export const STORAGE_TEXT: Readonly<Record<StorageKindId, Text>> = {
  food: m.dev_items_storage_food,
  armory: m.dev_items_storage_armory,
  general: m.dev_items_storage_general,
  tank: m.dev_items_storage_tank,
};

export const MARKET_TEXT: Readonly<Record<MarketKind, Text>> = {
  book: m.dev_items_market_book,
  auction: m.dev_items_market_auction,
  none: m.dev_items_market_none,
};

export const ORIGIN_TEXT: Readonly<Record<ContentEditOrigin, Text>> = {
  pack: m.dev_items_origin_pack,
  edited: m.dev_items_origin_edited,
  created: m.dev_items_origin_created,
};

export const FAMILY_TEXT: Readonly<Record<FoodFamilyId, Text>> = {
  crop: m.dev_items_family_crop,
  livestock: m.dev_items_family_livestock,
  fishing: m.dev_items_family_fishing,
};

export const PRIMARY_TEXT: Readonly<Record<ItemPrimaryCode, Text>> = {
  str: m.roster_stat_str_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
};

/** 무기 몫 이름(D-502: 물리·속성 공격 몫, 명중, 크리, 공격 간격) */
export const PART_TEXT: Readonly<Record<WeaponPartId, Text>> = {
  physical: m.dev_items_part_physical,
  elemental: m.dev_items_part_elemental,
  hit: m.dev_items_part_hit,
  crit: m.dev_items_part_crit,
  speed: m.dev_items_part_speed,
};

const ELEMENT_TEXT: Readonly<Record<ElementCode, Text>> = {
  water: m.cyborg_element_water,
  frost: m.cyborg_element_frost,
  fire: m.cyborg_element_fire,
  blaze: m.cyborg_element_blaze,
  wind: m.cyborg_element_wind,
  lightning: m.cyborg_element_lightning,
  earth: m.cyborg_element_earth,
  crystal: m.cyborg_element_crystal,
  light: m.cyborg_element_light,
  holy: m.cyborg_element_holy,
  dark: m.cyborg_element_dark,
  necro: m.cyborg_element_necro,
};

export function elementName(code: ElementCode): string {
  return ELEMENT_TEXT[code]();
}

/** 속성 칸 번호(0~11, 전투 공식의 차례) → 이름 */
export function elementAt(index: number): string {
  const code = ELEMENT_CODES[index];
  return code ? ELEMENT_TEXT[code]() : String(index);
}

const FORMULA_TEXT: Readonly<Record<string, Text>> = {
  real_attack: m.dev_items_formula_real_attack,
  real_hit: m.dev_items_formula_real_hit,
  real_crit: m.dev_items_formula_real_crit,
  crit_multiplier: m.dev_items_formula_crit_multiplier,
  attack_interval: m.dev_items_formula_attack_interval,
  stamina_score: m.dev_items_formula_stamina_score,
  stamina_cost: m.dev_items_formula_stamina_cost,
  real_stamina_regen: m.dev_items_formula_real_stamina_regen,
  evade_chance: m.dev_items_formula_evade_chance,
};

export function formulaName(id: string): string {
  return FORMULA_TEXT[id]?.() ?? id;
}

type ErrorKey = ContentErrorInfo<ItemEditorReason>["key"];
const ERROR_TEXT: Readonly<Record<ErrorKey, Text>> = {
  invalid_entry: m.dev_items_err_invalid_entry,
  unknown_entry: m.dev_items_err_unknown_entry,
  retired_id: m.dev_items_err_retired_id,
  duplicate_entry: m.dev_items_err_duplicate_entry,
  invalid_note: m.dev_items_err_invalid_note,
  entry_changed: m.dev_items_err_entry_changed,
  category_locked: m.dev_items_err_category_locked,
  entry_too_large: m.dev_items_err_entry_too_large,
  created_limit: m.dev_items_err_created_limit,
  revision_conflict: m.dev_items_err_revision_conflict,
  rate_limited: m.dev_items_err_rate_limited,
  unauthorized: m.dev_items_err_unauthorized,
  forbidden: m.dev_items_err_forbidden,
  unavailable: m.dev_items_err_unavailable,
  network: m.dev_items_err_network,
  unknown: m.dev_items_err_unknown,
};

export function errorText(key: ErrorKey): string {
  return ERROR_TEXT[key]();
}

type Params = ContentIssueView["params"];
const num = (params: Params, key: string): string => String(params[key] ?? "");

/** 문제 코드 → 문장(값을 넣는다). 모르는 코드는 content_other(한국어 원문은 "자세히") */
const ISSUE_TEXT: Readonly<Record<string, (params: Params) => string>> = {
  too_small: (p) =>
    p.origin === "array"
      ? m.dev_items_issue_too_few({ min: num(p, "minimum") })
      : m.dev_items_issue_too_small({ min: num(p, "minimum") }),
  too_big: (p) =>
    p.origin === "array"
      ? m.dev_items_issue_too_many({ max: num(p, "maximum") })
      : m.dev_items_issue_too_big({ max: num(p, "maximum") }),
  invalid_type: () => m.dev_items_issue_invalid_type(),
  invalid_value: (p) => m.dev_items_issue_invalid_value({ values: num(p, "values") }),
  unrecognized_keys: (p) => m.dev_items_issue_unknown_keys({ keys: num(p, "keys") }),
  invalid_format: () => m.dev_items_issue_invalid_format(),
  text_blank: () => m.dev_items_issue_text_blank(),
  ref_missing: (p) => m.dev_items_issue_ref_missing({ id: num(p, "id") }),
  id_duplicate: () => m.dev_items_issue_id_duplicate(),
  item_equip_required: () => m.dev_items_issue_equip_required(),
  item_equip_category: () => m.dev_items_issue_equip_category(),
  item_perish_category: () => m.dev_items_issue_perish_category(),
  item_use_category: () => m.dev_items_issue_use_category(),
  item_stack_equipment: () => m.dev_items_issue_stack_equipment(),
  item_bound_tradable: () => m.dev_items_issue_bound_tradable(),
  item_tag_duplicate: () => m.dev_items_issue_tag_duplicate(),
  item_subcategory_major: () => m.dev_items_issue_subcategory_major(),
  item_weapon_type_slot: () => m.dev_items_issue_weapon_type_slot(),
  equip_weapon_type_slot: () => m.dev_items_issue_weapon_type_slot(),
  item_ammo_type: () => m.dev_items_issue_ammo_type(),
  item_weapon_type_subcategory: () => m.dev_items_issue_weapon_type_subcategory(),
  weapon_type_subcategory_major: () => m.dev_items_issue_weapon_type_subcategory_major(),
  item_spoils_self: () => m.dev_items_issue_spoils_self(),
  item_spoils_cycle: (p) => m.dev_items_issue_spoils_cycle({ chain: num(p, "chain") }),
  equip_kind_duplicate: () => m.dev_items_issue_duplicate(),
  equip_element_duplicate: () => m.dev_items_issue_duplicate(),
  equip_stat_primary: () => m.dev_items_issue_stat_primary(),
  equip_stat_secondary: () => m.dev_items_issue_stat_secondary(),
  equip_stat_forbidden: () => m.dev_items_issue_stat_forbidden(),
  equip_stat_range: () => m.dev_items_issue_stat_range(),
  equip_weapon_slot: () => m.dev_items_issue_weapon_slot(),
  weapon_field_missing: () => m.dev_items_issue_weapon_field_missing(),
  weapon_basic_required: () => m.dev_items_issue_weapon_basic(),
  weapon_basic_field: () => m.dev_items_issue_weapon_basic(),
  weapon_appropriate_empty: () => m.dev_items_issue_appropriate_empty(),
  subcategory_food_family: () => m.dev_items_issue_food_family(),
  item_bare_hand_raw: () => m.dev_items_issue_bare_hand_raw(),
  subcategory_bare_hand_raw: () => m.dev_items_issue_bare_hand_raw(),
  entry_changed: () => m.dev_items_err_entry_changed(),
  category_locked: () => m.dev_items_err_category_locked(),
  entry_too_large: () => m.dev_items_err_entry_too_large(),
  created_limit: () => m.dev_items_err_created_limit(),
  retired_id: () => m.dev_items_err_retired_id(),
  duplicate_entry: () => m.dev_items_err_duplicate_entry(),
  unknown_entry: () => m.dev_items_err_unknown_entry(),
  advice_no_weight: () => m.dev_items_advice_no_weight(),
  advice_no_subcategory: () => m.dev_items_advice_no_subcategory(),
  advice_no_description: () => m.dev_items_advice_no_description(),
  advice_name_length: (p) =>
    m.dev_items_advice_name_length({ lang: num(p, "lang"), min: num(p, "min"), max: num(p, "max") }),
  advice_disabled_ref: (p) => m.dev_items_advice_disabled_ref({ id: num(p, "id") }),
  advice_no_wearer: () => m.dev_items_advice_no_wearer(),
  advice_skills_over_slots: (p) => m.dev_items_advice_skills_over_slots({ slots: num(p, "slots") }),
  advice_skill_unusable: (p) => m.dev_items_advice_skill_unusable({ skill: num(p, "skill") }),
  advice_appropriate_missing: (p) => m.dev_items_advice_appropriate_missing({ stats: num(p, "stats") }),
  advice_appropriate_unused: (p) => m.dev_items_advice_appropriate_unused({ stats: num(p, "stats") }),
  advice_kind_no_slot: (p) => m.dev_items_advice_kind_no_slot({ kind: num(p, "kind"), slot: num(p, "slot") }),
  advice_creature_unwearable: () => m.dev_items_advice_creature_unwearable(),
  advice_ammo_capacity: () => m.dev_items_advice_ammo_capacity(),
  advice_ammo_type_not_ammo: (p) => m.dev_items_advice_ammo_type_not_ammo({ type: num(p, "type") }),
  effect_stat_required: () => m.dev_items_issue_effect_stat_required(),
  effect_stat_kind: () => m.dev_items_issue_effect_stat_kind(),
  effect_status_kind: () => m.dev_items_issue_effect_status_kind(),
  effect_resist_kind: () => m.dev_items_issue_effect_resist_kind(),
  weapon_type_ammo_slot: () => m.dev_items_issue_weapon_type_ammo_slot(),
  advice_durability_low: (p) => m.dev_items_advice_durability_low({ value: num(p, "destroyAt") }),
  advice_resist_immune: (p) =>
    m.dev_items_advice_resist_immune({ element: elementAt(Number(p.element ?? -1)) }),
  advice_stat_overflow: () => m.dev_items_advice_stat_overflow(),
  advice_tier_mismatch: (p) =>
    m.dev_items_advice_tier_mismatch({ recipe: num(p, "recipe"), tier: num(p, "inputTier") }),
  advice_value_below_cost: (p) =>
    m.dev_items_advice_value_below_cost({ recipe: num(p, "recipe"), cost: num(p, "cost") }),
  advice_value_above_cost: (p) =>
    m.dev_items_advice_value_above_cost({ recipe: num(p, "recipe"), cost: num(p, "cost") }),
  advice_necessity_untradable: () => m.dev_items_advice_necessity_untradable(),
  advice_disable_cascade: (p) =>
    m.dev_items_advice_disable_cascade({
      recipes: num(p, "recipes") || "-",
      necessities: num(p, "necessities") || "-",
    }),
  advice_food_no_perish: () => m.dev_items_advice_food_no_perish(),
};

/** 문제 한 줄 → 화면 문장 */
export function issueText(issue: ContentIssueView): string {
  const text = issue.code === null ? undefined : ISSUE_TEXT[issue.code];
  return text ? text(issue.params) : m.dev_items_issue_other();
}

const CODE_REF_TEXT: Readonly<Record<ItemCodeRef["use"], Text>> = {
  sim_combat: m.dev_items_code_sim_combat,
  sim_wave: m.dev_items_code_sim_wave,
  replay_demo: m.dev_items_code_replay_demo,
  battle_lab: m.dev_items_code_battle_lab,
  roster_preview: m.dev_items_code_roster_preview,
  economy_preview: m.dev_items_code_economy_preview,
};

export function codeRefText(use: ItemCodeRef["use"]): string {
  return CODE_REF_TEXT[use]();
}

const SLEEP_TEXT: Readonly<Record<ContentSleepReason, Text>> = {
  newer_pack: m.dev_items_sleep_newer_pack,
  id_collision: m.dev_items_sleep_id_collision,
  unknown_category: m.dev_items_sleep_unknown_category,
};

export function sleepText(reason: ContentSleepReason): string {
  return SLEEP_TEXT[reason]();
}

/** 1000배 정수 → 소수 글자(끝 0은 뺀다) */
export function milliText(value: number): string {
  return (value / 1000).toFixed(3).replace(/\.?0+$/, "");
}

type EffectLine = NonNullable<ItemEditorPreviewResponse["use"]>["lines"][number];

const STACKING_TEXT: Readonly<Record<NonNullable<EffectLine["stacking"]>, Text>> = {
  refresh: m.dev_items_stacking_refresh,
  stack: m.dev_items_stacking_stack,
  ignore: m.dev_items_stacking_ignore,
};

const KIND_TEXT: Readonly<Record<NonNullable<EffectLine["kind"]>, Text>> = {
  buff: m.dev_content_effect_kind_buff,
  debuff: m.dev_content_effect_kind_debuff,
  dot: m.dev_content_effect_kind_dot,
  heal: m.dev_content_effect_kind_heal,
  status: m.dev_content_effect_kind_status,
};

const statName = (stat: string, names: ReadonlyMap<string, string>): string => {
  const code = ITEM_PRIMARY_CODES.find((item) => item === stat);
  return code ? PRIMARY_TEXT[code]() : (names.get(stat) ?? stat);
};

/**
 * 효과 줄 → 문장(설계안 3.7 "공격력 +12%, 30초, 다시 걸면 새로 시작"): 이름 — 종류 대상 값, 지속, 중첩(, 확률). ‰ 값은 %로(한 자리),
 * 지속 0은 전투 내내. 사용자 수치(VIT→HP 등)에 따른 크기 바뀜(D-496 286)은 WP-6에서 붙인다
 */
export function effectSentence(
  line: EffectLine,
  name: string,
  statNames: ReadonlyMap<string, string>,
): string {
  const sign = line.value > 0 ? "+" : "";
  const value =
    line.valueMode === "permille"
      ? `${sign}${(line.value / 10).toFixed(line.value % 10 === 0 ? 0 : 1)}%`
      : `${sign}${line.value}`;
  const parts = [
    [line.kind ? KIND_TEXT[line.kind]() : null, line.stat ? statName(line.stat, statNames) : null, value]
      .filter((part) => part !== null)
      .join(" "),
    line.durationMs === null
      ? null
      : line.durationMs === 0
        ? m.dev_items_duration_battle()
        : m.dev_items_duration_seconds({ seconds: milliText(line.durationMs) }),
    line.stacking ? STACKING_TEXT[line.stacking]() : null,
    line.chancePm === 1000 ? null : m.dev_items_chance({ pm: line.chancePm }),
  ].filter((part) => part !== null);
  return `${name} — ${parts.join(", ")}`;
}
