// 공성 전투맵 입력 = 실제 2차맵 배치(siegeLayout.ts) 시험 — 평평한 시험 2차맵에 NPC 시작 도시 기본 시설을 세우고 본다. 값은 형식 확인용이다.
import { START_WORLD_SEED, TEST_SOCIETY_COEFFICIENTS, createBattleMap, footprintRect } from "@terra/sim";
import { siegeArena, siegePlacer } from "@terra/sim/siegeArena";
import { afterEach, describe, expect, it } from "vitest";
import { type TestMap, createTestMap } from "../world/testSupport.ts";
import { facilityCatalogOf } from "./catalog.ts";
import { seedNpcFacilities } from "./npcSeed.ts";
import { beaconSiegeLayout, cityHall, citySiegeLayout } from "./siegeLayout.ts";
import type { FacilityRecord } from "./state.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

const catalog = facilityCatalogOf(() => TEST_FACILITY_SOURCE)();
const maps: TestMap[] = [];
afterEach(() => {
  for (const test of maps.splice(0)) test.map.stop();
});

function seededCity() {
  const test = createTestMap({ mapKey: 9 });
  maps.push(test);
  const records = new Map<number, FacilityRecord>();
  seedNpcFacilities({
    maps: new Map([[9, test.map]]),
    cities: [{ id: 1, factionId: 100, planetId: "p", mapKey: 9, cellX: 128, cellY: 128, start: true }],
    planetId: "p",
    ownerOfFaction: () => 7,
    service: {
      facilities: records,
      seedBuilt: (record: FacilityRecord) => records.set(record.buildingId, record),
    },
    catalog,
    seed: START_WORLD_SEED,
    nowMs: 1_000,
  });
  const source = { records, catalog, rules: TEST_SOCIETY_COEFFICIENTS, at: 1_000 };
  return { map: test.map, records, source };
}

describe("공성 전투맵 입력(실제 2차맵 배치)", () => {
  it("넥서스 = 그 도시 행정 건물 실제 칸, 다른 시설은 실제 칸의 장애물", () => {
    const { map, records, source } = seededCity();
    const hall = cityHall(map, source, 1, { x: 128, y: 128 });
    expect(hall).toBeDefined();
    expect(catalog.facility(records.get(hall?.id ?? 0)?.facilityId ?? "")?.stage).toBe("government");
    const layout = citySiegeLayout(map, 1, { x: 128, y: 128 }, source);
    expect(layout?.nexusSourceId).toBe(hall?.id);
    expect(layout?.nexus).toEqual(hall?.rect);
    if (!layout) return;
    const arena = siegeArena(layout, 128, 2000);
    const battleMap = createBattleMap(arena.map);
    // 시설마다 실제 칸이 그 전투 건물이다(창 원점만큼 옮김)
    let seen = 0;
    map.forEachBuilding((building) => {
      const rect = footprintRect(building.placement);
      const cell = (rect.y - arena.origin.y) * 128 + (rect.x - arena.origin.x);
      const id = battleMap.buildingAt[cell] ?? 0;
      expect(id).toBeGreaterThan(0);
      expect(arena.sources.get(id)).toBe(building.id);
      seen += 1;
    });
    expect(seen).toBe(arena.map.buildings.length);
    expect(seen).toBeGreaterThan(5);
    // 다른 도시 ID면 행정 건물이 없다 → 열린 맵
    expect(citySiegeLayout(map, 2, { x: 128, y: 128 }, source)).toBeUndefined();
    // 시작 자리는 모두 정해진다
    const placer = siegePlacer(arena, 1);
    for (let i = 0; i < 30; i++) expect(placer.attacker(i)).toBeDefined();
    for (let i = 0; i < 10; i++) expect(placer.defender(i)).toBeDefined();
  });

  it("평지만(terrain false)이면 지형 층을 읽지 않는다", () => {
    const { map, source } = seededCity();
    expect(citySiegeLayout(map, 1, { x: 128, y: 128 }, { ...source, terrain: false })?.terrain).toBeNull();
    expect(citySiegeLayout(map, 1, { x: 128, y: 128 }, source)?.terrain?.size).toBe(256);
  });

  it("비콘 자리에 건물이 있으면 열린 맵(undefined), 비었으면 2×2 자리", () => {
    const { map, source } = seededCity();
    const hall = cityHall(map, source, 1, { x: 128, y: 128 });
    const at = hall ? { x: hall.rect.x + 1, y: hall.rect.y + 1 } : { x: 128, y: 128 };
    expect(beaconSiegeLayout(map, at, source)).toBeUndefined();
    const empty = beaconSiegeLayout(map, { x: 20, y: 230 }, source);
    expect(empty?.nexus).toEqual({ x: 19, y: 229, width: 2, height: 2 });
    expect(empty?.nexusSourceId).toBeNull();
  });
});
