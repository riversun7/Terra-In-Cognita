// 2차 스탯 묶음 — 기획 48 §3.2(생존·공격·정확·속도·자원)와 §3.3(활동 수치) 표 그대로. 화면에서 묶어 보이는 데만 쓴다(규칙 아님).
// 행 ID는 콘텐츠 팩 stat_rows다. 표에 없는 행(팩에 새로 생긴 행)은 "기타"로 모은다. 묶음 안 차례는 서버가 보낸 차례(팩 차례)다.
// 순수 함수(시험: statGroups.test.ts).
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

export const STAT_GROUPS = [
  "survival",
  "offense",
  "accuracy",
  "speed",
  "resource",
  "activity",
  "other",
] as const;
export type StatGroup = (typeof STAT_GROUPS)[number];

/** 48 §3.2 표의 묶음(행 ID → 묶음). 시야는 §3.3 활동 수치 */
const GROUP_OF: Readonly<Record<string, StatGroup>> = {
  hp: "survival",
  armor_hp: "survival",
  shield_hp: "survival",
  defense_rate: "survival",
  physical_attack: "offense",
  elemental_attack: "offense",
  hit: "accuracy",
  evade: "accuracy",
  crit_chance: "accuracy",
  crit_multiplier: "accuracy",
  action_speed: "speed",
  stamina: "resource",
  mp: "resource",
  sight: "activity",
};

export const statGroupOf = (id: string): StatGroup => GROUP_OF[id] ?? "other";

/** 행을 묶음 차례로 나눈다(빈 묶음은 뺀다). 묶음 안 차례는 받은 차례 그대로 */
export function groupStats<T extends { readonly id: string }>(
  rows: readonly T[],
): { group: StatGroup; rows: T[] }[] {
  return STAT_GROUPS.map((group) => ({
    group,
    rows: rows.filter((row) => statGroupOf(row.id) === group),
  })).filter((entry) => entry.rows.length > 0);
}

const GROUP_LABELS = {
  survival: (locale) => m.roster_group_survival({}, { locale }),
  offense: (locale) => m.roster_group_offense({}, { locale }),
  accuracy: (locale) => m.roster_group_accuracy({}, { locale }),
  speed: (locale) => m.roster_group_speed({}, { locale }),
  resource: (locale) => m.roster_group_resource({}, { locale }),
  activity: (locale) => m.roster_group_activity({}, { locale }),
  other: (locale) => m.roster_group_other({}, { locale }),
} satisfies Record<StatGroup, (locale: Locale) => string>;

export const statGroupLabel = (group: StatGroup, locale: Locale = getLocale()): string =>
  GROUP_LABELS[group](locale);
