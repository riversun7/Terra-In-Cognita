// 공성 전투맵 시설 목표 시험 — 질문 1114 가(기획 D-535), world/battleTargets.ts siegeFacilityTargets
import { describe, expect, it } from "vitest";
import { siegeFacilityTargets } from "./battleTargets.ts";

describe("공성 전투맵 시설 목표(질문 1114 가)", () => {
  it("전투 건물 → 2차맵 건물 가운데 세계 시설만, 넥서스(따로 다룸)는 빼고 전투 건물 ID 차례로 단다", () => {
    const sources = new Map([
      [3, 900],
      [1, 100],
      [2, 500],
      [4, 777],
    ]);
    const facilities = new Set([100, 500, 900]);
    expect(siegeFacilityTargets(sources, (id) => facilities.has(id), 1)).toEqual([
      { building: 2, kind: "facility", id: 500 },
      { building: 3, kind: "facility", id: 900 },
    ]);
    expect(siegeFacilityTargets(new Map(), () => true, 1)).toEqual([]);
  });
});
