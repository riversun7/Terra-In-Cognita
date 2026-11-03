// 건물 편집기 문구 표 — 단계·스탯·채집 방식·출처·문제 코드·오류 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 단계는 경제 화면 문구(economy_stage_*), 스탯 코드는 유닛 화면 문구(roster_stat_*_code)를 쓴다. 이 조각에만 든다.
import type {
  BuildingEditorReason,
  FacilityStageId,
  FacilityStatId,
  GatherModeId,
} from "@terra/shared/buildingEditor";
import type { ContentEditOrigin, ContentIssueView } from "@terra/shared/contentEdit";
import { m } from "../../paraglide/messages.js";
import type { ContentErrorInfo } from "../content/contentEditorModel.ts";

type Text = () => string;

export const STAGE_TEXT: Readonly<Record<FacilityStageId, Text>> = {
  gather: m.economy_stage_gather,
  process: m.economy_stage_process,
  part: m.economy_stage_part,
  finish: m.economy_stage_finish,
  territory: m.economy_stage_territory,
};

export const STAT_TEXT: Readonly<Record<FacilityStatId, Text>> = {
  str: m.roster_stat_str_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
};

export const MODE_TEXT: Readonly<Record<GatherModeId, Text>> = {
  roll: m.dev_buildings_mode_roll,
  select: m.dev_buildings_mode_select,
};

export const ORIGIN_TEXT: Readonly<Record<ContentEditOrigin, Text>> = {
  pack: m.dev_buildings_origin_pack,
  edited: m.dev_buildings_origin_edited,
  created: m.dev_buildings_origin_created,
};

const ERROR_TEXT: Readonly<Record<ContentErrorInfo<BuildingEditorReason>["key"], Text>> = {
  invalid_entry: m.dev_buildings_error_invalid_entry,
  unknown_entry: m.dev_buildings_error_unknown_entry,
  duplicate_entry: m.dev_buildings_error_duplicate_entry,
  invalid_note: m.dev_buildings_error_invalid_note,
  entry_changed: m.dev_buildings_error_entry_changed,
  entry_too_large: m.dev_buildings_error_entry_too_large,
  revision_conflict: m.dev_buildings_error_revision_conflict,
  rate_limited: m.dev_buildings_error_rate_limited,
  unauthorized: m.dev_buildings_error_unauthorized,
  forbidden: m.dev_buildings_error_forbidden,
  unavailable: m.dev_buildings_error_unavailable,
  network: m.dev_buildings_error_network,
  unknown: m.dev_buildings_error_unknown,
};

export const errorText = (key: ContentErrorInfo<BuildingEditorReason>["key"]): string => ERROR_TEXT[key]();

const param = (issue: ContentIssueView, key: string): string => {
  const value = issue.params[key];
  return value === undefined ? "" : String(value);
};

/** 검사 문제 한 줄 → 화면 문구(코드로 고른다. 모르는 코드는 칸 경로와 코드만) */
export function issueText(issue: ContentIssueView): string {
  switch (issue.code) {
    case "build_levels_start":
      return m.dev_buildings_issue_levels_start();
    case "build_levels_order":
      return m.dev_buildings_issue_levels_order({ previous: param(issue, "previous") });
    case "build_level_max":
      return m.dev_buildings_issue_level_max({ max: param(issue, "max") });
    case "build_material_duplicate":
      return m.dev_buildings_issue_material_duplicate({ item: param(issue, "item") });
    case "build_material_disabled":
      return m.dev_buildings_issue_material_disabled({ item: param(issue, "item") });
    case "gather_stage":
      return m.dev_buildings_issue_gather_stage();
    case "gather_subcategory_major":
      return m.dev_buildings_issue_gather_major();
    case "gather_yield_cap":
      return m.dev_buildings_issue_yield_cap();
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

/** 문제 줄 머리(시설 ID · 칸 경로) */
export const issueWhere = (issue: ContentIssueView): string =>
  [issue.id, issue.path].filter((part) => part !== null && part !== "").join(" › ");
