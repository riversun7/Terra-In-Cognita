// 사이보그 화면 문구·다듬기 — 순수 함수(시험: cyborgText.test.ts). 키로 고르는 문구는 정적 표(m[키]는 oxlint가 막는다).
// - 속성 이름(D-182·D-5011, 50 §2.1 코드), 계열 묶음(기본·강화 두 칸씩).
// - 전투 스펙 막대의 칸 너비: 서버가 보낸 항(곱)·기본·장비를 몫으로 바꿀 뿐 값을 다시 계산하지 않는다.
import {
  ELEMENT_CODES,
  type ElementCode,
  type PrimaryStat,
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

/** 전투 스펙 막대 한 칸: 기본(흐린 색)·1차 스탯 항(스탯 색)·장비(빗금). share = 막대 안 몫(0~1) */
export type SpecSegment =
  | { readonly kind: "base"; readonly share: number }
  | { readonly kind: "stat"; readonly stat: PrimaryStat; readonly share: number }
  | { readonly kind: "gear"; readonly share: number };

/**
 * 막대 칸: 양 모양은 값 전체(기본 + 항 + 장비)를 막대 끝까지, 확률 모양은 상한까지의 몫(value ÷ cap)을 칠하고 그 안을 점수의 항·장비 몫으로
 * 나눈다. 음수 몫은 막대에 넣지 않는다(풀이 글에는 보인다).
 */
export function specSegments(row: RosterStatBreakdown): { fill: number; segments: SpecSegment[] } {
  const parts: SpecSegment[] = [];
  const base = row.shape === "quantity" ? Math.max(0, row.base) * 1000 : 0;
  const terms = row.terms.map((term) => ({ stat: term.stat, milli: Math.max(0, term.milli) }));
  const gear = Math.max(0, row.extra) * 1000;
  const total = base + terms.reduce((sum, term) => sum + term.milli, 0) + gear;
  if (total <= 0) return { fill: 0, segments: [] };
  if (base > 0) parts.push({ kind: "base", share: base / total });
  for (const term of terms)
    if (term.milli > 0) parts.push({ kind: "stat", stat: term.stat, share: term.milli / total });
  if (gear > 0) parts.push({ kind: "gear", share: gear / total });
  const fill =
    row.shape === "probability" && row.cap !== null && row.cap > 0
      ? Math.min(1, Math.max(0, row.value / row.cap))
      : 1;
  return { fill, segments: parts };
}

/** 풀이 글의 가중합(받은 곱을 더해 보이기만 한다. 결과·내림 값은 서버의 weighted) */
export const termMilliSum = (row: RosterStatBreakdown): number =>
  row.terms.reduce((sum, term) => sum + term.milli, 0);
