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
 * EFFICIENCY 효율)에 팩 stat_rows를 넣는다(ADR 2026-11-01-ui-visibility "바뀜"). 효율 = 48 §3.3 직무 효율 행(지금 제작 job_crafting 하나, D-512 323).
 * D-458 새 행: 쉴드 재생·MP 회복·스태미나 회복은 VITALS(옛 "보호막 재생" 자리처럼 그 자원 바로 아래), 속성 방어율은 DEFENSE(물리 방어율 다음).
 * 표에 없는 행은 기타. 묶음 안 차례는 아래 표 차례, 모르는 행은 받은 차례
 */
export const COMBAT_GROUPS = ["vitals", "offense", "defense", "mobility", "efficiency", "other"] as const;
export type CombatGroup = (typeof COMBAT_GROUPS)[number];

const COMBAT_ROWS: readonly (readonly [string, CombatGroup])[] = [
  ["hp", "vitals"],
  // HP 회복(D-514)은 HP 바로 아래(2026-11-12: 표에 없어 기타 묶음이 생기던 것)
  ["hp_regen", "vitals"],
  ["armor_hp", "vitals"],
  ["shield_hp", "vitals"],
  ["shield_regen", "vitals"],
  ["mp", "vitals"],
  ["mp_regen", "vitals"],
  ["stamina", "vitals"],
  ["stamina_regen", "vitals"],
  ["physical_attack", "offense"],
  ["elemental_attack", "offense"],
  ["hit", "offense"],
  ["crit_chance", "offense"],
  ["crit_multiplier", "offense"],
  ["defense_rate", "defense"],
  ["elemental_defense_rate", "defense"],
  ["evade", "defense"],
  ["action_speed", "mobility"],
  ["sight", "mobility"],
  // 직무 효율 행(48 §3.3): 제작 = 수리 장인 실력(D-512 323)
  ["job_crafting", "efficiency"],
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

/**
 * 핵심 사양 막대의 칸(같은 스탯 색의 진하기, 옛 StatBar의 태생·성장·투자·장비처럼). 투자는 없다(D-024).
 * 걸린 효과(effect)는 버프 색, 디버프로 깎인 몫(debuff)은 디버프 색이다(질문 354 → D-515: 버프 몫은 다른 색)
 */
export const CORE_PARTS = ["body", "initial", "growth", "gear", "organ", "effect"] as const;
export type CorePart = (typeof CORE_PARTS)[number] | "debuff";

/** 출처 하나의 칸: 장비 칸 아이템은 인공장기·부품 칸이면 organ, 그 밖은 gear */
export function corePartOf(source: RosterPrimarySource): CorePart {
  if (source.kind === "item") return source.slot === "organ" || source.slot === "part" ? "organ" : "gear";
  return source.kind;
}

/** 걸린 효과(버프·디버프)의 합 — 1차 스탯 줄의 버프 몫 */
export const effectShare = (sources: readonly RosterPrimarySource[]): number =>
  sources.reduce((sum, source) => sum + (source.kind === "effect" ? source.value : 0), 0);

/**
 * 칸마다 더한 값(칸 차례, 0 이하는 막대에서 뺀다). 효과 합이 음수(디버프)면 기본 막대 끝에서 그만큼을 디버프 칸으로 바꾼다
 * (막대 길이 = 기본, 끝의 디버프 칸 = 깎인 몫)
 */
export function coreSegments(sources: readonly RosterPrimarySource[]): { part: CorePart; value: number }[] {
  const sums = new Map<CorePart, number>();
  for (const source of sources) {
    const part = corePartOf(source);
    sums.set(part, (sums.get(part) ?? 0) + source.value);
  }
  const segments = CORE_PARTS.flatMap((part): { part: CorePart; value: number }[] => {
    const value = sums.get(part) ?? 0;
    return value > 0 ? [{ part, value }] : [];
  });
  const lost = -(sums.get("effect") ?? 0);
  if (lost <= 0) return segments;
  let cut = lost;
  const kept: { part: CorePart; value: number }[] = [];
  for (const segment of segments.toReversed()) {
    const take = Math.min(cut, segment.value);
    cut -= take;
    if (segment.value > take) kept.unshift({ part: segment.part, value: segment.value - take });
  }
  const debuff: { part: CorePart; value: number } = { part: "debuff", value: lost - cut };
  return [...kept, debuff].filter((segment) => segment.value > 0);
}

/** 버프 몫의 쪽: up = 좋아짐(버프 색), down = 나빠짐(디버프 색). 낮을수록 좋은 값(공격 간격)은 뒤집는다 */
export const buffTone = (share: number, lowerIsBetter = false): "up" | "down" =>
  share > 0 !== lowerIsBetter ? "up" : "down";

/**
 * 상세 전투 스펙 막대를 기본·몫 두 칸으로(0~1): 끝 = 기본과 판정 값 가운데 큰 값의 barFill 규칙, 앞 칸 = 둘 가운데 작은 값,
 * 뒤 칸 = 차이(버프면 더한 몫, 디버프면 깎인 몫). 받은 값을 비율로 바꿀 뿐이다
 */
export function barSplit(
  row: Pick<RosterStatBreakdown, "shape" | "cap">,
  base: number,
  total: number,
): { fill: number; extra: number } {
  const top = Math.max(base, total);
  const end = barFill({ ...row, value: top });
  if (top <= 0 || end <= 0) return { fill: 0, extra: 0 };
  const unit = end / top;
  const low = Math.max(0, Math.min(base, total));
  const fill = low * unit;
  return { fill, extra: Math.max(0, end - fill) };
}

/** 풀이 글의 가중합(받은 곱을 더해 보이기만 한다. 결과·내림 값은 서버의 weighted) */
export const termMilliSum = (row: RosterStatBreakdown): number =>
  row.terms.reduce((sum, term) => sum + term.milli, 0);
