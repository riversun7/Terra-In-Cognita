// 속성 분배 [+] 규칙(2026-11-11 사용자 요청 "속성 10일때 다른 속성을 +를 눌러 기존속성을 9로 낮추고 누른 속성을 올림")
import { checkElementAllocation } from "@terra/shared/cyborg";
import { describe, expect, it } from "vitest";
import { EMPTY_ELEMENT_DRAFT, type ElementDraft, plusAction, pressPlus } from "./elementDraft.ts";

const rule = { cells: 2, points: 10 };
const draft = (values: Partial<ElementDraft>): ElementDraft => ({ ...EMPTY_ELEMENT_DRAFT, ...values });

describe("속성 [+] 규칙", () => {
  it("남은 점수가 있으면 그 점수에서 1점을 더한다", () => {
    expect(pressPlus(draft({ water: 3 }), "water", rule)).toEqual(draft({ water: 4 }));
    expect(pressPlus(draft({ water: 3 }), "fire", rule)).toEqual(draft({ water: 3, fire: 1 }));
  });

  it("남은 점수가 있어도 고를 칸이 없으면 새 속성은 막힌다", () => {
    expect(plusAction(draft({ water: 3, fire: 2 }), "wind", rule)).toEqual({
      kind: "blocked",
      reason: "cells",
    });
  });

  it("10점을 한 속성에 다 넣었으면 다른 속성 [+]가 9·1로 옮긴다", () => {
    expect(plusAction(draft({ water: 10 }), "fire", rule)).toEqual({ kind: "move", from: "water" });
    expect(pressPlus(draft({ water: 10 }), "fire", rule)).toEqual(draft({ water: 9, fire: 1 }));
    // 상한 칸 자신은 더 오르지 않는다
    expect(plusAction(draft({ water: 10 }), "water", rule)).toEqual({ kind: "blocked", reason: "cap" });
  });

  it("두 칸을 고른 채 다 썼으면 고른 칸끼리 옮긴다", () => {
    expect(pressPlus(draft({ water: 6, fire: 4 }), "fire", rule)).toEqual(draft({ water: 5, fire: 5 }));
    expect(pressPlus(draft({ water: 5, fire: 5 }), "water", rule)).toEqual(draft({ water: 6, fire: 4 }));
    // 다른 칸이 1점이면 옮겨서 0이 된다(칸 하나로 몰린다)
    expect(pressPlus(draft({ water: 9, fire: 1 }), "water", rule)).toEqual(draft({ water: 10 }));
  });

  it("세 번째 속성은 칸 수를 넘으니 막힌다(힌트)", () => {
    expect(plusAction(draft({ water: 6, fire: 4 }), "earth", rule)).toEqual({
      kind: "blocked",
      reason: "swap_cells",
    });
    expect(pressPlus(draft({ water: 6, fire: 4 }), "earth", rule)).toEqual(draft({ water: 6, fire: 4 }));
  });

  it("가장 많은 속성에서 가져오고, 같으면 화면 차례(물·불·바람·땅)에서 앞", () => {
    const wide = { cells: 4, points: 10 };
    expect(plusAction(draft({ water: 2, fire: 5, wind: 3 }), "earth", wide)).toEqual({
      kind: "move",
      from: "fire",
    });
    expect(plusAction(draft({ fire: 4, wind: 4, earth: 2 }), "water", wide)).toEqual({
      kind: "move",
      from: "fire",
    });
  });

  it("옮긴 값은 늘 서버 판정을 통과한다", () => {
    const steps: ElementDraft[] = [draft({ earth: 10 })];
    for (const element of ["wind", "wind", "earth", "wind", "wind", "wind", "wind", "wind"] as const) {
      const before = steps.at(-1) ?? EMPTY_ELEMENT_DRAFT;
      steps.push(pressPlus(before, element, rule));
    }
    for (const step of steps) {
      const payload = Object.fromEntries(Object.entries(step).filter(([, value]) => value > 0));
      expect(checkElementAllocation(payload, rule).ok).toBe(true);
    }
    expect(steps.at(-1)).toEqual(draft({ earth: 4, wind: 6 }));
  });
});
