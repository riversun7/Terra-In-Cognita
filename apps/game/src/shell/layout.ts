// 화면 틀의 폭 단계와 하단 탭 칸 수(ADR 2026-10-29-app-shell 3절, 기획 D-6004·D-265).
// 폭 단계는 CSS(shell.css·tabbar.css의 미디어 쿼리)가 정한다: 첫 그림에서 다른 모양이 번쩍이지 않게. JS가 쓰는 같은 값을
// 여기 두고 layout.test.ts가 두 파일의 미디어 쿼리 숫자와 같은지 본다. CSS 변수는 미디어 쿼리에 못 쓰고, em은 브라우저 기본
// 글자 크기(보통 16px)를 따른다(괄호 안 px는 16px일 때).
// 하단 탭 칸 수(D-265 "좁은 휴대폰은 4칸, 넓으면 더 많이")는 JS가 같은 em 값의 matchMedia로 정한다(useLayout.ts).
// matchMedia는 그리기 전에 바로 읽히므로 첫 그림부터 맞는 칸 수다.

import type { NavLayout } from "@terra/shared";

/** 중간 단계(접는 레일)가 시작되는 폭 — 37.5em(600px). 이보다 좁으면 하단 탭 + ☰ 서랍 */
export const MEDIUM_MIN_EM = 37.5;
/** 넓음 단계(늘 펼친 사이드 메뉴)가 시작되는 폭 — 64em(1024px) */
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
 * 하단 탭 칸 하나의 가장 좁은 너비(em) — 4.5em(72px). 가장 긴 이름(영어 "Economy", 12px 굵은 글자 약 50px) + 여백이 들어가고
 * 누르는 곳(44px)보다 넓다.
 */
export const TAB_CELL_MIN_EM = 4.5;

/**
 * C의 가운데 지도 칸 너비(em) — 지도 버튼(--tabbar-map-size 60px) + 양옆 여백(--space-4 16px) = 76px.
 * tabbar.css의 .tab-map 최소 너비와 같다(layout.test.ts가 tokens.css·tabbar.css와 대 본다)
 */
export const TAB_MAP_CELL_EM = 4.75;

/**
 * 좁은 단계의 하단 탭 칸 수 계단(D-265 "좁은 휴대폰은 4칸, 넓으면 더") — 배치마다 다르다. 첫 계단은 늘 4칸이다.
 * 계단의 시작 폭은 폭 전체를 칸으로 나눴을 때 가장 좁은 칸이 TAB_CELL_MIN_EM이 되는 폭이다. 띠 안쪽 여백(양옆 합 0.5em)은
 * 셈에 넣지 않아서, 시작 폭의 실제 가장 좁은 칸은 약 4.42em(70.7px)이다(영어 "Economy"는 들어간다 — W1 화면 측정).
 * - A: 칸과 끝칸 ☰가 모두 같은 너비 → (칸 수 + 1) × 4.5em. 5칸 27em(432px), 6칸 31.5em(504px).
 * - C: 지도 버튼을 늘 가운데 두므로 양쪽 너비가 같다. 칸이 홀수면 많은 쪽(오른쪽, splitCenterTabs) 칸이 좁아지므로 그쪽
 *   칸도 4.5em이 되는 폭부터 는다 → 2 × ⌈칸 수 ÷ 2⌉ × 4.5em + 지도 칸 4.75em. 5칸 31.75em(508px). 지도를 뺀 항목이
 *   5개라 5칸이 최대다. (27em부터 5칸으로 두면 432~507px에서 많은 쪽 칸이 58~70px가 되어 영어 "Economy"가 잘렸다
 *   — 2026-10-29 화면에서 잼.)
 * 그래서 휴대폰 세로(360~440px)는 C 4칸, A 4~5칸이다.
 */
export const TAB_SLOT_STEPS: { readonly [L in NavLayout]: readonly TabSlotStep[] } = {
  a: [
    { minEm: 0, slots: 4 },
    { minEm: 27, slots: 5 },
    { minEm: 31.5, slots: 6 },
  ],
  c: [
    { minEm: 0, slots: 4 },
    { minEm: 31.75, slots: 5 },
  ],
};

/**
 * 배치 C의 칸 나누기: 가운데 지도 버튼의 왼쪽·오른쪽. 칸이 홀수면 남는 칸을 오른쪽에 둔다 — 폭이 넓어져 칸이 늘어도
 * 앞 칸들의 자리가 그대로다(4칸 홈·유닛 | 지도 | 경제·세력 → 5칸 홈·유닛 | 지도 | 경제·세력·사이보그). 기술 해석이다
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

/**
 * 세로로 든 손가락 입력 기기. 좁은 단계(MEDIUM_QUERY가 맞지 않음)와 함께 맞으면 휴대폰 세로다 — 지도 방향 안내를 띄운다.
 * 태블릿(중간 이상)·데스크톱(마우스)에는 띄우지 않는다(ADR 37 3절)
 */
export const PORTRAIT_TOUCH_QUERY = "(orientation: portrait) and (pointer: coarse)";
