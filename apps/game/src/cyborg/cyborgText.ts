// 사이보그 화면 문구·다듬기 — 순수 함수(시험: cyborgText.test.ts). 키로 고르는 문구는 정적 표(m[키]는 oxlint가 막는다).
// - 속성 이름(D-182·D-5011, 50 §2.1 코드), 계열 묶음(기본·강화 두 칸씩).
// - 상세 전투 스펙 묶음(옛 프로젝트 다섯 칸)과 막대 채움: 서버가 보낸 값을 비율로 바꿀 뿐 다시 계산하지 않는다.
import {
  ELEMENT_CODES,
  type ElementCode,
  type RosterPrimarySource,
  type RosterStatBreakdown,
} from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

const ELEMENT_LABELS = {
  water: (locale) => m.cyborg_element_water({}, { locale }),
  frost: (locale) => m.cyborg_element_frost({}, { locale }),
  fire: (locale) => m.cyborg_element_fire({}, { locale }),
  blaze: (locale) => m.cyborg_element_blaze({}, { locale }),
  wind: (locale) => m.cyborg_element_wind({}, { locale }),
  lightning: (locale) => m.cyborg_element_lightning({}, { locale }),
  earth: (locale) => m.cyborg_element_earth({}, { locale }),
  crystal: (locale) => m.cyborg_element_crystal({}, { locale }),
  light: (locale) => m.cyborg_element_light({}, { locale }),
  holy: (locale) => m.cyborg_element_holy({}, { locale }),
  dark: (locale) => m.cyborg_element_dark({}, { locale }),
  necro: (locale) => m.cyborg_element_necro({}, { locale }),
} satisfies Record<ElementCode, (locale: Locale) => string>;

export const elementLabel = (code: ElementCode, locale: Locale = getLocale()): string =>
  ELEMENT_LABELS[code](locale);

/** 속성 12칸 → 계열 6줄(기본·강화). 값이 모자라면(옛 서버) 0 */
export function elementFamilies(
  values: readonly number[],
): { basic: { code: ElementCode; value: number }; enhanced: { code: ElementCode; value: number } }[] {
  const at = (index: number) => {
    const code = ELEMENT_CODES[index] ?? "water";
    return { code, value: Math.max(0, values[index] ?? 0) };
  };
  return Array.from({ length: ELEMENT_CODES.length / 2 }, (_, family) => ({
    basic: at(family * 2),
    enhanced: at(family * 2 + 1),
  }));
}

/**
 * 상세 전투 스펙 묶음 — 옛 프로젝트 SecondaryStatsCard의 다섯 칸(VITALS 전투자원·OFFENSE 공격·DEFENSE 방어·MOBILITY 기동·
 * EFFICIENCY 효율)에 팩 stat_rows를 넣는다(ADR 2026-11-01-ui-visibility "바뀜"). 효율은 지금 행이 없다(48 §3.3 직무 효율 행이 생기면 여기).
 * 표에 없는 행은 기타. 묶음 안 차례는 아래 표 차례, 모르는 행은 받은 차례
 */
export const COMBAT_GROUPS = ["vitals", "offense", "defense", "mobility", "efficiency", "other"] as const;
export type CombatGroup = (typeof COMBAT_GROUPS)[number];

const COMBAT_ROWS: readonly (readonly [string, CombatGroup])[] = [
  ["hp", "vitals"],
  ["armor_hp", "vitals"],
  ["shield_hp", "vitals"],
  ["mp", "vitals"],
  ["stamina", "vitals"],
  ["physical_attack", "offense"],
  ["elemental_attack", "offense"],
  ["hit", "offense"],
  ["crit_chance", "offense"],
  ["crit_multiplier", "offense"],
  ["defense_rate", "defense"],
  ["evade", "defense"],
  ["action_speed", "mobility"],
  ["sight", "mobility"],
];

export const combatGroupOf = (id: string): CombatGroup =>
  COMBAT_ROWS.find(([row]) => row === id)?.[1] ?? "other";

const rowOrder = (id: string): number => {
  const index = COMBAT_ROWS.findIndex(([row]) => row === id);
  return index < 0 ? COMBAT_ROWS.length : index;
};

/** 행을 묶음으로 나눈다(빈 묶음은 뺀다) */
export function combatGroups<T extends { readonly id: string }>(
  rows: readonly T[],
): { group: CombatGroup; rows: T[] }[] {
  return COMBAT_GROUPS.map((group) => ({
    group,
    rows: rows
      .filter((row) => combatGroupOf(row.id) === group)
      .toSorted((a, b) => rowOrder(a.id) - rowOrder(b.id)),
  })).filter((entry) => entry.rows.length > 0);
}

/** 이 행 값을 넘는 가장 가까운 1·2·5 × 10ⁿ(막대 끝, 꾸밈) */
function niceCeil(value: number): number {
  let step = 1;
  while (step * 10 <= value) step *= 10;
  for (const factor of [1, 2, 5, 10]) if (value <= factor * step) return factor * step;
  return 10 * step;
}

/**
 * 상세 전투 스펙 막대의 채움(0~1, 한 색). 확률 모양 = 값 ÷ 상한(점근선), 양 모양 = 값 ÷ 그 값을 넘는 1·2·5 단위
 * (옛 화면이 max(값, 200)을 끝으로 둔 것처럼 크기만 가늠하게). 받은 값을 비율로 바꿀 뿐이다
 */
export function barFill(row: Pick<RosterStatBreakdown, "shape" | "value" | "cap">): number {
  if (row.value <= 0) return 0;
  if (row.shape === "probability")
    return row.cap !== null && row.cap > 0 ? Math.min(1, row.value / row.cap) : 0;
  return Math.min(1, row.value / niceCeil(row.value));
}

/** 핵심 사양 막대의 칸(같은 스탯 색의 진하기, 옛 StatBar의 태생·성장·투자·장비처럼). 투자는 없다(D-024) */
export const CORE_PARTS = ["body", "initial", "growth", "gear", "organ", "effect"] as const;
export type CorePart = (typeof CORE_PARTS)[number];

/** 출처 하나의 칸: 장비 칸 아이템은 인공장기·부품 칸이면 organ, 그 밖은 gear */
export function corePartOf(source: RosterPrimarySource): CorePart {
  if (source.kind === "item") return source.slot === "organ" || source.slot === "part" ? "organ" : "gear";
  return source.kind;
}

/** 칸마다 더한 값(칸 차례, 0 이하는 막대에서 뺀다) */
export function coreSegments(sources: readonly RosterPrimarySource[]): { part: CorePart; value: number }[] {
  const sums = new Map<CorePart, number>();
  for (const source of sources) {
    const part = corePartOf(source);
    sums.set(part, (sums.get(part) ?? 0) + source.value);
  }
  return CORE_PARTS.flatMap((part) => {
    const value = sums.get(part) ?? 0;
    return value > 0 ? [{ part, value }] : [];
  });
}

/** 풀이 글의 가중합(받은 곱을 더해 보이기만 한다. 결과·내림 값은 서버의 weighted) */
export const termMilliSum = (row: RosterStatBreakdown): number =>
  row.terms.reduce((sum, term) => sum + term.milli, 0);
