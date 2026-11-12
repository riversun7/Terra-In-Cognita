// 설정 칸 패널 문구 표 — 무리·범위 칩·단위·오류·규칙 문제·최근 바꿈·49 칸 상태 → 메시지
// (oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다). 이 조각(TuningPanelScreen)에만 든다.
import type {
  KnownTuningFamily,
  TuningDropReason,
  TuningHistoryAction,
  TuningProblem,
  TuningScope,
  TuningUnit,
} from "@terra/shared/tuning";
import { m } from "../../paraglide/messages.js";
import {
  type CellStatus,
  NO_UNIT,
  type ScopeFilter,
  type TuningErrorKey,
  type TuningPageTab,
} from "./tuningModel.ts";

const FAMILY_TEXT: Readonly<Record<KnownTuningFamily, () => string>> = {
  T: m.dev_tuning_family_T,
  M: m.dev_tuning_family_M,
  P: m.dev_tuning_family_P,
  E: m.dev_tuning_family_E,
  C: m.dev_tuning_family_C,
  F: m.dev_tuning_family_F,
  N: m.dev_tuning_family_N,
  S: m.dev_tuning_family_S,
  U: m.dev_tuning_family_U,
  B: m.dev_tuning_family_B,
};

const isKnownFamily = (family: string): family is KnownTuningFamily => Object.hasOwn(FAMILY_TEXT, family);

/** 무리 이름("" = 코드 없음, 모르는 글자 = "X 그 밖의 코드") */
export function familyText(family: string): string {
  if (family === "") return m.dev_tuning_family_none();
  return isKnownFamily(family) ? FAMILY_TEXT[family]() : m.dev_tuning_family_other({ letter: family });
}

/** 분야 페이지 탭 이름·한 줄 풀이(2026-11-08 분야별 페이지) */
export const PAGE_TEXT: Readonly<Record<TuningPageTab, { label: () => string; lead: () => string }>> = {
  all: { label: m.dev_tuning_page_all, lead: m.dev_tuning_page_all_lead },
  society: { label: m.dev_tuning_page_society, lead: m.dev_tuning_page_society_lead },
  npc: { label: m.dev_tuning_page_npc, lead: m.dev_tuning_page_npc_lead },
  gardener: { label: m.dev_tuning_page_gardener, lead: m.dev_tuning_page_gardener_lead },
  holdings: { label: m.dev_tuning_page_holdings, lead: m.dev_tuning_page_holdings_lead },
  combat: { label: m.dev_tuning_page_combat, lead: m.dev_tuning_page_combat_lead },
  economy: { label: m.dev_tuning_page_economy, lead: m.dev_tuning_page_economy_lead },
  other: { label: m.dev_tuning_page_other, lead: m.dev_tuning_page_other_lead },
};

/** 반영 범위 거르기 단추 이름 */
export const SCOPE_FILTER_TEXT: Readonly<Record<ScopeFilter, () => string>> = {
  all: m.dev_tuning_scope_all,
  live: m.dev_tuning_scope_live,
  sim: m.dev_tuning_scope_sim,
  none: m.dev_tuning_scope_none,
};

export const SCOPE_TEXT: Readonly<Record<TuningScope, { label: () => string; hint: () => string }>> = {
  live: { label: m.dev_tuning_scope_live, hint: m.dev_tuning_scope_live_hint },
  sim: { label: m.dev_tuning_scope_sim, hint: m.dev_tuning_scope_sim_hint },
  none: { label: m.dev_tuning_scope_none, hint: m.dev_tuning_scope_none_hint },
};

const UNIT_TEXT: Readonly<Record<TuningUnit, () => string>> = {
  ms: m.dev_tuning_unit_ms,
  pm: m.dev_tuning_unit_pm,
  bp: m.dev_tuning_unit_bp,
  pct: m.dev_tuning_unit_pct,
  cells: m.dev_tuning_unit_cells,
  count: m.dev_tuning_unit_count,
  minor: m.dev_tuning_unit_minor,
  milli: m.dev_tuning_unit_milli,
  points: m.dev_tuning_unit_points,
  level: m.dev_tuning_unit_level,
  grams: m.dev_tuning_unit_grams,
};

