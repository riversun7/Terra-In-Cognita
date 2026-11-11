// 시작 국가 설정 편집기 문구 표 — 마크 틀·나눔·상징·이름 말씨·반영 결과·문제 코드·오류 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다,
// 표로 적는다). 오류·출처 문구는 건물 편집기와 같은 메시지(dev_buildings_*)를 쓴다. 이 조각에만 든다.
import type { ContentEditOrigin, ContentIssueView } from "@terra/shared/contentEdit";
import type { NameStyleId } from "@terra/shared/nameGen";
import type { NationApplyAction, NationEditorReason } from "@terra/shared/nationEditor";
import type { EmblemCharge, EmblemDivision, EmblemShape } from "@terra/shared/nationEmblem";
import { m } from "../../paraglide/messages.js";
import type { ContentErrorInfo } from "../content/contentEditorModel.ts";

type Text = () => string;

export const SHAPE_TEXT: Readonly<Record<EmblemShape, Text>> = {
  shield: m.dev_nations_shape_shield,
  circle: m.dev_nations_shape_circle,
  diamond: m.dev_nations_shape_diamond,
  banner: m.dev_nations_shape_banner,
  hexagon: m.dev_nations_shape_hexagon,
  square: m.dev_nations_shape_square,
};

export const DIVISION_TEXT: Readonly<Record<EmblemDivision, Text>> = {
  plain: m.dev_nations_division_plain,
  pale: m.dev_nations_division_pale,
  fess: m.dev_nations_division_fess,
  bend: m.dev_nations_division_bend,
  quarterly: m.dev_nations_division_quarterly,
  chevron: m.dev_nations_division_chevron,
  chief: m.dev_nations_division_chief,
  border: m.dev_nations_division_border,
};

export const CHARGE_TEXT: Readonly<Record<EmblemCharge, Text>> = {
  star: m.dev_nations_charge_star,
  sun: m.dev_nations_charge_sun,
  moon: m.dev_nations_charge_moon,
  tree: m.dev_nations_charge_tree,
  mountain: m.dev_nations_charge_mountain,
  wave: m.dev_nations_charge_wave,
  tower: m.dev_nations_charge_tower,
  gear: m.dev_nations_charge_gear,
  wheat: m.dev_nations_charge_wheat,
  anchor: m.dev_nations_charge_anchor,
  flame: m.dev_nations_charge_flame,
  bird: m.dev_nations_charge_bird,
  sword: m.dev_nations_charge_sword,
  crown: m.dev_nations_charge_crown,
  hammer: m.dev_nations_charge_hammer,
  leaf: m.dev_nations_charge_leaf,
};

/** 이름 말씨(기획 30 §5.3 문화 모티프 16개에 하나씩 [임시]) */
export const STYLE_TEXT: Readonly<Record<NameStyleId, Text>> = {
  prairie: m.dev_nations_style_prairie,
  jade: m.dev_nations_style_jade,
  isle: m.dev_nations_style_isle,
  haneul: m.dev_nations_style_haneul,
  moor: m.dev_nations_style_moor,
  fjord: m.dev_nations_style_fjord,
  vine: m.dev_nations_style_vine,
  monsoon: m.dev_nations_style_monsoon,
  selva: m.dev_nations_style_selva,
  oasis: m.dev_nations_style_oasis,
  olive: m.dev_nations_style_olive,
  spice: m.dev_nations_style_spice,
  sunstone: m.dev_nations_style_sunstone,
  birch: m.dev_nations_style_birch,
  saffron: m.dev_nations_style_saffron,
  reef: m.dev_nations_style_reef,
};

export const APPLY_ACTION_TEXT: Readonly<Record<NationApplyAction, Text>> = {
  update: m.dev_nations_apply_action_update,
  same: m.dev_nations_apply_action_same,
  skip_admin: m.dev_nations_apply_action_skip_admin,
  skip_taken: m.dev_nations_apply_action_skip_taken,
  skip_invalid: m.dev_nations_apply_action_skip_invalid,
};

export const ORIGIN_TEXT: Readonly<Record<ContentEditOrigin, Text>> = {
  pack: m.dev_buildings_origin_pack,
  edited: m.dev_buildings_origin_edited,
  created: m.dev_buildings_origin_created,
};

const ERROR_TEXT: Readonly<Record<ContentErrorInfo<NationEditorReason>["key"], Text>> = {
  invalid_entry: m.dev_buildings_error_invalid_entry,
  unknown_entry: m.dev_buildings_error_unknown_entry,
  duplicate_entry: m.dev_buildings_error_duplicate_entry,
  invalid_note: m.dev_buildings_error_invalid_note,
  entry_changed: m.dev_buildings_error_entry_changed,
  entry_too_large: m.dev_buildings_error_entry_too_large,
  revision_conflict: m.dev_buildings_error_revision_conflict,
  emblem_not_png: m.dev_nations_error_emblem_not_png,
  emblem_wrong_size: m.dev_nations_error_emblem_wrong_size,
  emblem_too_large: m.dev_nations_error_emblem_too_large,
  emblem_unavailable: m.dev_nations_error_world_unavailable,
  world_unavailable: m.dev_nations_error_world_unavailable,
  nation_standing: m.dev_nations_error_nation_standing,
  rate_limited: m.dev_buildings_error_rate_limited,
  unauthorized: m.dev_buildings_error_unauthorized,
  forbidden: m.dev_buildings_error_forbidden,
  unavailable: m.dev_buildings_error_unavailable,
  network: m.dev_buildings_error_network,
  unknown: m.dev_buildings_error_unknown,
};

export const nationErrorText = (key: ContentErrorInfo<NationEditorReason>["key"]): string =>
  ERROR_TEXT[key]();

const param = (issue: ContentIssueView, key: string): string => {
  const value = issue.params[key];
  return value === undefined ? "" : String(value);
};

/** 검사 문제 한 줄 → 화면 문구(코드로 고른다. 모르는 코드는 코드만) */
export function nationIssueText(issue: ContentIssueView): string {
  switch (issue.code) {
    case "nation_short_taken":
      return m.dev_nations_issue_short_taken({ other: param(issue, "other") });
    case "nation_ticker_taken":
      return m.dev_nations_issue_ticker_taken({ other: param(issue, "other") });
    case "nation_job_facility":
      return m.dev_nations_issue_job_facility({ facility: param(issue, "facility") });
    case "faction_short":
      return m.dev_nations_issue_short_format();
    case "faction_color":
      return m.dev_nations_issue_color_format();
    case "currency_symbol":
      return m.dev_nations_issue_symbol_format();
    case "currency_ticker":
      return m.dev_nations_issue_ticker_format();
    case "city_name":
    case "person_name":
      return m.dev_nations_issue_name_format();
    case "city_name_unique":
    case "person_name_unique":
      return m.dev_nations_issue_name_unique();
    case "person_name_given":
      return m.dev_nations_issue_given_empty();
    case "ref_missing":
      return m.dev_buildings_issue_ref_missing({ id: param(issue, "id") });
    case "too_small":
      return m.dev_buildings_issue_too_small({ min: param(issue, "minimum") });
    case "too_big":
      return m.dev_buildings_issue_too_big({ max: param(issue, "maximum") });
    default:
      return m.dev_buildings_issue_other({ code: issue.code ?? "?" });
  }
}

/** 문제 줄 머리(국가 ID · 칸 경로) */
export const nationIssueWhere = (issue: ContentIssueView): string =>
  [issue.id, issue.path].filter((part) => part !== null && part !== "").join(" › ");
