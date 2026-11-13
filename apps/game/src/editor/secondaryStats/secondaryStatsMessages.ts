// 2차 스탯 에디터 문구 표 — 이 조각(SecondaryStatsEditorScreen)에만 둔다(PWA 미리 캐시 경계 유지).
import type { SecondaryStatCategory } from "@terra/shared/secondaryStatsSim";
import type { PrimaryStat } from "@terra/shared/roster";
import type { StatCellField, TuningReason } from "@terra/shared/tuning";
import { m } from "../../paraglide/messages.js";

const PRIMARY_CODES: Readonly<Record<PrimaryStat, () => string>> = {
  str: m.roster_stat_str_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
};

const PRIMARY_NAMES: Readonly<Record<PrimaryStat, () => string>> = {
  str: m.roster_stat_str,
  vit: m.roster_stat_vit,
  int: m.roster_stat_int,
  wis: m.roster_stat_wis,
  dex: m.roster_stat_dex,
  agi: m.roster_stat_agi,
};

export const primaryCode = (stat: PrimaryStat): string => PRIMARY_CODES[stat]();
export const primaryName = (stat: PrimaryStat): string => PRIMARY_NAMES[stat]();

export function cellFieldText(field: StatCellField): string {
  switch (field) {
    case "base":
      return m.dev_balance_col_base();
    case "cap":
      return m.dev_balance_col_cap();
    case "half":
      return m.dev_balance_col_half();
    default:
      return primaryCode(field);
  }
}

const CATEGORY_TEXT: Readonly<Record<SecondaryStatCategory, () => string>> = {
  vitals: m.dev_sec_cat_vitals,
  offense: m.dev_sec_cat_offense,
  defense: m.dev_sec_cat_defense,
  mobility: m.dev_sec_cat_mobility,
  efficiency: m.dev_sec_cat_efficiency,
  combat: m.dev_sec_cat_combat,
};

export const categoryText = (category: SecondaryStatCategory): string => CATEGORY_TEXT[category]();

const ARCHETYPE_TEXT: Readonly<Record<string, () => string>> = {
  physical: m.dev_sec_arch_physical,
  talent: m.dev_sec_arch_talent,
  magic: m.dev_sec_arch_magic,
  balanced: m.dev_sec_arch_balanced,
  custom: m.dev_sec_arch_custom,
};

export function archetypeText(id: string): string {
  const fn = ARCHETYPE_TEXT[id];
  return fn ? fn() : id;
}

const SAVE_ERROR_TEXT: Readonly<
  Record<TuningReason | "forbidden" | "unauthorized" | "unavailable" | "network" | "unknown", () => string>
> = {
  unknown_entry: m.dev_tuning_err_unknown_entry,
  out_of_range: m.dev_tuning_err_out_of_range,
  rules_conflict: m.dev_tuning_err_rules_conflict,
  structural_unconfirmed: m.dev_tuning_err_structural_unconfirmed,
  invalid_note: m.dev_tuning_err_invalid_note,
  duplicate_entry: m.dev_tuning_err_duplicate_entry,
  revision_conflict: m.dev_tuning_err_revision_conflict,
  invalid_formula: m.dev_tuning_err_invalid_formula,
  rate_limited: m.dev_tuning_err_rate_limited,
  forbidden: m.dev_tuning_err_forbidden,
  unauthorized: m.dev_tuning_err_forbidden,
  unavailable: m.dev_tuning_err_unavailable,
  network: m.dev_balance_err_failed,
  unknown: m.dev_balance_err_failed,
};

export function saveErrorText(
  key: TuningReason | "forbidden" | "unauthorized" | "unavailable" | "network" | "unknown",
): string {
  return SAVE_ERROR_TEXT[key]();
}
