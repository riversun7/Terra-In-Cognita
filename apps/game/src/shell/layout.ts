// 화면 틀의 폭 단계와 슬림 하단 탭 칸 수(ADR 2026-11-24-compact-responsive-shell-and-chat.md).
// 폭 단계는 CSS(shell.css·tabbar.css의 미디어 쿼리)가 정한다: 37.5em(600px)·64em(1024px).
// 하단 탭이 48px 플랫 규격·10.5px 라벨로 축소됨에 따라 칸 최소 폭을 3.375em(54px)으로 줄여,
// 390px 표준 스마트폰에서도 6개 탭이 여유 있게 나란히 배치된다.

import type { NavLayout } from "@terra/shared";

/** 중간 단계(접는 64px 레일)가 시작되는 폭 — 37.5em(600px). 이보다 좁으면 하단 탭 + 우측 ☰ 드롭다운 */
export const MEDIUM_MIN_EM = 37.5;
/** 넓음 단계(늘 펼친 216px 사이드 메뉴 + 우측 채팅 패널)가 시작되는 폭 — 64em(1024px) */
export const WIDE_MIN_EM = 64;

export type LayoutStage = "narrow" | "medium" | "wide";

/** 미디어 쿼리 글. shell.css·tabbar.css와 글자 그대로 같다(layout.test.ts) */
export const MEDIUM_QUERY = `(min-width: ${MEDIUM_MIN_EM}em)`;
export const WIDE_QUERY = `(min-width: ${WIDE_MIN_EM}em)`;

/** 폭(em) → 단계 */
export function layoutStage(widthEm: number): LayoutStage {
  if (widthEm >= WIDE_MIN_EM) return "wide";
  if (widthEm >= MEDIUM_MIN_EM) return "medium";
  return "narrow";
}

/** 칸 수 계단 한 단: 이 폭(em)부터 이 칸 수 */
export interface TabSlotStep {
  readonly minEm: number;
  readonly slots: number;
}

/**
 * 슬림 하단 탭 칸 하나의 가장 좁은 너비(em) — 3.375em(54px). 10.5px 라벨(영어 "Economy" 약 43px)과 여백이 들어가고
 * 누르는 곳(32px 권장, 24px 최소)보다 넉넉하다.
 */
export const TAB_CELL_MIN_EM = 3.375;

/**
 * C의 가운데 지도 칸 너비(em) — 지도 틀(--tabbar-map-size 42px) + 양옆 여백(--space-4 14px) = 56px(3.5em).
 * tabbar.css의 .tab-map 최소 너비와 같다(layout.test.ts가 tokens.css·tabbar.css와 대 본다)
 */
export const TAB_MAP_CELL_EM = 3.5;

/**
 * 좁은 단계의 하단 탭 칸 수 계단 — 첫 계단은 4칸, 380px(23.75em)부터 C도 5칸(+지도=6탭)이 들어간다.
 * - A: (칸 수 + 1) × 3.375em → 5칸 20.25em(324px), 6칸 23.625em(378px), 7칸 27em(432px).
 * - C: 2 × ⌈칸 수 ÷ 2⌉ × 3.375em + 3.5em → 5칸 23.75em(380px), 6칸 27em(432px).
 */
export const TAB_SLOT_STEPS: { readonly [L in NavLayout]: readonly TabSlotStep[] } = {
  a: [
    { minEm: 0, slots: 4 },
    { minEm: 20.25, slots: 5 },
    { minEm: 23.625, slots: 6 },
    { minEm: 27, slots: 7 },
  ],
  c: [
    { minEm: 0, slots: 4 },
    { minEm: 23.75, slots: 5 },
    { minEm: 27, slots: 6 },
  ],
};

/**
 * 배치 C의 칸 나누기: 가운데 지도 버튼의 왼쪽·오른쪽. 칸이 홀수면 남는 칸을 오른쪽에 둔다.
 */
export function splitCenterTabs<T>(items: readonly T[]): { readonly left: T[]; readonly right: T[] } {
  const half = Math.floor(items.length / 2);
  return { left: items.slice(0, half), right: items.slice(half) };
}

/** 좁은 단계 폭(em)의 하단 탭 칸 수. 중간·넓음 단계에는 하단 탭이 없어 0 */
export function tabSlotsForWidth(widthEm: number, layout: NavLayout): number {
  if (layoutStage(widthEm) !== "narrow") return 0;
  let slots = 0;
  for (const step of TAB_SLOT_STEPS[layout]) {
    if (widthEm >= step.minEm) slots = step.slots;
  }
  return slots;
}

/** 칸 수 계단의 미디어 쿼리(첫 계단 0em은 늘 맞아서 뺀다) */
export const TAB_SLOT_QUERIES: {
  readonly [L in NavLayout]: readonly { readonly query: string; readonly slots: number }[];
} = {
  a: slotQueries(TAB_SLOT_STEPS.a),
  c: slotQueries(TAB_SLOT_STEPS.c),
};

function slotQueries(steps: readonly TabSlotStep[]): { readonly query: string; readonly slots: number }[] {
  return steps
    .filter((step) => step.minEm > 0)
    .map((step) => ({ query: `(min-width: ${step.minEm}em)`, slots: step.slots }));
}

export const PORTRAIT_TOUCH_QUERY = "(orientation: portrait) and (pointer: coarse)";
