import type { RecruitCardView } from "@terra/shared/recruit";
import { describe, expect, it } from "vitest";
import { activeElements, hireState, refreshLeft, statShare } from "./recruitModel.ts";

const card: RecruitCardView = {
  slot: 0,
  level: 1,
  total: 36,
  stats: { str: 9, vit: 6, int: 4, wis: 5, dex: 6, agi: 6 },
  elements: { water: 0, fire: 7, wind: 3, earth: 0 },
  cost: "62",
  taken: false,
};

describe("구인 카드 시험 화면 셈", () => {
  it("고용 단추: 이미 삼 → 사이보그 없음 → 돈 모자람 → 살 수 있음 차례", () => {
    expect(hireState({ ...card, taken: true }, "0", false)).toBe("taken");
    expect(hireState(card, "1000", false)).toBe("no_cyborg");
    expect(hireState(card, "61", true)).toBe("funds");
    expect(hireState(card, "62", true)).toBe("ready");
  });

  it("점수가 있는 속성만 4원소 차례로", () => {
    expect(activeElements(card)).toEqual([
      { element: "fire", value: 7 },
      { element: "wind", value: 3 },
    ]);
  });

  it("다음 갱신까지 남은 시·분(올림), 지났으면 0", () => {
    expect(refreshLeft(10 * 3_600_000, 0)).toEqual({ hours: 10, minutes: 0 });
    expect(refreshLeft(90 * 60_000 + 1, 0)).toEqual({ hours: 1, minutes: 31 });
    expect(refreshLeft(0, 5)).toEqual({ hours: 0, minutes: 0 });
  });

  it("스탯 막대 폭은 그 카드 가장 큰 스탯 = 100%", () => {
    expect(statShare(card, "str")).toBe(100);
    expect(statShare(card, "int")).toBe(44);
  });
});
