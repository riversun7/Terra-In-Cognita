// 2차맵 사이 이동 도우미 시험(docs/adr/2026-11-07-play-flow.md "WP9"·"WP11") — 걸리는 시간 문구(기본 언어 한국어), 거리, 내 유닛의 길·목적 2차맵,
// 보낼 수 없는 까닭·멈춘 까닭 문구(모든 코드가 문구를 가진다), 위험·비용 줄(594 나), 가는 중 줄(건너뜀·정찰 돌아옴), 가는 동안 내 자리
// 표시(1차맵)·명령 판을 닫는 알림
import { TRAVEL_RESULT_CODES } from "@terra/protocol";
import type { WorldMapFaction, WorldPosition, WorldTravel } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import {
  dangerLines,
  durationText,
  goingText,
  kmText,
  travelOf,
  travelProblemText,
  travelStopText,
  travelTarget,
} from "./travelData.ts";
import { liveMe, reachedMap } from "./useMyTravel.ts";

function travel(overrides: Partial<WorldTravel>): WorldTravel {
  return {
    unitId: 7,
    kind: "scout",
    route: [10, 11, 12],
    leg: 0,
    mapKey: 10,
    cellX: 1,
    cellY: 2,
    latDeg: 0,
    lonDeg: 0,
    targetX: 30,
    targetY: 40,
    startedAt: 0,
    arriveAt: 1,
    state: "going",
    stop: null,
    returning: false,
    scoutedMapKey: null,
    hidden: false,
    ...overrides,
  };
}

const FACTIONS: WorldMapFaction[] = [
  { id: 4, code: "agri", kind: "npc", name: { ko: "농업국", en: "Farmland" } },
  { id: 5, code: null, kind: "npc", name: null },
];

describe("2차맵 사이 이동 문구", () => {
  it("걸리는 시간: 1분 안·분·시간·시간 분(올림)", () => {
    expect(durationText(30_000)).toBe("1분 안");
    expect(durationText(-5)).toBe("1분 안");
    expect(durationText(20 * 60_000 + 1)).toBe("약 21분");
    expect(durationText(60 * 60_000)).toBe("약 1시간");
    expect(durationText(95 * 60_000)).toBe("약 1시간 35분");
  });

  it("거리: 10km 안은 소수 한 자리", () => {
    expect(kmText(2_816)).toBe("2.8");
    expect(kmText(15_400)).toBe("15");
  });

  it("내 유닛의 길과 목적 2차맵", () => {
    const list = [travel({ unitId: 3 }), travel({ unitId: 7, route: [5, 6] })];
    expect(travelOf(list, 7)?.route).toEqual([5, 6]);
    expect(travelOf(list, 9)).toBeNull();
    expect(travelTarget(travel({}))).toBe(12);
  });

  it("모든 결과 코드·확인 문제·멈춘 까닭에 문구가 있다", () => {
    for (const code of TRAVEL_RESULT_CODES) expect(travelProblemText(code).length).toBeGreaterThan(0);
    for (const problem of ["no_cyborg", "offline", "timeout", "in_transit", "map_full"] as const)
      expect(travelProblemText(problem).length).toBeGreaterThan(0);
    expect(travelProblemText("no_route")).toBe("그곳은 너무 멀어 한 번에 보낼 수 없습니다.");
    // WP15: 서버가 더 띄울 수 없을 때(확인 단계·닿을 때)는 "다시 해 보세요"와 다른 까닭
    expect(travelProblemText("map_full")).not.toBe(travelProblemText("busy"));
    for (const stop of [
      "cancelled",
      "interrupted",
      "blocked",
      "unavailable",
      "raided",
      "encounter",
      "map_full",
    ] as const)
      expect(travelStopText(stop).length).toBeGreaterThan(0);
  });
});

describe("WP11 확인 단계·가는 중", () => {
  it("594 나: 비용(걷기)·위험 구간(2차맵 몇 번째·오염·전쟁 세력, 두 줄까지 + N곳 더)·모르는 2차맵", () => {
    expect(dangerLines({ cost: "walk", dangers: [], unknownMaps: 0 }, FACTIONS)).toEqual([
      { text: "비용: 없음(걸어서 감)", danger: false },
      { text: "알려진 위험 구간이 없습니다.", danger: false },
    ]);
    const lines = dangerLines(
      {
        cost: "walk",
        dangers: [
          { leg: 1, mapKey: 11, pollution: 2500, pollutionHigh: true, warFactionIds: [] },
          { leg: 2, mapKey: 12, pollution: null, pollutionHigh: false, warFactionIds: [4] },
          { leg: 3, mapKey: 13, pollution: 9000, pollutionHigh: true, warFactionIds: [4] },
        ],
        unknownMaps: 2,
      },
      FACTIONS,
    );
    expect(lines.map((line) => line.text)).toEqual([
      "비용: 없음(걸어서 감)",
      "위험: 2차맵 2번째 · 오염 2,500",
      "위험: 2차맵 3번째 · 나와 전쟁 중: 농업국",
      "위험 구간 1곳 더",
      "모르는 2차맵 2장은 위험을 알 수 없습니다.",
    ]);
    expect(lines.map((line) => line.danger)).toEqual([false, true, true, true, false]);
  });

  it("가는 중 줄: 건너뛰는 중 > 정찰이 돌아오는 중 > 가는 중", () => {
    expect(goingText(travel({ leg: 1 }))).toBe("가는 중: 2차맵 2/3");
    expect(goingText(travel({ returning: true }))).toBe("정찰을 마치고 돌아오는 중: 2차맵 1/3");
    expect(goingText(travel({ hidden: true, returning: true, leg: 1 }))).toBe(
      "열리지 않은 2차맵을 지나는 중: 2/3",
    );
  });

  it("가는 동안 1차맵 내 자리 = 길의 지금 자리, 끝나면 받은 자리 그대로", () => {
    const me: WorldPosition = {
      planetId: "s2_test_planet",
      mapKey: 10,
      face: 0,
      i: 1,
      j: 2,
      cellX: 1,
      cellY: 2,
      latDeg: 5,
      lonDeg: 6,
      unitId: 7,
      startCityId: 3,
      hidden: false,
    };
    expect(liveMe(me, travel({ mapKey: 11, latDeg: 5.5, lonDeg: 6.5, hidden: true }))).toMatchObject({
      mapKey: 11,
      latDeg: 5.5,
      lonDeg: 6.5,
      hidden: true,
    });
    expect(liveMe(me, travel({ state: "arrived", latDeg: 9 }))).toBe(me);
    expect(liveMe(me, travel({ unitId: 8 }))).toBe(me);
    expect(liveMe(null, travel({}))).toBeNull();
  });

  it("명령 판을 닫는 2차맵: 도착한 목적지(돌아온 정찰은 아님)·정찰이 보고 돌아선 2차맵", () => {
    expect(reachedMap({ kind: "ended", travel: travel({ state: "arrived" }) })).toBe(12);
    expect(reachedMap({ kind: "ended", travel: travel({ state: "arrived", returning: true }) })).toBeNull();
    expect(reachedMap({ kind: "ended", travel: travel({ state: "stopped" }) })).toBeNull();
    expect(reachedMap({ kind: "ended", travel: null })).toBeNull();
    expect(reachedMap({ kind: "scouted", travel: travel({ returning: true, scoutedMapKey: 11 }) })).toBe(11);
  });
});
