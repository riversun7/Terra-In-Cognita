// 2차맵 건설 땅 규칙(순수 판정) — docs/adr/2026-11-14-second-map-build.md
import { describe, expect, it } from "vitest";
import { landVerdict } from "./landRule.ts";

describe("landVerdict", () => {
  it("도시가 없는 2차맵(주인 없는 땅·정부 건물 없는 세력 범위)은 누구나 짓는다", () => {
    expect(landVerdict(null, [])).toEqual({ allowed: true });
    expect(landVerdict(3, [])).toEqual({ allowed: true });
  });

  it("내 세력 도시 2차맵은 짓는다", () => {
    expect(landVerdict(3, [3])).toEqual({ allowed: true });
  });

  it("다른 세력 도시 2차맵은 못 짓는다(전쟁·중립·동맹 — 동맹 정책 기본값 금지), 세력이 없으면 모든 도시가 남의 것", () => {
    expect(landVerdict(3, [5])).toEqual({ allowed: false, reason: "foreign_city", cityFaction: 5 });
    expect(landVerdict(null, [5])).toEqual({ allowed: false, reason: "foreign_city", cityFaction: 5 });
    // 다른 세력 도시가 여럿이면 작은 ID를 알린다
    expect(landVerdict(3, [9, 7])).toEqual({ allowed: false, reason: "foreign_city", cityFaction: 7 });
  });

  it("한 2차맵에 내 도시와 남의 도시가 함께 있으면 내 땅으로 친다(옛 세계·시험 2차맵 줄)", () => {
    expect(landVerdict(3, [9, 3, 7])).toEqual({ allowed: true });
  });
});
