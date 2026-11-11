// 물가 조건 시험(질문 947 나, docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)") — 서버 2차맵 물 표(지형 파일 지표 층)·
// 짓기 판정 함수(waterOk)·NPC 씨앗 자리 고르기. 평평한 풀밭 시험 2차맵에 세로 물줄기 하나를 둔다. 값은 형식 확인용이다.
import { START_WORLD_SEED, SURFACE_GRASS, TERRAIN_SIZE } from "@terra/sim";
import { hasWaterNear, isWaterTerrainCell } from "@terra/shared/waterNearby";
import { afterEach, describe, expect, it } from "vitest";
import type { CityRow } from "../world/cities.ts";
import { type TestMap, createTestMap, flatTerrain } from "../world/testSupport.ts";
import { WATER_CODES_MATCH } from "../world/waterMask.ts";
import { facilityCatalogOf } from "./catalog.ts";
import { seedNpcFacilities } from "./npcSeed.ts";
import type { FacilityRecord } from "./state.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";
import { waterOk } from "./water.ts";

const catalog = facilityCatalogOf(() => TEST_FACILITY_SOURCE)();
const maps: TestMap[] = [];
afterEach(() => {
  for (const test of maps.splice(0)) test.map.stop();
});

/** 물줄기 지형 칸 열(배치 칸 x 200~201) */
const RIVER_TX = 100;
const SHALLOW = 10;

/** 풀밭 + 지형 칸 열 RIVER_TX 전체가 얕은 물 */
function riverMap(): TestMap {
  const terrain = flatTerrain();
  const surface = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(SURFACE_GRASS);
  for (let ty = 0; ty < TERRAIN_SIZE; ty++) surface[ty * TERRAIN_SIZE + RIVER_TX] = SHALLOW;
  const test = createTestMap({ mapKey: 9, terrain: { ...terrain, surface } });
  maps.push(test);
  return test;
}

describe("물가 조건(서버)", () => {
  it("shared 물 번호 = 프로토콜 지표 물·얕은 물, 2차맵 물 표는 지형 파일 지표 층에서", () => {
    expect(WATER_CODES_MATCH).toBe(true);
    const { map } = riverMap();
    const mask = map.waterMask();
    expect(mask.size).toBe(TERRAIN_SIZE);
    expect(isWaterTerrainCell(mask, RIVER_TX, 0)).toBe(true);
    expect(isWaterTerrainCell(mask, RIVER_TX, 127)).toBe(true);
    expect(isWaterTerrainCell(mask, RIVER_TX - 1, 60)).toBe(false);
    // 한 번 만든 표를 계속 쓴다
    expect(map.waterMask()).toBe(mask);
  });

  it("팩 낚시터(물가 5칸, 3×3): 오른쪽 끝에서 물(x 200)까지 5칸 안이면 짓고 6칸이면 못 짓는다. 조건 없는 시설은 늘 된다", () => {
    const { map } = riverMap();
    const fishing = catalog.facility("fishing_spot");
    expect(fishing?.needsWaterWithin).toBe(5);
    expect(fishing?.footprint).toEqual({ width: 3, height: 3 });
    if (!fishing) return;
    expect(waterOk(map, fishing, 193, 60, 0)).toBe(true);
    expect(waterOk(map, fishing, 192, 60, 0)).toBe(false);
    // 물 건너편(물 끝 x 201): 왼쪽 끝 206 → 넓힌 끝 201, 207 → 202
    expect(waterOk(map, fishing, 206, 60, 0)).toBe(true);
    expect(waterOk(map, fishing, 207, 60, 0)).toBe(false);
    const farm = catalog.facility("farm");
    expect(farm?.needsWaterWithin).toBeUndefined();
    if (farm) expect(waterOk(map, farm, 20, 20, 0)).toBe(true);
  });

  it("네모가 아닌 칸은 돌린 칸 크기로 잰다(90도면 가로·세로가 바뀐다)", () => {
    const { map } = riverMap();
    const def = { needsWaterWithin: 2, footprint: { width: 6, height: 2 } };
    // 돌리지 않으면 x 192~197 → 넓힌 끝 199(물 없음), 193~198 → 200. 90도면 가로 2칸: x 196~197 → 199, 197~198 → 200
    expect(waterOk(map, def, 192, 60, 0)).toBe(false);
    expect(waterOk(map, def, 193, 60, 0)).toBe(true);
    expect(waterOk(map, def, 196, 60, 90)).toBe(false);
    expect(waterOk(map, def, 197, 60, 90)).toBe(true);
  });

  it("NPC 씨앗도 같은 규칙: 물가 도시는 물 둘레에 낚시터를 세우고, 물이 먼 도시는 세우지 않는다(자리 없음)", () => {
    const { map } = riverMap();
    const facilities = new Map<number, FacilityRecord>();
    const service = {
      facilities,
      seedBuilt: (record: FacilityRecord) => {
        facilities.set(record.buildingId, record);
      },
    };
    const city = (id: number, factionId: number, x: number): CityRow => ({
      id,
      factionId,
      planetId: "p",
      mapKey: 9,
      cellX: x,
      cellY: 128,
      start: true,
    });
    // 낚시터만 하나(다른 씨앗 0)
    const onlyFishing = {
      ...START_WORLD_SEED,
      storehouses: 0,
      farms: 0,
      lumberCamps: 0,
      mines: 0,
      fishingSpots: 1,
    };
    const result = seedNpcFacilities({
      maps: new Map([[9, map]]),
      cities: [city(1, 100, 190), city(2, 200, 40)],
      planetId: "p",
      ownerOfFaction: (factionId) => factionId,
      service,
      catalog,
      seed: onlyFishing,
      nowMs: 1_000,
    });
    const fishing = [...facilities.values()].filter((record) => record.facilityId === "fishing_spot");
    expect(fishing.map((record) => record.cityId)).toEqual([1]);
    expect(result.missing).toBe(1);
    // 세운 자리는 물에서 5칸 안이다
    let placed: { x: number; y: number } | undefined;
    map.forEachBuilding((building) => {
      if (building.id === fishing[0]?.buildingId) placed = { x: building.x, y: building.y };
    });
    expect(placed).toBeDefined();
    if (placed)
      expect(hasWaterNear(map.waterMask(), { x: placed.x, y: placed.y, width: 3, height: 3 }, 5)).toBe(true);
  });
});
