import type { WorldMapBeacon, WorldMapCity } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import { territoryAtWorld } from "./territoryPick.ts";

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

/** 누른 곳의 국가(world.cities 응답 모양, 비콘·표시 값은 없으면 출발값) */
const territoryAt = (
  latDeg: number,
  lonDeg: number,
  cities: readonly WorldMapCity[],
  milliPerRadian: number,
  beacons: readonly WorldMapBeacon[] = [],
) => territoryAtWorld(latDeg, lonDeg, { cities, milliPerRadian, beacons });

describe("영토 레이어 누른 곳의 국가(그린 영토와 같은 규칙)", () => {
  it("원 크기가 같으면 다른 국가 원이 겹친 곳은 두 도시의 가운데가 경계(영향력 비율)", () => {
    const cities = [city(1, 10, 0, 0, 2), city(2, 20, 0, 3, 2)];
    expect(territoryAt(0, 1.4, cities, MILLI_PER_RADIAN)).toEqual({ factionId: 10, cityId: 1 });
    expect(territoryAt(0, 1.6, cities, MILLI_PER_RADIAN)).toEqual({ factionId: 20, cityId: 2 });
  });

  it("배후지 반경이 있으면 그 원 × 2(영향권 반경보다 넓다)", () => {
    const cities = [city(1, 10, 0, 0, 0.1, 2)];
    expect(territoryAt(0, 3.5, cities, MILLI_PER_RADIAN)).toEqual({ factionId: 10, cityId: 1 });
    expect(territoryAt(0, 4.5, cities, MILLI_PER_RADIAN)).toBeNull();
  });

  it("같은 국가 두 도시 사이(원 밖) 땅도 그 국가 — 질문 1437 답", () => {
    // 환산 200,000: 12칸 = 0.06 라디안(3.44°) → 3° 떨어진 두 도시를 잇는다. 화면 반지름 = max(0.5° × 2, 4칸 = 1.15°) = 1.15°
    const perRadian = 200_000;
    const milli = Math.round(0.5 * (Math.PI / 180) * perRadian);
    const near = [
      { ...city(1, 10, 0, 0, 0), radiusMilli: milli },
      { ...city(2, 10, 0, 3, 0), radiusMilli: milli },
    ];
    expect(territoryAt(0, 1.5, near, perRadian)).toEqual({ factionId: 10, cityId: 1 });
    expect(territoryAt(1, 1.5, near, perRadian)?.factionId).toBe(10);
    expect(territoryAt(3, 1.5, near, perRadian)).toBeNull();
  });

  it("어디에도 없으면 null, 환산이 0이면 영토가 없다", () => {
    const cities = [city(1, 10, 0, 0, 2)];
    expect(territoryAt(-30, 60, cities, MILLI_PER_RADIAN)).toBeNull();
    expect(territoryAt(0, 0.5, cities, 0)).toBeNull();
  });

  it("영향력 비율: 원이 큰 도시가 가운데보다 더 가진다(D-546 1432)", () => {
    // 국가 10 배후지 2° → 원 4°, 국가 20 배후지 1° → 원 2°. 5° 떨어짐: 경계는 거리 비 4:2 → 10에서 3.33°
    const cities = [city(1, 10, 0, 0, 0.1, 2), city(2, 20, 0, 5, 0.1, 1)];
    expect(territoryAt(0, 3.1, cities, MILLI_PER_RADIAN)?.factionId).toBe(10);
    expect(territoryAt(0, 3.6, cities, MILLI_PER_RADIAN)?.factionId).toBe(20);
  });

  it("도시 소유 비콘은 그 도시 외곽선을 비콘까지 넓힌다 — 누르면 기준 도시 지방(D-546 1434)", () => {
    // 원 4°(배후지 2°). 비콘은 동쪽 9°(잇기 상한과 상관없이 기준 도시와 잇는다), 둘레 여유 2칸 = 0.115°
    const cities = [city(1, 10, 0, 0, 0.1, 2)];
    const beacon: WorldMapBeacon = { id: 7, factionId: 10, cityId: 1, latDeg: 0, lonDeg: 9 };
    expect(territoryAt(0, 7, cities, MILLI_PER_RADIAN)).toBeNull();
    expect(territoryAt(0, 7, cities, MILLI_PER_RADIAN, [beacon])).toEqual({ factionId: 10, cityId: 1 });
    expect(territoryAt(0, 9, cities, MILLI_PER_RADIAN, [beacon])).toEqual({ factionId: 10, cityId: 1 });
    expect(territoryAt(0, 9.5, cities, MILLI_PER_RADIAN, [beacon])).toBeNull();
    // 기준 도시를 모르는(목록에 없는) 비콘은 그리지 않는다
    const orphan: WorldMapBeacon = { ...beacon, cityId: 99 };
    expect(territoryAt(0, 9, cities, MILLI_PER_RADIAN, [orphan])).toBeNull();
  });
});
