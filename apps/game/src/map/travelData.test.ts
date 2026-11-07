// 2차맵 사이 이동 도우미 시험(docs/adr/2026-11-07-play-flow.md "WP9") — 걸리는 시간 문구(기본 언어 한국어), 거리, 내 유닛의 길·목적 2차맵,
// 보낼 수 없는 까닭·멈춘 까닭 문구(모든 코드가 문구를 가진다)
import { TRAVEL_RESULT_CODES } from "@terra/protocol";
import type { WorldTravel } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import {
  durationText,
  kmText,
  travelOf,
  travelProblemText,
  travelStopText,
  travelTarget,
} from "./travelData.ts";

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
    ...overrides,
  };
}

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
    for (const problem of ["no_cyborg", "offline", "timeout"] as const)
      expect(travelProblemText(problem).length).toBeGreaterThan(0);
    expect(travelProblemText("no_route")).toBe("그곳까지 이어진 2차맵이 아직 열려 있지 않습니다.");
    for (const stop of ["cancelled", "interrupted", "blocked", "unavailable"] as const)
      expect(travelStopText(stop).length).toBeGreaterThan(0);
  });
});
