// 도시 화면 줄 만들기 시험 — 시설 무리(건물 그림 모델에서), 차례(무리 → 거리 → 이름 → ID), 거르기·수
import type { BuildingFootprint } from "@terra/engine";
import type { MapBuildingLook } from "@terra/shared/mapLooks";
import { describe, expect, it } from "vitest";
import { buildCityRows, cityCounts, filterCityRows, governmentOf, groupOf } from "./cityRows.ts";

const building = (id: number, cellX: number, cellY: number): BuildingFootprint => ({
  id,
  cellX,
  cellY,
  width: 2,
  depth: 2,
  rotation: 0,
  heightM: 4,
});

const look = (buildingId: number, facilityId: string | null, extra: Partial<MapBuildingLook> = {}) =>
  ({
    buildingId,
    facilityId,
    level: 1,
    state: "ok",
    upgrading: false,
    factionId: null,
    mine: false,
    ...extra,
  }) satisfies MapBuildingLook;

describe("groupOf", () => {
  it("팩 모델이 있으면 모델로, 없으면 시설 ID의 기본 모델로 무리를 정한다", () => {
    expect(groupOf(look(1, "mine"))).toBe("gather");
    expect(groupOf(look(1, "ranch", { art: { model: "ranch" } }))).toBe("gather");
    expect(groupOf(look(1, "warehouse"))).toBe("storage");
    expect(groupOf(look(1, "smelter"))).toBe("craft");
    expect(groupOf(look(1, "government_hall"))).toBe("civic");
    expect(groupOf(look(1, "lodging", { art: { model: "house" } }))).toBe("housing");
  });
  it("시설이 없거나 모르는 시설(엔진이 일반 집으로 그림)은 그 밖", () => {
    expect(groupOf(undefined)).toBe("other");
    expect(groupOf(look(1, null))).toBe("other");
    expect(groupOf(look(1, "city_wall"))).toBe("other");
  });
});

describe("buildCityRows", () => {
  const looks = new Map<number, MapBuildingLook>([
    [1, look(1, "warehouse", { name: { ko: "중앙창고", en: "Warehouse" }, mine: true })],
    [2, look(2, "mine", { name: { ko: "광산", en: "Mine" }, level: 2 })],
    [3, look(3, "farm", { name: { ko: "농장", en: "Farm" } })],
    [4, look(4, "government_hall", { name: { ko: "행정 건물", en: "Town hall" } })],
  ]);
  const buildings = [
    building(1, 0, 0),
    building(2, 40, 0),
    building(3, 10, 0),
    building(4, 5, 5),
    building(5, 1, 1),
  ];

  it("무리 차례, 무리 안에서는 기준점에서 가까운 차례", () => {
    const rows = buildCityRows({ buildings, looks, at: { x: 0, y: 0 }, locale: "ko" });
    expect(rows.map((row) => row.id)).toEqual([3, 2, 1, 4, 5]);
    expect(rows[1]).toMatchObject({ name: "광산", level: 2, group: "gather", mine: false });
    expect(rows[4]).toMatchObject({ name: null, level: null, group: "other" });
  });

  it("기준점이 없으면 이름 차례, 영어 이름", () => {
    const rows = buildCityRows({ buildings, looks, at: null, locale: "en" });
    expect(rows.slice(0, 2).map((row) => row.name)).toEqual(["Farm", "Mine"]);
    expect(rows[0]?.cells).toBeNull();
  });

  it("거르기·수·행정 건물", () => {
    const rows = buildCityRows({ buildings, looks, at: null, locale: "ko" });
    expect(filterCityRows(rows, "mine").map((row) => row.id)).toEqual([1]);
    expect(filterCityRows(rows, "gather").map((row) => row.id)).toEqual([2, 3]); // 광산 < 농장(가나다)
    expect(cityCounts(rows)).toMatchObject({ all: 5, mine: 1, gather: 2, storage: 1, civic: 1, other: 1 });
    expect(governmentOf(rows)?.id).toBe(4);
  });
});
