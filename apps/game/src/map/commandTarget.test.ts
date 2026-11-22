// 1차맵 명령 판 대상·보낼 유닛 시험(바뀜 2026-11-09 "1차맵에서 해당지역으로 이동", 기본 언어 한국어) — 도시 대상의 처음 명령,
// 고른 지역에 [이곳으로 이동]을 띄울지(바다·내 사이보그 2차맵·보낼 유닛 없음), 고른 지역 이름(그 2차맵 도시 > 땅 이름), 보낼 수 있는 유닛
import type { MapUnit } from "@terra/shared/mapUnits";
import type { WorldMapCity, WorldMapFaction } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import {
  areaCheck,
  areaCheckText,
  areaTarget,
  cityTarget,
  commandKey,
  sendableUnits,
} from "./commandTarget.ts";

const FACTIONS: WorldMapFaction[] = [
  { id: 1, code: "s3_test_npc", kind: "npc", name: { ko: "시험 NPC 세력", en: "Test NPC faction" } },
];

function city(overrides: Partial<WorldMapCity>): WorldMapCity {
  return {
    id: 3,
    factionId: 1,
    number: 2,
    name: null,
    mapKey: 1000,
    face: 0,
    i: 282,
    j: 328,
    cellX: 120,
    cellY: 131,
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

function unit(overrides: Partial<MapUnit>): MapUnit {
  return {
    unitId: 7,
    kind: "human",
    name: null,
    cellX: 1,
    cellY: 2,
    moving: false,
    job: null,
    injury: 0,
    hold: null,
    ...overrides,
  };
}

const PLACE = { mapKey: 2000, x: 40, y: 200 };

describe("도시 대상", () => {
  it("시청 칸, 볼 수 있으면 이동·볼 수 없으면 정찰이 먼저", () => {
    expect(cityTarget(city({}), FACTIONS)).toEqual({
      mapKey: 1000,
      x: 120,
      y: 131,
      cityId: 3,
      factionId: 1,
      label: "시험 NPC 세력 도시 2",
      order: "move",
    });
    expect(cityTarget(city({ viewable: false, name: "바람골" }), FACTIONS)).toMatchObject({
      label: "바람골",
      order: "scout",
    });
  });
});

describe("고른 지역에 [이곳으로 이동]을 띄울지", () => {
  it("다른 2차맵의 땅이면 띄운다", () => {
    expect(areaCheck(PLACE, false, 1000)).toEqual({ kind: "ok", place: PLACE });
  });
  it("누른 칸이 없으면 감추고 까닭도 없다", () => {
    const check = areaCheck(null, false, 1000);
    expect(check).toEqual({ kind: "none" });
    expect(areaCheckText(check)).toBeNull();
  });
  it("바다는 감추고 까닭을 말한다(보낼 유닛보다 먼저)", () => {
    const check = areaCheck(PLACE, true, null);
    expect(check).toEqual({ kind: "sea" });
    expect(areaCheckText(check)).toBe("바다로는 걸어갈 수 없습니다.");
  });
  it("내 사이보그가 이미 있는 2차맵이면 감추고 2차맵에서 걸어가라고 한다", () => {
    const check = areaCheck(PLACE, false, 2000);
    expect(check).toEqual({ kind: "same_map" });
    expect(areaCheckText(check)).toBe("내 사이보그가 이미 이 2차맵에 있습니다. 2차맵에서 걸어가세요.");
  });
  it("보낼 유닛(내 사이보그)이 없으면 감춘다", () => {
    const check = areaCheck(PLACE, false, null);
    expect(check).toEqual({ kind: "no_unit" });
    expect(areaCheckText(check)).toBeNull();
  });
});

describe("고른 지역 대상", () => {
  it("도시가 없는 2차맵: 고른 배치 칸, 땅 이름, 이동이 먼저, 국가 없음", () => {
    expect(areaTarget(PLACE, [city({})], FACTIONS, "열대우림")).toEqual({
      mapKey: 2000,
      x: 40,
      y: 200,
      cityId: null,
      factionId: null,
      label: "고른 지역 · 열대우림",
      order: "move",
    });
    expect(areaTarget(PLACE, [], FACTIONS, null).label).toBe("고른 지역");
  });
  it("그 2차맵에 도시가 있으면 도시 이름·국가(칸은 고른 곳 그대로, 볼 수 없어도 이동이 먼저)", () => {
    const target = areaTarget(PLACE, [city({ mapKey: 2000, viewable: false })], FACTIONS, "초원");
    expect(target).toMatchObject({ x: 40, y: 200, cityId: 3, factionId: 1, order: "move" });
    expect(target.label).toBe("시험 NPC 세력 도시 2");
  });
  it("판 열쇠는 2차맵·칸이 바뀌면 바뀐다", () => {
    expect(commandKey(PLACE)).toBe("2000:40,200");
    expect(commandKey({ ...PLACE, x: 41 })).not.toBe(commandKey(PLACE));
  });
});

describe("보낼 수 있는 유닛", () => {
  it("명령할 수 없는 유닛(수호신·포로·중태)은 빼고 차례는 그대로", () => {
    const units = [
      unit({ unitId: 1, kind: "cyborg_body", name: "레온" }),
      unit({ unitId: 2, kind: "human", hold: "guardian" }),
      unit({ unitId: 3, hold: "captive" }),
      unit({ unitId: 4, hold: "critical", injury: 3 }),
      unit({ unitId: 5, injury: 1, moving: true }),
      unit({ unitId: 6, kind: "test_unit" }),
    ];
    expect(sendableUnits(units).map((entry) => entry.unitId)).toEqual([1, 5, 6]);
  });
});
