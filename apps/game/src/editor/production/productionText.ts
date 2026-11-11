// 생산 편집기 문구 표(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다) — 스탯 약자·이름, 묶음, 방식, 검사 문제 코드
import type { ContentIssueView } from "@terra/shared/contentEdit";
import type { PrimaryStat } from "@terra/shared/roster";
import type { CombatClassGroup, ProductionGroup } from "@terra/shared/unitGuide";
import { m } from "../../paraglide/messages.js";

type Text = () => string;

export const STAT_CODE: Readonly<Record<PrimaryStat, Text>> = {
  str: m.roster_stat_str_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
};

export const STAT_NAME: Readonly<Record<PrimaryStat, Text>> = {
  str: m.roster_stat_str,
  vit: m.roster_stat_vit,
  int: m.roster_stat_int,
  wis: m.roster_stat_wis,
  dex: m.roster_stat_dex,
  agi: m.roster_stat_agi,
};

/** 스탯 고르기 줄 글: "STR 힘" */
export const statOption = (stat: PrimaryStat): string => `${STAT_CODE[stat]()} ${STAT_NAME[stat]()}`;

export const GROUP_TEXT: Readonly<Record<ProductionGroup, Text>> = {
  field: m.dev_prod_group_field,
  building: m.dev_prod_group_building,
};

export const MODE_TEXT: Readonly<Record<"roll" | "select", Text>> = {
  roll: m.dev_buildings_mode_roll,
  select: m.dev_buildings_mode_select,
};

export const CLASS_GROUP_TEXT: Readonly<Record<CombatClassGroup, Text>> = {
  physical: m.dev_prod_class_group_physical,
  magic: m.dev_prod_class_group_magic,
  hybrid: m.dev_prod_class_group_hybrid,
};

/** 검사 문제 한 줄(코드가 있으면 메시지 키로, 없으면 서버 글 그대로) */
export function issueText(issue: ContentIssueView): string {
  const where = issue.id === null ? "" : `${issue.id}: `;
  switch (issue.code) {
    case "gather_yield_cap":
      return where + m.dev_buildings_issue_yield_cap();
    case "gather_catch_range":
      return where + m.dev_prod_issue_catch_range();
    case "class_stats_duplicate":
      return where + m.dev_prod_issue_class_duplicate();
    case "class_stats_shape":
      return where + m.dev_prod_issue_class_shape();
    case "gather_weights_sum":
      return where + m.dev_prod_issue_weights_sum();
    default:
      return where + issue.message;
  }
}

/** 소수 한 자리(시간당 기대 산출 등 표시용) */
export function decimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value);
}

/** ‰ → % 글(350 → "35%", 5 → "0.5%") */
export function percentOfPm(pm: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pm / 10)}%`;
}
