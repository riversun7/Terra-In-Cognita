// 스킬 편집기 문구 표 — 모양·발동·자원·대상·피해·부품·조건·효과 종류·오류·행동 → 메시지
// (oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다). 이 조각(SkillEditorScreen)에만 든다.
import { ELEMENT_CODES, type ElementCode } from "@terra/shared/roster";
import type {
  ActionCostRow,
  SkillConditionPartKind,
  SkillFormulaPartKind,
  SkillJson,
  SkillShapeId,
} from "@terra/shared/skillEditor";
import { m } from "../../paraglide/messages.js";
import type { SkillErrorKey, SkillFilter } from "./skillModel.ts";

type Text = () => string;

export const SHAPE_TEXT: Readonly<Record<SkillShapeId, Text>> = {
  single: m.dev_skills_shape_single,
  projectile: m.dev_skills_shape_projectile,
  area: m.dev_skills_shape_area,
  chain: m.dev_skills_shape_chain,
  heal: m.dev_skills_shape_heal,
  buff: m.dev_skills_shape_buff,
  debuff: m.dev_skills_shape_debuff,
};

export const TRIGGER_TEXT: Readonly<Record<SkillJson["trigger"], Text>> = {
  active: m.dev_skills_trigger_active,
  passive: m.dev_skills_trigger_passive,
};

export const RESOURCE_TEXT: Readonly<Record<SkillJson["resource"], Text>> = {
  stamina: m.dev_skills_resource_stamina,
  mp: m.dev_skills_resource_mp,
};

export const TARGET_TEXT: Readonly<Record<SkillJson["target"], Text>> = {
  enemy: m.dev_skills_target_enemy,
  self: m.dev_skills_target_self,
  ally: m.dev_skills_target_ally,
};

export const DAMAGE_TEXT: Readonly<Record<SkillJson["damage"], Text>> = {
  physical: m.dev_skills_damage_physical,
  elemental: m.dev_skills_damage_elemental,
  none: m.dev_skills_damage_none,
};

export const PART_TEXT: Readonly<Record<SkillFormulaPartKind, Text>> = {
  attack_mul: m.dev_skills_part_attack_mul,
  weapon_add: m.dev_skills_part_weapon_add,
  element: m.dev_skills_part_element,
  penetration: m.dev_skills_part_penetration,
  flat: m.dev_skills_part_flat,
  heal: m.dev_skills_part_heal,
  shield: m.dev_skills_part_shield,
};

export const CONDITION_TEXT: Readonly<Record<SkillConditionPartKind, Text>> = {
  appropriate_met: m.dev_skills_cond_appropriate_met,
  self_hp_below: m.dev_skills_cond_self_hp_below,
  target_hp_below: m.dev_skills_cond_target_hp_below,
  target_has: m.dev_skills_cond_target_has,
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

/** 속성 칸 번호(0~11, 전투 공식의 차례) → 이름 */
export function elementText(index: number): string {
  const code = ELEMENT_CODES[index];
  return code ? ELEMENT_TEXT[code]() : String(index);
}

export const FILTER_TEXT: Readonly<Record<SkillFilter, Text>> = {
  all: m.dev_skills_filter_all,
  edited: m.dev_skills_filter_edited,
  created: m.dev_skills_filter_created,
  disabled: m.dev_skills_filter_disabled,
};

const ERROR_TEXT: Readonly<Record<SkillErrorKey, Text>> = {
  invalid_entry: m.dev_skills_err_invalid_entry,
  unknown_entry: m.dev_skills_err_unknown_entry,
  retired_id: m.dev_skills_err_retired_id,
  duplicate_entry: m.dev_skills_err_duplicate_entry,
  invalid_note: m.dev_skills_err_invalid_note,
  entry_changed: m.dev_skills_err_entry_changed,
  revision_conflict: m.dev_skills_err_revision_conflict,
  rate_limited: m.dev_skills_err_rate_limited,
  unauthorized: m.dev_skills_err_unauthorized,
  forbidden: m.dev_skills_err_forbidden,
  unavailable: m.dev_skills_err_unavailable,
  network: m.dev_skills_err_network,
  unknown: m.dev_skills_err_unknown,
};

export function errorText(key: SkillErrorKey): string {
  return ERROR_TEXT[key]();
}

const ACTION_TEXT: Readonly<Record<Extract<ActionCostRow, { kind: "fixed" }>["key"], Text>> = {
  walk: m.dev_skills_action_walk,
  retreat: m.dev_skills_action_retreat,
  building_attack: m.dev_skills_action_building_attack,
  evasive_move: m.dev_skills_action_evasive_move,
};

const STATUS_TEXT: Readonly<Record<Extract<ActionCostRow, { kind: "fixed" }>["status"], Text>> = {
  free: m.dev_skills_status_free,
  same_as_basic: m.dev_skills_status_same_as_basic,
  unimplemented: m.dev_skills_status_unimplemented,
};

export function actionText(key: Extract<ActionCostRow, { kind: "fixed" }>["key"]): string {
  return ACTION_TEXT[key]();
}

export function statusText(status: Extract<ActionCostRow, { kind: "fixed" }>["status"]): string {
  return STATUS_TEXT[status]();
}

export const KIND_TEXT: Readonly<Record<ActionCostRow["kind"], Text>> = {
  weapon: m.dev_skills_kind_weapon,
  natural: m.dev_skills_kind_natural,
  skill: m.dev_skills_kind_skill,
  fixed: m.dev_skills_kind_fixed,
};

export const ORIGIN_TEXT = {
  pack: m.dev_skills_origin_pack,
  edited: m.dev_skills_origin_edited,
  created: m.dev_skills_origin_created,
} as const;
