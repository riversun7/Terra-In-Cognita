// 2차맵 건설 땅 규칙(순수 판정) — docs/adr/2026-11-14-second-map-build.md, 기획 D-572(알박기 우선)
import { describe, expect, it } from "vitest";
import { landVerdict } from "./landRule.ts";

describe("landVerdict", () => {
  it("도시가 없는 2차맵(주인 없는 땅·정부 건물 없는 세력 범위)은 누구나 짓는다", () => {
    expect(landVerdict([], [])).toEqual({ allowed: true });
    expect(landVerdict([3], [])).toEqual({ allowed: true });
  });

  it("내 세력 도시 2차맵은 짓는다(1982 — 주인 세력·나라 가운데 하나면 내 세력)", () => {
    expect(landVerdict([3], [3])).toEqual({ allowed: true });
    // 가문 없는 플레이어(세력 = 사이보그의 나라 7)·가문원(가문 12 + 가문 나라 7)도 자기 나라 도시에 짓는다(D-565·D-569)
    expect(landVerdict([7], [7])).toEqual({ allowed: true });
    expect(landVerdict([7, 12], [7])).toEqual({ allowed: true });
  });

  it("다른 세력 도시 2차맵은 못 짓는다(전쟁·중립·동맹 — 동맹 정책 기본값 금지), 세력이 없으면 모든 도시가 남의 것", () => {
    expect(landVerdict([3], [5])).toEqual({ allowed: false, reason: "foreign_city", cityFaction: 5 });
    expect(landVerdict([], [5])).toEqual({ allowed: false, reason: "foreign_city", cityFaction: 5 });
    // 다른 세력 도시가 여럿이면 작은 ID를 알린다
    expect(landVerdict([3], [9, 7])).toEqual({ allowed: false, reason: "foreign_city", cityFaction: 7 });
  });

  it("한 2차맵에 내 도시와 남의 도시가 함께 있으면 내 땅으로 친다(옛 세계·시험 2차맵 줄)", () => {
    expect(landVerdict([3], [9, 3, 7])).toEqual({ allowed: true });
  });

  it("도시가 없는 2차맵은 다른 세력 1차맵 영토 안이어도 짓는다(D-572 알박기 우선 — 1983), 남의 영토면 알린다", () => {
    expect(landVerdict([3], [], 5)).toEqual({ allowed: true, territoryFaction: 5 });
    expect(landVerdict([], [], 5)).toEqual({ allowed: true, territoryFaction: 5 });
    expect(landVerdict([3], [], 3)).toEqual({ allowed: true });
    expect(landVerdict([7, 12], [], 7)).toEqual({ allowed: true });
    expect(landVerdict([3], [], null)).toEqual({ allowed: true });
    // 내 도시 2차맵은 가장자리가 남의 영토여도 짓는다(알림 없음), 남의 도시 2차맵은 도시 까닭
    expect(landVerdict([3], [3], 5)).toEqual({ allowed: true });
    expect(landVerdict([3], [7], 5)).toEqual({ allowed: false, reason: "foreign_city", cityFaction: 7 });
  });
});
