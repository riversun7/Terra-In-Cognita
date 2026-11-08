// NPC 국가 지도자 씨앗 시험 — docs/adr/2026-11-07-play-flow.md "WP-NPC". 수도 = 가장 작은 ID 시작 도시, 행정 건물 곁에 하나, 멱등.
import { anchorAt } from "@terra/sim";
import { afterEach, describe, expect, it } from "vitest";
import type { CityRow } from "../world/cities.ts";
import { createTestMap } from "../world/testSupport.ts";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import { capitalsOf, leaderUnitOf, seedNationLeaders } from "./leaders.ts";

const PLANET = "s2_test_planet";
const city = (id: number, factionId: number, mapKey: number, start = true): CityRow => ({
  id,
  factionId,
  planetId: PLANET,
  mapKey,
  cellX: 128,
  cellY: 128,
  start,
});

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

describe("capitalsOf", () => {
  it("국가마다 그 행성 시작 도시 가운데 가장 작은 ID(마을·다른 행성은 빼고)", () => {
    const capitals = capitalsOf(
      [
        city(5, 1, 9),
        city(3, 1, 9),
        city(4, 2, 9),
        city(1, 2, 9, false),
        { ...city(2, 3, 9), planetId: "x" },
      ],
      PLANET,
    );
    expect([...capitals].map(([faction, row]) => [faction, row.id])).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });
});

describe("seedNationLeaders", () => {
  it("수도 행정 건물 곁에 지도자 하나(종류 7, 주인 = 국가 주체), 다시 불러도 더 세우지 않는다", () => {
    const { map } = createTestMap({ mapKey: 9 });
    stops.push(() => map.stop());
    // 수도(도시 3)의 행정 건물과 같은 2차맵 다른 도시의 행정 건물
    expect(map.placeBuilding({ x: 140, y: 120, width: 6, height: 6, rotation: 0 }, 101)).toEqual({
      ok: true,
      buildingId: 1,
    });
    expect(map.placeBuilding({ x: 60, y: 60, width: 6, height: 6, rotation: 0 }, 101)).toEqual({
      ok: true,
      buildingId: 2,
    });
    const facilities = new Map([
      [1, { facilityId: "government_hall", cityId: 3 }],
      [2, { facilityId: "government_hall", cityId: 7 }],
    ]);
    let next = 500;
    const input = {
      maps: new Map([[9, map]]),
      cities: [city(7, 1, 9), city(3, 1, 9)],
      planetId: PLANET,
      ownerOfFaction: (factionId: number) => (factionId === 1 ? 101 : undefined),
      facilities,
      nextUnitId: () => {
        next += 1;
        return next;
      },
    };
    expect(seedNationLeaders(input)).toEqual({ placed: 1, missing: 0 });
    const unit = map.unitInfo(501);
    expect(unit?.kind).toBe(UNIT_KIND_NPC_LEADER);
    expect(unit?.ownerId).toBe(101);
    // 행정 건물(기준 칸 140,120) 바로 곁
    const cell = anchorAt(unit?.motion.waypoints[0] ?? { x: 0, y: 0 }, 1);
    expect(Math.max(Math.abs(cell.x - 140), Math.abs(cell.y - 120))).toBeLessThanOrEqual(2);
    expect(leaderUnitOf([map], 101)).toBe(501);
    // 멱등: 이미 있으면 그대로
    expect(seedNationLeaders(input)).toEqual({ placed: 0, missing: 0 });
    expect(next).toBe(501);
  });

  it("수도 2차맵을 띄우지 않았으면 missing, 소유 주체가 없는 국가는 건너뛴다, 행정 건물이 없으면 시청 칸 둘레", () => {
    const { map } = createTestMap({ mapKey: 9 });
    stops.push(() => map.stop());
    let next = 0;
    const result = seedNationLeaders({
      maps: new Map([[9, map]]),
      cities: [city(1, 1, 77), city(2, 2, 9), city(3, 3, 9)],
      planetId: PLANET,
      ownerOfFaction: (factionId) => (factionId === 3 ? undefined : 100 + factionId),
      facilities: new Map(),
      nextUnitId: () => {
        next += 1;
        return next;
      },
    });
    expect(result).toEqual({ placed: 1, missing: 1 });
    const cell = anchorAt(map.unitInfo(1)?.motion.waypoints[0] ?? { x: 0, y: 0 }, 1);
    expect(cell).toEqual({ x: 128, y: 128 });
    expect(map.unitInfo(1)?.ownerId).toBe(102);
  });
});
