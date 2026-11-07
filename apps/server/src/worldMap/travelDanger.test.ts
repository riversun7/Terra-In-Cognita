// 확인 단계 위험 구간 시험(순수 함수) — 출발은 빼고, 아는 2차맵만 오염 값, 문턱 이상이면 위험, 내 국가와 전쟁 중인 세력의 아는 도시·아는 2차맵의
// 영토 칸, 모르는 2차맵 수(docs/adr/2026-11-07-play-flow.md "WP11"·"WP13", 질문 594 나·611 나)
import { describe, expect, it } from "vitest";
import { travelDangers } from "./travelDanger.ts";

const ROUTE = [10, 11, 12, 13];

describe("위험 구간", () => {
  it("아는 2차맵의 높은 오염과 나와 전쟁 중인 세력의 아는 도시만 위험이고, 모르는 2차맵은 값 없이 센다", () => {
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
        // 세력 5는 남과 전쟁 중일 뿐 나와 전쟁하지 않는다(611 나 — 위험이 아니다)
        { factionId: 5, mapKey: 11 },
      ],
      enemies: new Set([2, 4]),
      territory: new Map(),
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

  it("영토 칸: 아는 2차맵을 나와 전쟁 중인 세력이 차지했으면 도시가 없어도 위험, 모르는 2차맵이면 보이지 않는다", () => {
    const result = travelDangers(ROUTE, {
      knownMap: (key) => key !== 12,
      pollution: new Map(),
      knownCities: [],
      enemies: new Set([7]),
      territory: new Map([
        [11, 7],
        [12, 7],
        [13, 8],
      ]),
      threshold: 2_000,
    });
    expect(result).toEqual({
      dangers: [{ leg: 1, mapKey: 11, pollution: 0, pollutionHigh: false, warFactionIds: [7] }],
      unknownMaps: 1,
    });
  });

  it("같은 2차맵 줄이면 위험 없음·모르는 것 없음", () => {
    expect(
      travelDangers([10], {
        knownMap: () => false,
        pollution: new Map(),
        knownCities: [],
        enemies: new Set(),
        territory: new Map(),
        threshold: 0,
      }),
    ).toEqual({ dangers: [], unknownMaps: 0 });
  });
});
