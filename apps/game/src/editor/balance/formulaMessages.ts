// 계산식 탭 문구 표 — 식 오류 코드·변수·함수·단위 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 밸런스 화면 조각(BalancePanelScreen)에만 든다. docs/adr/2026-11-01-formula-editor.md
import type { FormulaErrorCode, FormulaFunction, FormulaIssue, FormulaUnit } from "@terra/shared/formula";
import { m } from "../../paraglide/messages.js";

const ERROR_TEXT: Readonly<Record<FormulaErrorCode | "unused_local", (name: string) => string>> = {
  empty: () => m.dev_formula_err_empty(),
  too_long: () => m.dev_formula_err_too_long(),
  too_deep: () => m.dev_formula_err_too_deep(),
  too_many_nodes: () => m.dev_formula_err_too_many_nodes(),
  unexpected_char: (name) => m.dev_formula_err_unexpected_char({ name }),
  unexpected_token: (name) => m.dev_formula_err_unexpected_token({ name }),
  unexpected_end: () => m.dev_formula_err_unexpected_end(),
  expected_close_paren: () => m.dev_formula_err_expected_close_paren(),
  too_many_decimals: () => m.dev_formula_err_too_many_decimals(),
  number_too_large: () => m.dev_formula_err_number_too_large(),
  chained_comparison: () => m.dev_formula_err_chained_comparison(),
  unknown_name: (name) => m.dev_formula_err_unknown_name({ name }),
  unknown_function: (name) => m.dev_formula_err_unknown_function({ name }),
  not_a_function: (name) => m.dev_formula_err_not_a_function({ name }),
  function_needs_call: (name) => m.dev_formula_err_function_needs_call({ name }),
  arity: (name) => m.dev_formula_err_arity({ name }),
  local_shadows: (name) => m.dev_formula_err_local_shadows({ name }),
  local_redefined: (name) => m.dev_formula_err_local_redefined({ name }),
  missing_result: () => m.dev_formula_err_missing_result(),
  unused_local: (name) => m.dev_formula_warn_unused_local({ name }),
};

/** 식 오류·경고 한 건의 문장 */
export const issueText = (issue: FormulaIssue): string => ERROR_TEXT[issue.code](issue.name ?? "");

const VAR_TEXT: Readonly<Record<string, () => string>> = {
  STR: m.roster_stat_str,
  DEX: m.roster_stat_dex,
  AGI: m.roster_stat_agi,
  VIT: m.roster_stat_vit,
  INT: m.roster_stat_int,
  WIS: m.roster_stat_wis,
  LV: m.dev_formula_var_lv,
  GEAR: m.dev_formula_var_gear,
  BUFF: m.dev_formula_var_buff,
  W: m.dev_formula_var_w,
  S: m.dev_formula_var_s,
  P: m.dev_formula_var_p,
  A: m.dev_formula_var_a,
  CAP: m.dev_formula_var_cap,
  ROLL: m.dev_formula_var_roll,
  M: m.dev_formula_var_m,
  SPREAD: m.dev_formula_var_spread,
  I: m.dev_formula_var_i,
  B: m.dev_formula_var_b,
  SC: m.dev_formula_var_sc,
  APP: m.dev_formula_var_app,
  MIN: m.dev_formula_var_min,
  W_AGI: m.dev_formula_var_w_agi,
  W_VIT: m.dev_formula_var_w_vit,
  E: m.dev_formula_var_e,
  DA: m.dev_formula_var_da,
  AA: m.dev_formula_var_aa,
  FAVOR_SLOPE: m.dev_formula_var_favor_slope,
  FAVOR_CAP: m.dev_formula_var_favor_cap,
  UNFAVOR_SLOPE: m.dev_formula_var_unfavor_slope,
  UNFAVOR_CAP: m.dev_formula_var_unfavor_cap,
};

/** 변수 뜻(모르는 이름은 이름 그대로) */
export const varText = (name: string): string => VAR_TEXT[name]?.() ?? name;

const FUNCTION_TEXT: Readonly<Record<FormulaFunction, () => string>> = {
  min: m.dev_formula_fn_min,
  max: m.dev_formula_fn_max,
  floor: m.dev_formula_fn_floor,
  ceil: m.dev_formula_fn_ceil,
  round: m.dev_formula_fn_round,
  trunc: m.dev_formula_fn_trunc,
  abs: m.dev_formula_fn_abs,
  clamp: m.dev_formula_fn_clamp,
  if: m.dev_formula_fn_if,
  curve: m.dev_formula_fn_curve,
  lerp: m.dev_formula_fn_lerp,
};

export const functionText = (name: FormulaFunction): string => FUNCTION_TEXT[name]();

const UNIT_TEXT: Readonly<Record<FormulaUnit, () => string>> = {
  points: m.dev_formula_unit_points,
  pm: m.dev_formula_unit_pm,
  x: m.dev_formula_unit_x,
  ms: m.dev_formula_unit_ms,
  roll: m.dev_formula_unit_roll,
  level: m.dev_formula_unit_level,
};

export const unitText = (unit: FormulaUnit): string => UNIT_TEXT[unit]();

const SAMPLE_TEXT: Readonly<Record<string, () => string>> = {
  new_lv1: m.dev_formula_sample_new_lv1,
  even_lv30: m.dev_formula_sample_even_lv30,
};

/** 표본 유닛 이름(모르는 ID는 그대로) */
export const sampleText = (id: string): string => SAMPLE_TEXT[id]?.() ?? id;
