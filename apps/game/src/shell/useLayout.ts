// 지금 화면 폭 단계·하단 탭 칸 수·휴대폰 세로인지 — 화면(React) 밖에서 matchMedia를 듣고 화면은 useLayout()으로 읽는다.
// 값과 미디어 쿼리 글은 layout.ts(shell.css·tabbar.css와 같은 숫자). matchMedia는 그리기 전에 바로 읽혀서 첫 그림부터 맞다.
import { NAV_LAYOUTS, type NavLayout } from "@terra/shared";
import { useSyncExternalStore } from "react";
import {
  type LayoutStage,
  MEDIUM_QUERY,
  PORTRAIT_TOUCH_QUERY,
  TAB_SLOT_QUERIES,
  TAB_SLOT_STEPS,
  WIDE_QUERY,
} from "./layout.ts";

export interface LayoutSnapshot {
  readonly stage: LayoutStage;
  /** 배치마다 하단 탭 칸 수(좁은 단계만. 중간·넓음은 0). 배치마다 계단이 다르다(layout.ts TAB_SLOT_STEPS) */
  readonly tabSlots: { readonly [L in NavLayout]: number };
  /** 휴대폰 세로(좁은 단계 + 세로 + 손가락 입력) */
  readonly phonePortrait: boolean;
}

const QUERIES = [
  ...new Set([
    MEDIUM_QUERY,
    WIDE_QUERY,
    PORTRAIT_TOUCH_QUERY,
    ...NAV_LAYOUTS.flatMap((layout) => TAB_SLOT_QUERIES[layout].map((step) => step.query)),
  ]),
];

function matches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    // matchMedia가 없는 환경: 좁은 단계로 본다(모바일 우선)
    return false;
  }
}

/** 좁은 단계에서 그 배치의 칸 수(맞는 계단 중 마지막) */
function slotsFor(layout: NavLayout): number {
  let slots = TAB_SLOT_STEPS[layout][0]?.slots ?? 4;
  for (const step of TAB_SLOT_QUERIES[layout]) {
    if (matches(step.query)) slots = step.slots;
  }
  return slots;
}

function read(): LayoutSnapshot {
  const stage: LayoutStage = matches(WIDE_QUERY) ? "wide" : matches(MEDIUM_QUERY) ? "medium" : "narrow";
  const narrow = stage === "narrow";
  return {
    stage,
    tabSlots: { c: narrow ? slotsFor("c") : 0, a: narrow ? slotsFor("a") : 0 },
    phonePortrait: narrow && matches(PORTRAIT_TOUCH_QUERY),
  };
}

const listeners = new Set<() => void>();
let snapshot: LayoutSnapshot | null = null;
let listening = false;

function onChange(): void {
  const next = read();
  const now = snapshot;
  if (
    now !== null &&
    now.stage === next.stage &&
    now.tabSlots.c === next.tabSlots.c &&
    now.tabSlots.a === next.tabSlots.a &&
    now.phonePortrait === next.phonePortrait
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getLayout(): LayoutSnapshot {
  snapshot ??= read();
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  if (!listening) {
    listening = true;
    for (const query of QUERIES) {
      try {
        window.matchMedia(query).addEventListener("change", onChange);
      } catch {
        // matchMedia가 없는 환경: 폭 변화는 따르지 않는다
      }
    }
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLayout(): LayoutSnapshot {
  return useSyncExternalStore(subscribe, getLayout);
}
