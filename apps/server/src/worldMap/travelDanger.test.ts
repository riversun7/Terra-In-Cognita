// 확인 단계 위험 구간 시험(순수 함수) — 출발은 빼고, 아는 2차맵만 오염 값, 문턱 이상이면 위험, 내가 아는 도시의 전쟁 중 세력,
// 모르는 2차맵 수(docs/adr/2026-11-07-play-flow.md "WP11", 질문 594 나)
import { describe, expect, it } from "vitest";
import { travelDangers } from "./travelDanger.ts";

const ROUTE = [10, 11, 12, 13];

describe("위험 구간", () => {
  it("아는 2차맵의 높은 오염과 아는 도시의 전쟁만 위험이고, 모르는 2차맵은 값 없이 센다", () => {
    const result = travelDangers(ROUTE, {
      knownMap: (key) => key !== 12,
      pollution: new Map([
        [10, 9_000],
        [11, 2_500],
        [12, 8_000],
        [13, 100],
      ]),
      knownCities: [
        { factionId: 4, mapKey: 13 },
        { factionId: 4, mapKey: 13 },
        { factionId: 2, mapKey: 13 },
        { factionId: 5, mapKey: 11 },
      ],
      warring: new Set([2, 4]),
      threshold: 2_000,
    });
    expect(result).toEqual({
      dangers: [
        // 출발(10)은 넣지 않는다
        { leg: 1, mapKey: 11, pollution: 2_500, pollutionHigh: true, warFactionIds: [] },
        // 12는 모른다(오염 8,000이어도 보이지 않는다)
        { leg: 3, mapKey: 13, pollution: 100, pollutionHigh: false, warFactionIds: [2, 4] },
      ],
      unknownMaps: 1,
    });
  });

  it("같은 2차맵 줄이면 위험 없음·모르는 것 없음", () => {
    expect(
      travelDangers([10], {
        knownMap: () => false,
        pollution: new Map(),
        knownCities: [],
        warring: new Set(),
        threshold: 0,
      }),
    ).toEqual({ dangers: [], unknownMaps: 0 });
  });
});
