import type { WorldMapCity, WorldMapHull } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import { territoryAt } from "./territoryPick.ts";

/** 1000분율 칸 → 라디안 환산(1 라디안 = 1,000,000 → 반경 17,453 = 1°) */
const MILLI_PER_RADIAN = 1_000_000;
const DEG = Math.round((Math.PI / 180) * MILLI_PER_RADIAN);

const city = (
  id: number,
  factionId: number,
  latDeg: number,
  lonDeg: number,
  radiusDeg: number,
): WorldMapCity => ({
  id,
  factionId,
  number: 1,
  name: null,
  mapKey: 0,
  face: 0,
  i: 0,
  j: 0,
  cellX: 0,
  cellY: 0,
  latDeg,
  lonDeg,
  start: false,
  grade: 1,
  radiusMilli: radiusDeg * DEG,
  loaded: false,
  viewable: false,
  land: null,
});

describe("영토 레이어 누른 곳의 국가", () => {
  const cities = [city(1, 10, 0, 0, 2), city(2, 20, 0, 3, 2), city(3, 20, 10, 10, 0)];
  const hulls: WorldMapHull[] = [
    {
      factionId: 20,
      points: [
        [8, 8],
        [8, 14],
        [14, 14],
        [14, 8],
      ],
    },
  ];

  it("영향권 안이면 (거리 ÷ 반경)이 가장 작은 도시", () => {
    expect(territoryAt(0, 0.5, cities, hulls, MILLI_PER_RADIAN)).toEqual({ factionId: 10, cityId: 1 });
    expect(territoryAt(0, 2.2, cities, hulls, MILLI_PER_RADIAN)).toEqual({ factionId: 20, cityId: 2 });
  });

  it("영향권 밖이면 껍질(꼭짓점 차례와 상관없이), 그 국가의 가장 가까운 도시", () => {
    expect(territoryAt(11, 11, cities, hulls, MILLI_PER_RADIAN)).toEqual({ factionId: 20, cityId: 3 });
    const points = hulls[0]?.points ?? [];
    const reversed: WorldMapHull[] = [{ factionId: 20, points: points.toReversed() }];
    expect(territoryAt(11, 11, cities, reversed, MILLI_PER_RADIAN)?.factionId).toBe(20);
  });

  it("어디에도 없으면 null, 환산이 0이면 영향권을 보지 않는다", () => {
    expect(territoryAt(-30, 60, cities, hulls, MILLI_PER_RADIAN)).toBeNull();
    expect(territoryAt(0, 0.5, cities, [], 0)).toBeNull();
  });
});
