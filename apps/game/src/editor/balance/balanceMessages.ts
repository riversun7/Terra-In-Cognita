// 밸런스 화면 문구 표 — 1차 이름·칸 이름·오류·규칙 문제 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 이 조각(BalancePanelScreen)에만 든다. 설정 칸 패널(editor/tuning)의 표는 가져오지 않는다(두 개발자 조각이 같이 쓰는 모듈은
// 따로 한 조각이 되어 미리 캐시 규칙에 걸리지 않을 수 있다, scripts/pwa-build.mjs DEV_ONLY_SOURCE).
import type { BalancePresetSource } from "@terra/shared/balance";
import type { PrimaryStat } from "@terra/shared/roster";
import type { StatCellField, TuningProblem } from "@terra/shared/tuning";
import { m } from "../../paraglide/messages.js";
import type { BalanceErrorKey } from "./balanceModel.ts";

const CODE_TEXT: Readonly<Record<PrimaryStat, () => string>> = {
  str: m.roster_stat_str_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
};

const NAME_TEXT: Readonly<Record<PrimaryStat, () => string>> = {
  str: m.roster_stat_str,
  vit: m.roster_stat_vit,
  int: m.roster_stat_int,
  wis: m.roster_stat_wis,
  dex: m.roster_stat_dex,
  agi: m.roster_stat_agi,
};

/** 1차 코드(STR 등, 영어 표기 그대로) */
export const primaryCode = (stat: PrimaryStat): string => CODE_TEXT[stat]();
/** 1차 이름(지금 언어) */
export const primaryName = (stat: PrimaryStat): string => NAME_TEXT[stat]();

/** 칸 이름(가중치 칸은 1차 코드, 나머지는 기본·상한·반감) */
export function fieldText(cellField: StatCellField): string {
  switch (cellField) {
    case "base":
      return m.dev_balance_col_base();
    case "cap":
      return m.dev_balance_col_cap();
    case "half":
      return m.dev_balance_col_half();
    default:
      return primaryCode(cellField);
  }
}

const ERROR_TEXT: Readonly<Record<BalanceErrorKey, () => string>> = {
  invalid_settings: m.dev_balance_err_invalid_settings,
  unknown_weapon: m.dev_balance_err_unknown_weapon,
  busy: m.dev_balance_err_busy,
  rate_limited: m.dev_balance_err_rate_limited,
  timeout: m.dev_balance_err_timeout,
  failed: m.dev_balance_err_failed,
  invalid_preset: m.dev_balance_err_invalid_preset,
  unknown_preset: m.dev_balance_err_unknown_preset,
  preset_conflict: m.dev_balance_err_preset_conflict,
  too_many_presets: m.dev_balance_err_too_many_presets,
  unknown_entry: m.dev_balance_err_unknown_entry,
  out_of_range: m.dev_balance_err_out_of_range,
  rules_conflict: m.dev_balance_err_rules_conflict,
  structural_unconfirmed: m.dev_balance_err_rules_conflict,
  invalid_note: m.dev_balance_err_invalid_note,
  duplicate_entry: m.dev_balance_err_duplicate_entry,
  revision_conflict: m.dev_balance_err_revision_conflict,
  forbidden: m.dev_balance_err_forbidden,
  unauthorized: m.auth_notice_session_ended,
  unavailable: m.dev_balance_err_unavailable,
  network: m.err_network,
  unknown: m.err_unknown,
};

export const errorText = (key: BalanceErrorKey): string => ERROR_TEXT[key]();

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
  stat_primary_unused: m.dev_tuning_problem_stat_primary_unused,
};

export const problemText = (problem: TuningProblem): string => PROBLEM_TEXT[problem]();

/** 1차 목록 → "STR · WIS" */
export const primaryList = (stats: readonly PrimaryStat[]): string => stats.map(primaryCode).join(" · ");

const SOURCE_TEXT: Readonly<Record<BalancePresetSource, () => string>> = {
  pack: m.dev_balance_preset_source_pack,
  edited: m.dev_balance_preset_source_edited,
  custom: m.dev_balance_preset_source_custom,
};

/** 프리셋 출처(팩·팩에서 고침·팀이 만듦) */
export const presetSourceText = (source: BalancePresetSource): string => SOURCE_TEXT[source]();
