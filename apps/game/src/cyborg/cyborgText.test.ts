// 사이보그 화면 다듬기 시험 — 속성 계열 묶음(기본·강화), 전투 스펙 막대 칸(받은 항을 몫으로만 바꾼다)
import type { RosterStatBreakdown } from "@terra/shared/roster";
import { describe, expect, it } from "vitest";
import { elementFamilies, elementLabel, specSegments, termMilliSum } from "./cyborgText.ts";

const hp: RosterStatBreakdown = {
  id: "hp",
  shape: "quantity",
  base: 10,
  terms: [
    { stat: "str", value: 10, weightPm: 1500, milli: 15_000 },
    { stat: "vit", value: 10, weightPm: 3000, milli: 30_000 },
  ],
  weighted: 45,
  extra: 5,
  score: 50,
  cap: null,
  halfConstant: null,
  value: 60,
};

const evade: RosterStatBreakdown = {
  id: "evade",
  shape: "probability",
  base: 0,
  terms: [{ stat: "agi", value: 25, weightPm: 1000, milli: 25_000 }],
  weighted: 25,
  extra: 0,
  score: 25,
  cap: 850,
  halfConstant: 250,
  value: 77,
};

describe("속성", () => {
  it("12칸을 계열 6줄(기본·강화)로, 모자란 값은 0", () => {
    const families = elementFamilies([3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
    expect(families).toHaveLength(6);
    expect(families[0]).toEqual({
      basic: { code: "water", value: 3 },
      enhanced: { code: "frost", value: 1 },
    });
    expect(families[5]).toEqual({ basic: { code: "dark", value: 2 }, enhanced: { code: "necro", value: 0 } });
    expect(elementLabel("lightning", "ko")).toBe("번개");
    expect(elementLabel("necro", "en")).toBe("Necro");
  });
});

describe("전투 스펙 막대", () => {
  it("양 모양: 기본·항·장비를 값 전체의 몫으로, 막대는 끝까지", () => {
    const { fill, segments } = specSegments(hp);
    expect(fill).toBe(1);
    expect(segments).toEqual([
      { kind: "base", share: 10 / 60 },
      { kind: "stat", stat: "str", share: 15 / 60 },
      { kind: "stat", stat: "vit", share: 30 / 60 },
      { kind: "gear", share: 5 / 60 },
    ]);
    expect(termMilliSum(hp)).toBe(45_000);
  });

  it("확률 모양: 상한까지의 몫만 칠한다(서버 값 ÷ 상한)", () => {
    const { fill, segments } = specSegments(evade);
    expect(fill).toBeCloseTo(77 / 850);
    expect(segments).toEqual([{ kind: "stat", stat: "agi", share: 1 }]);
  });

  it("음수·0 항은 막대에 넣지 않는다, 모두 0이면 빈 막대", () => {
    const negative: RosterStatBreakdown = {
      ...hp,
      base: 0,
      extra: -3,
      terms: [{ stat: "dex", value: 4, weightPm: -500, milli: -2000 }],
    };
    expect(specSegments(negative)).toEqual({ fill: 0, segments: [] });
  });
});
