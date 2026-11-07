// 지도 흐름 도우미 시험(docs/adr/2026-11-07-play-flow.md "WP2") — 주소 ?key= 읽기, 국가 색·이름, 들어가기 상태, 2차맵 화면이 열 맵 고르기,
// 둘레 땅 문구(기본 언어 한국어), 1차맵 ↔ 2차맵 전환 대상, 영향권 원 점, 시작 도시 지도 처음 보기
import type { WorldMapCity, WorldMapFaction, WorldPositionResponse } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import { mapSwitchTarget } from "../shell/MapSwitch.tsx";
import { circlePoints } from "./CityOverlay.tsx";
import { landText, waterFeatures } from "./landText.ts";
import { chooseMapTarget, formatAtParam, needsCities, parseAtParam } from "./mapTarget.ts";
import { clusterView, focusView } from "./planetFocus.ts";
import {
  cityLabel,
  enterStateOf,
  enterableAt,
  factionColor,
  factionName,
  parseMapKey,
} from "./worldMapData.ts";

const FACTIONS: WorldMapFaction[] = [
  { id: 1, code: "s3_test_npc", kind: "npc", name: { ko: "시험 NPC 세력", en: "Test NPC faction" } },
  { id: 7, code: "npc_nation_02", kind: "npc", name: null },
];

function city(overrides: Partial<WorldMapCity>): WorldMapCity {
  return {
    id: 1,
    factionId: 1,
    number: 1,
    name: null,
    mapKey: 1000,
    face: 0,
    i: 282,
    j: 328,
    cellX: 128,
    cellY: 128,
    latDeg: 10,
    lonDeg: 20,
    start: true,
    grade: 1,
    radiusMilli: 3000,
    loaded: true,
    viewable: true,
    land: null,
    ...overrides,
  };
}

const position = (overrides: Partial<WorldPositionResponse> = {}): WorldPositionResponse => ({
  status: "ready",
  position: {
    planetId: "s2_test_planet",
    mapKey: 500,
    face: 0,
    i: 1,
    j: 2,
    cellX: 120,
    cellY: 131,
    latDeg: 1,
    lonDeg: 2,
    unitId: 77,
    startCityId: 3,
    hidden: false,
  },
  fallbackMapKey: 400,
  generatedAt: 0,
  ...overrides,
});

describe("주소 ?key=", () => {
  it("10진 셀 키만 받는다(앞자리 0·부호·소수·너무 큰 값은 null)", () => {
    expect(parseMapKey("123456")).toBe(123456);
    expect(parseMapKey("0")).toBe(0);
    for (const bad of [undefined, null, "", "007", "-1", "1.5", "1e3", "abc", "99999999999999999"])
      expect(parseMapKey(bad)).toBeNull();
  });
});

describe("국가 색·이름·도시 이름", () => {
  it("색은 응답 차례대로 0 ~ 5를 돌려 쓰고, 모르면 0", () => {
    expect(factionColor(FACTIONS, 1)).toBe(0);
    expect(factionColor(FACTIONS, 7)).toBe(1);
    expect(factionColor(FACTIONS, 99)).toBe(0);
    const many = Array.from(
      { length: 8 },
      (_, index): WorldMapFaction => ({ id: index + 10, code: null, kind: "npc", name: null }),
    );
    expect(factionColor(many, 16)).toBe(0);
  });

  it("이름이 없으면 코드, 코드도 없으면 #ID", () => {
    expect(factionName(FACTIONS, 1)).toBe("시험 NPC 세력");
    expect(factionName(FACTIONS, 7)).toBe("npc_nation_02");
    expect(factionName(FACTIONS, 42)).toBe("#42");
    expect(cityLabel(FACTIONS, city({ number: 3 }))).toBe("시험 NPC 세력 도시 3");
    // 팩 도시 이름이 있으면 그 이름(번역하지 않는다, D-476·기획 답 510 다)
    expect(cityLabel(FACTIONS, city({ number: 3, name: "Verdane" }))).toBe("Verdane");
  });
});

