// 첫 접속 속성 분배의 고르는 중인 값과 [+] 규칙 — elementsStep.tsx가 쓴다(판정은 서버가 @terra/shared checkElementAllocation으로 다시 한다).
// 사용자 요청(2026-11-11): "속성 10일때 다른 속성을 +를 눌러 기존속성을 9로 낮추고 누른 속성을 올림"
// → 점수를 다 쓴 뒤 [+]는 이미 고른 다른 속성 가운데 점수가 가장 많은 것(같으면 화면 차례 물·불·바람·땅에서 앞)에서 1점을 옮겨 온다.
//   옮긴 뒤 고른 칸이 칸 수(N36, 기본 2)를 넘으면 옮기지 않는다(버튼을 끄고 힌트) — docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (2026-11-11)".
import { BASIC_ELEMENTS, ELEMENT_MAX, type ElementAllocationRule } from "@terra/shared/cyborg";

export type BasicElement = (typeof BASIC_ELEMENTS)[number];
/** 고르는 중인 분배(4원소만, 0인 칸은 고르지 않은 칸) */
export type ElementDraft = Readonly<Record<BasicElement, number>>;

export const EMPTY_ELEMENT_DRAFT: ElementDraft = { water: 0, fire: 0, wind: 0, earth: 0 };

/**
 * [+] 한 번이 하는 일: add = 남은 점수에서 1점, move = from 속성에서 1점을 옮겨 옴,
 * blocked = 못 함(cap = 이 칸이 상한, cells = 남은 점수는 있지만 고를 칸이 없다, swap_cells = 옮기면 칸 수를 넘는다)
 */
export type PlusAction =
  | { readonly kind: "add" }
  | { readonly kind: "move"; readonly from: BasicElement }
  | { readonly kind: "blocked"; readonly reason: "cap" | "cells" | "swap_cells" };

/** 한 칸 상한(D-182 10, 나눌 점수보다 클 수 없다) */
export const elementCap = (rule: ElementAllocationRule): number => Math.min(ELEMENT_MAX, rule.points);

/** 고른 칸 수·남은 점수 */
export function draftCounts(
  draft: ElementDraft,
  rule: ElementAllocationRule,
): { left: number; cells: number } {
  let used = 0;
  let cells = 0;
  for (const element of BASIC_ELEMENTS) {
    used += draft[element];
    if (draft[element] > 0) cells += 1;
  }
  return { left: rule.points - used, cells };
}

/** 이 속성의 [+]가 무엇을 하는가 */
export function plusAction(
  draft: ElementDraft,
  element: BasicElement,
  rule: ElementAllocationRule,
): PlusAction {
  if (draft[element] >= elementCap(rule)) return { kind: "blocked", reason: "cap" };
  const { left, cells } = draftCounts(draft, rule);
  if (left > 0) {
    return draft[element] > 0 || cells < rule.cells ? { kind: "add" } : { kind: "blocked", reason: "cells" };
  }
  // 점수를 다 썼다: 다른 속성 가운데 가장 많은 것(같으면 화면 차례 앞)에서 옮긴다
  let from: BasicElement | undefined;
  for (const other of BASIC_ELEMENTS) {
    if (other === element || draft[other] <= 0) continue;
    if (from === undefined || draft[other] > draft[from]) from = other;
  }
  if (from === undefined) return { kind: "blocked", reason: "cap" };
  const cellsAfter = cells + (draft[element] === 0 ? 1 : 0) - (draft[from] === 1 ? 1 : 0);
  return cellsAfter > rule.cells ? { kind: "blocked", reason: "swap_cells" } : { kind: "move", from };
}

/** [+]를 누른 뒤 값(못 하면 그대로) */
export function pressPlus(
  draft: ElementDraft,
  element: BasicElement,
  rule: ElementAllocationRule,
): ElementDraft {
  const action = plusAction(draft, element, rule);
  if (action.kind === "add") return { ...draft, [element]: draft[element] + 1 };
  if (action.kind === "move")
    return { ...draft, [action.from]: draft[action.from] - 1, [element]: draft[element] + 1 };
  return draft;
}