export function unitText(unit: TuningUnit | null): string {
  return unit === null ? m.dev_tuning_unit_none() : UNIT_TEXT[unit]();
}

const isUnit = (key: string): key is TuningUnit => Object.hasOwn(UNIT_TEXT, key);

/** 단위 고르기 값(TuningUnit 또는 NO_UNIT) → 이름 */
export function unitKeyText(key: string): string {
  if (key === NO_UNIT) return m.dev_tuning_unit_none();
  return isUnit(key) ? UNIT_TEXT[key]() : key;
}

const ERROR_TEXT: Readonly<Record<TuningErrorKey, () => string>> = {
  unknown_entry: m.dev_tuning_err_unknown_entry,
  out_of_range: m.dev_tuning_err_out_of_range,
  rules_conflict: m.dev_tuning_err_rules_conflict,
  structural_unconfirmed: m.dev_tuning_err_structural_unconfirmed,
  invalid_note: m.dev_tuning_err_invalid_note,
  duplicate_entry: m.dev_tuning_err_duplicate_entry,
  revision_conflict: m.dev_tuning_err_revision_conflict,
  rate_limited: m.dev_tuning_err_rate_limited,
  invalid_formula: m.dev_tuning_err_invalid_formula,
  forbidden: m.dev_tuning_err_forbidden,
  unauthorized: m.auth_notice_session_ended,
  unavailable: m.dev_tuning_err_unavailable,
  network: m.err_network,
  unknown: m.err_unknown,
};

export const errorText = (key: TuningErrorKey): string => ERROR_TEXT[key]();

const PROBLEM_TEXT: Readonly<Record<TuningProblem, () => string>> = {
  n9_fit: m.dev_tuning_problem_n9_fit,
  n6_order: m.dev_tuning_problem_n6_order,
  n36_fit: m.dev_tuning_problem_n36_fit,
  n39_order: m.dev_tuning_problem_n39_order,
  crowd_order: m.dev_tuning_problem_crowd_order,
  unrest_order: m.dev_tuning_problem_unrest_order,
  lifespan_order: m.dev_tuning_problem_lifespan_order,
  fatigue_order: m.dev_tuning_problem_fatigue_order,
  wage_order: m.dev_tuning_problem_wage_order,
  employer_order: m.dev_tuning_problem_employer_order,
  food_order: m.dev_tuning_problem_food_order,
  n45_fit: m.dev_tuning_problem_n45_fit,
  stat_sum_cap: m.dev_tuning_problem_stat_sum_cap,
  stat_primary_unused: m.dev_tuning_problem_stat_primary_unused,
};

export const problemText = (problem: TuningProblem): string => PROBLEM_TEXT[problem]();

export const DROP_TEXT: Readonly<Record<TuningDropReason, () => string>> = {
  unknown_entry: m.dev_tuning_drop_unknown_entry,
  unit_changed: m.dev_tuning_drop_unit_changed,
  out_of_range: m.dev_tuning_drop_out_of_range,
  rules_conflict: m.dev_tuning_drop_rules_conflict,
  invalid_formula: m.dev_tuning_drop_invalid_formula,
};

const HISTORY_TEXT: Readonly<Record<TuningHistoryAction, (revision: number | null) => string>> = {
  apply: (revision) => m.dev_tuning_history_apply({ revision: revision ?? "?" }),
  revert_all: () => m.dev_tuning_history_revert_all(),
  pack_won: () => m.dev_tuning_history_pack_won(),
  dropped: () => m.dev_tuning_history_dropped(),
};

/** 최근 바꿈 동작 이름(적용은 판 번호를 붙인다) */
export const historyActionText = (action: TuningHistoryAction, revision: number | null): string =>
  HISTORY_TEXT[action](revision);

export const CELL_STATUS_TEXT: Readonly<Record<CellStatus, () => string>> = {
  connected: m.dev_tuning_cell_connected,
  no_value: m.dev_tuning_cell_no_value,
  not_connected: m.dev_tuning_cell_not_connected,
};