describe("들어가기", () => {
  it("띄운 맵이고 볼 수 있어야 들어간다", () => {
    expect(enterStateOf({ loaded: true, viewable: true })).toBe("enter");
    expect(enterStateOf({ loaded: true, viewable: false })).toBe("not_visible");
    expect(enterStateOf({ loaded: false, viewable: false })).toBe("not_loaded");
  });

  it("가운데 2차맵 키의 들어갈 수 있는 도시", () => {
    const list = [city({ id: 1, mapKey: 5, viewable: false }), city({ id: 2, mapKey: 6 })];
    expect(enterableAt(list, 5)).toBeNull();
    expect(enterableAt(list, 6)?.id).toBe(2);
    expect(enterableAt(list, 7)).toBeNull();
  });
});

describe("2차맵 화면이 열 맵", () => {
  it("주소 키 > 내 사이보그 맵 > 띄운 첫 맵, 카메라는 그 맵에 내가 있을 때만", () => {
    const mine = { unitId: 77, cellX: 120, cellY: 131, source: "cyborg" };
    expect(chooseMapTarget("500", position())).toEqual({
      kind: "ready",
      mapKey: 500,
      focus: mine,
      cyborg: mine,
    });
    expect(chooseMapTarget("600", position())).toEqual({
      kind: "ready",
      mapKey: 600,
      focus: null,
      cyborg: null,
    });
    expect(chooseMapTarget(undefined, position())).toMatchObject({ mapKey: 500, focus: { unitId: 77 } });
    expect(chooseMapTarget(undefined, position({ position: null }))).toEqual({
      kind: "ready",
      mapKey: 400,
      focus: null,
      cyborg: null,
    });
    expect(chooseMapTarget(undefined, position({ position: null, fallbackMapKey: null }))).toEqual({
      kind: "none",
    });
  });

  it("띄우지 않은 2차맵을 건너뛰는 중(WP11)이면 그 2차맵을 열지 않고 띄운 첫 맵, 주소 키 맵에도 내 사이보그 카메라 없음", () => {
    const away = position();
    const hidden = position({ position: away.position ? { ...away.position, hidden: true } : null });
    expect(chooseMapTarget(undefined, hidden)).toEqual({
      kind: "ready",
      mapKey: 400,
      focus: null,
      cyborg: null,
    });
    expect(chooseMapTarget("500", hidden)).toEqual({ kind: "ready", mapKey: 500, focus: null, cyborg: null });
  });

  it("내 자리를 받지 못하면: 주소 키가 있으면 그 맵(카메라 없이), 없으면 실패", () => {
    expect(chooseMapTarget("600", null)).toEqual({ kind: "ready", mapKey: 600, focus: null, cyborg: null });
    expect(chooseMapTarget(undefined, null)).toEqual({ kind: "failed" });
    expect(chooseMapTarget("x", null)).toEqual({ kind: "failed" });
  });

  it("내 사이보그가 없는 맵의 카메라(WP7, 515): ?at= > 그 2차맵 도시 시청(시작 도시 먼저) > 맵 가운데", () => {
    const cities = [
      city({ id: 9, mapKey: 600, start: false, cellX: 30, cellY: 40 }),
      city({ id: 12, mapKey: 600, start: true, cellX: 200, cellY: 210 }),
      city({ id: 3, mapKey: 700, cellX: 1, cellY: 2 }),
    ];
    expect(chooseMapTarget("600", position(), { at: "17,250", cities })).toMatchObject({
      focus: { unitId: null, cellX: 17, cellY: 250, source: "picked" },
    });
    expect(chooseMapTarget("600", position(), { cities })).toMatchObject({
      focus: { unitId: null, cellX: 200, cellY: 210, source: "city" },
    });
    expect(chooseMapTarget("800", position(), { cities })).toMatchObject({ mapKey: 800, focus: null });
    // 572 다: 내 사이보그가 있는 맵이어도 ?at=(1차맵에서 고른 곳)을 보고, 내 사이보그는 [내 사이보그] 단추로(cyborg)
    expect(chooseMapTarget("500", position(), { at: "1,1", cities })).toMatchObject({
      focus: { source: "picked", unitId: null, cellX: 1, cellY: 1 },
      cyborg: { source: "cyborg", unitId: 77 },
    });
    // 도시 목록이 필요한 때: 주소 맵에 내 사이보그가 없고 ?at=도 없을 때만
    expect(needsCities("600", undefined, position())).toBe(true);
    expect(needsCities("600", "3,4", position())).toBe(false);
    expect(needsCities("500", undefined, position())).toBe(false);
    expect(needsCities(undefined, undefined, position())).toBe(false);
  });

  it("?at= 읽기·쓰기: 0 ~ 255 정수 쌍만", () => {
    expect(parseAtParam("0,255")).toEqual({ x: 0, y: 255 });
    for (const bad of ["256,1", "-1,2", "01,2", "1.5,2", "1,2,3", "", "a,b"])
      expect(parseAtParam(bad)).toBeNull();
    expect(parseAtParam(undefined)).toBeNull();
    expect(formatAtParam(12.9, 200)).toBe("12,200");
  });
});

