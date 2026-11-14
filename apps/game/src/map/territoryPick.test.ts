import type { WorldMapCity } from "@terra/shared/worldMap";
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
  catchmentDeg?: number,
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
  ...(catchmentDeg === undefined ? {} : { catchmentMilli: catchmentDeg * DEG }),
  loaded: false,
  viewable: false,
  land: null,
});

describe("영토 레이어 누른 곳의 국가(그린 영토와 같은 규칙)", () => {
  it("원이 덮는 도시 가운데 가장 가까운 도시 — 다른 국가 원이 겹친 곳은 두 도시의 가운데가 경계", () => {
    const cities = [city(1, 10, 0, 0, 2), city(2, 20, 0, 3, 2)];
    expect(territoryAt(0, 1.4, cities, MILLI_PER_RADIAN)).toEqual({ factionId: 10, cityId: 1 });
    expect(territoryAt(0, 1.6, cities, MILLI_PER_RADIAN)).toEqual({ factionId: 20, cityId: 2 });
  });

  it("배후지 반경이 있으면 그 원(영향권 반경보다 넓다)", () => {
    const cities = [city(1, 10, 0, 0, 0.1, 2)];
    expect(territoryAt(0, 1.5, cities, MILLI_PER_RADIAN)).toEqual({ factionId: 10, cityId: 1 });
  });

  it("같은 국가 두 도시 사이(원 밖) 땅도 그 국가 — 질문 1437 답", () => {
    // 1° = 17,453 1000분율 칸 → 잇기 상한 12칸 = 0.000688° … 시험 환산에서는 12칸이 아주 작아, 환산을 작게 해 12칸 = 몇 도로 맞춘다
    const perRadian = 2_000; // 12칸 = 6 라디안 → 모두 잇는다
    const milli = Math.round((Math.PI / 180) * perRadian);
    const near = [
      { ...city(1, 10, 0, 0, 0), radiusMilli: milli },
      { ...city(2, 10, 0, 4, 0), radiusMilli: milli },
    ];
    expect(territoryAt(0, 2, near, perRadian)).toEqual({ factionId: 10, cityId: 1 });
    expect(territoryAt(3, 2, near, perRadian)).toBeNull();
  });

  it("어디에도 없으면 null, 환산이 0이면 영토가 없다", () => {
    const cities = [city(1, 10, 0, 0, 2)];
    expect(territoryAt(-30, 60, cities, MILLI_PER_RADIAN)).toBeNull();
    expect(territoryAt(0, 0.5, cities, 0)).toBeNull();
  });
});