describe("둘레 땅 문구", () => {
  it("바이옴·높이, 숲·물, 기후", () => {
    const text = landText({
      biomeId: "temperate_forest",
      biomeName: { ko: "온대림", en: "Temperate forest" },
      elevationM: 123.6,
      temperatureC: 14.4,
      humidity: 128,
      precipitationMm: 812.2,
      water: 4 | 8,
      forest: 204,
    });
    expect(text.ground).toBe("온대림 · 높이 124m");
    expect(text.resources).toBe("숲 80% · 강 · 해안");
    expect(text.climate).toBe("14°C · 습도 50% · 강수 812mm");
  });

  it("숲이 거의 없고 물도 없으면 '눈에 띄는 것 없음', 이름이 없으면 바이옴 ID", () => {
    const text = landText({
      biomeId: "desert",
      biomeName: null,
      elevationM: 0,
      temperatureC: 30,
      humidity: 0,
      precipitationMm: 0,
      water: 0,
      forest: 5,
    });
    expect(text.ground).toBe("desert · 높이 0m");
    expect(text.resources).toBe("눈에 띄는 것 없음");
    expect(waterFeatures(1 | 2)).toEqual(["바다", "호수"]);
  });
});

describe("지도 전환·처음 보기", () => {
  it("1차맵 ↔ 2차맵 전환은 ?key=를 그대로 넘긴다", () => {
    expect(mapSwitchTarget("map", "123")).toEqual({ route: "map_planet", search: { key: "123" } });
    expect(mapSwitchTarget("map_planet", undefined)).toEqual({ route: "map" });
  });

  it("처음 볼 곳: 주소 키 > 내 자리, 둘 다 없으면 null", () => {
    expect(focusView(null, { latDeg: 3, lonDeg: 4 }, 1000)).toEqual({ latDeg: 3, lonDeg: 4, distanceM: 350 });
    expect(focusView(null, null, 1000)).toBeNull();
    expect(focusView(-5, { latDeg: 3, lonDeg: 4 }, 1000)).toMatchObject({ latDeg: 3, lonDeg: 4 });
  });

  it("묶음 다가가기: 거리 × 1/4, 거리를 모르면 그대로", () => {
    expect(clusterView({ latDeg: 1, lonDeg: 2 }, 400)).toEqual({ latDeg: 1, lonDeg: 2, distanceM: 100 });
    expect(clusterView({ latDeg: 1, lonDeg: 2 }, undefined)).toEqual({ latDeg: 1, lonDeg: 2 });
  });

  it("영향권 원 점은 가운데에서 같은 각도만큼 떨어져 있다", () => {
    const angle = 0.01;
    const rad = Math.PI / 180;
    for (const [lat, lon] of circlePoints(30, 40, angle, 8)) {
      const cos =
        Math.sin(30 * rad) * Math.sin(lat * rad) +
        Math.cos(30 * rad) * Math.cos(lat * rad) * Math.cos((lon - 40) * rad);
      expect(Math.acos(Math.min(1, cos))).toBeCloseTo(angle, 9);
    }
  });
});
