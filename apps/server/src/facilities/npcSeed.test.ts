// NPC 시작 도시 기본 시설(세계 씨앗) 시험 — 평평한 시험 2차맵·팩 시설로 자리·주인·멱등을 본다. 값은 형식 확인용이다.
import { START_WORLD_SEED } from "@terra/sim";
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { type CityCell, cityOfCell } from "@terra/shared/goodsPlaces";
import { afterEach, describe, expect, it } from "vitest";
import type { CityRow } from "../world/cities.ts";
import { type TestMap, createTestMap } from "../world/testSupport.ts";
import { facilityCatalogOf } from "./catalog.ts";
import { LAYOUT_MARGIN, grow, overlaps, rectCenter } from "./cityLayout.ts";
import {
  SEED_MARGIN,
  SEED_PLAZA_RADIUS,
  type SeedLand,
  landGather,
  seedNpcFacilities,
  seedPlan,
  villagePlan,
} from "./npcSeed.ts";
import type { FacilityRecord } from "./state.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

const catalog = facilityCatalogOf(() => TEST_FACILITY_SOURCE)();
const maps: TestMap[] = [];
afterEach(() => {
  for (const test of maps.splice(0)) test.map.stop();
});

const city = (id: number, factionId: number, x: number, y: number, start = true): CityRow => ({
  id,
  factionId,
  planetId: "p",
  mapKey: 9,
  cellX: x,
  cellY: y,
  start,
});

const anchors = (list: readonly CityRow[]): CityCell[] =>
  list.map((entry) => ({ id: entry.id, mapKey: entry.mapKey, x: entry.cellX, y: entry.cellY }));

function setup() {
  const test = createTestMap({ mapKey: 9 });
  maps.push(test);
  const facilities = new Map<number, FacilityRecord>();
  const service = {
    facilities,
    seedBuilt: (record: FacilityRecord) => {
      facilities.set(record.buildingId, record);
    },
  };
  return { map: test.map, facilities, service };
}

describe("NPC 시작 도시 기본 시설(세계 씨앗)", () => {
  it("국가마다 씨앗 값(seedOfFaction)이 있으면 그 국가 도시는 그 수로 세운다", () => {
    const { map, facilities, service } = setup();
    const cities = [city(1, 100, 128, 128), city(2, 200, 64, 64)];
    const owners = new Map([
      [100, 7],
      [200, 8],
    ]);
    const result = seedNpcFacilities({
      maps: new Map([[9, map]]),
      cities,
      planetId: "p",
      ownerOfFaction: (factionId: number) => owners.get(factionId),
      service,
      catalog,
      seed: START_WORLD_SEED,
      // 세력 200만 농장 2·창고 2·벌목장 0·광산 0
      seedOfFaction: (factionId: number) =>
        factionId === 200
          ? { ...START_WORLD_SEED, farms: 2, storehouses: 2, lumberCamps: 0, mines: 0 }
          : undefined,
      nowMs: 1_000,
    });
    expect(result.missing).toBe(0);
    const of = (cityId: number) =>
      [...facilities.values()]
        .filter((record) => record.cityId === cityId)
        .map((record) => record.facilityId)
        .toSorted();
    expect(of(1)).toEqual([
      "farm",
      "government_hall",
      "lodging",
      "lodging",
      "lodging",
      "lumber_camp",
      "mine",
      "storehouse",
    ]);
    expect(of(2)).toEqual([
      "farm",
      "farm",
      "government_hall",
      "lodging",
      "lodging",
      "lodging",
      "storehouse",
      "storehouse",
    ]);
  });

  it("시작 도시마다 행정 건물 + 설정 칸 수만큼 창고·농장·벌목장·광산을 다 지은 채로, 주인 = 그 세력 주체", () => {
    const { map, facilities, service } = setup();
    const cities = [city(1, 100, 128, 128), city(2, 200, 64, 64), city(3, 300, 200, 200, false)];
    const owners = new Map([
      [100, 7],
      [200, 8],
      [300, 9],
    ]);
    const input = {
      maps: new Map([[9, map]]),
      cities,
      planetId: "p",
      ownerOfFaction: (factionId: number) => owners.get(factionId),
      service,
      catalog,
      seed: START_WORLD_SEED,
      nowMs: 1_000,
    };
    const result = seedNpcFacilities(input);
    const perCity = seedPlan(START_WORLD_SEED).reduce((sum, item) => sum + item.count, 0);
    // 행정 건물 1 + 창고 1 + 숙소 3 + 농장·벌목장·광산 1씩
    expect(perCity).toBe(8);
    // 시작 도시가 아닌 도시(3 — 마을)는 행정 건물 + 숙소(설정 칸 npc_village_lodgings)만(질문 1052 다)
    const perVillage = villagePlan(START_WORLD_SEED).reduce((sum, item) => sum + item.count, 0);
    expect(perVillage).toBe(2);
    expect(result).toEqual({ placed: perCity * 2 + perVillage, missing: 0 });
    expect(
      [...facilities.values()]
        .filter((record) => record.cityId === 3)
        .map((record) => record.facilityId)
        .toSorted(),
    ).toEqual(["government_hall", "lodging"]);
    for (const record of facilities.values()) {
      expect(record).toMatchObject({
        level: 1,
        conditionPpm: CONDITION_FULL,
        builtAtMs: 1_000,
        builtBy: null,
      });
      const owner = record.cityId === 1 ? 7 : record.cityId === 2 ? 8 : 9;
      expect(map.buildingOwner(record.buildingId)).toBe(owner);
    }
    expect(
      [...facilities.values()]
        .filter((record) => record.cityId === 1)
        .map((record) => record.facilityId)
        .toSorted(),
    ).toEqual([
      "farm",
      "government_hall",
      "lodging",
      "lodging",
      "lodging",
      "lumber_camp",
      "mine",
      "storehouse",
    ]);
    // 전략 배치: 행정 건물은 도시 칸 가운데, 다른 건물은 광장(행정 건물 둘레 3칸 + 둘레 길)에 들지 않고 그 도시 자리(가장 가까운 도시)에 선다
    const rects = new Map<number, { x: number; y: number; width: number; height: number }>();
    map.forEachBuilding((building) => rects.set(building.id, building.placement));
    for (const home of cities) {
      const records = [...facilities.values()].filter((record) => record.cityId === home.id);
      const hall = records.find((record) => record.facilityId === "government_hall");
      const hallRect = hall ? rects.get(hall.buildingId) : undefined;
      expect(hallRect).toMatchObject({ x: home.cellX - 1, y: home.cellY - 1, width: 3, height: 3 });
      if (!hallRect) continue;
      const plaza = grow(hallRect, START_WORLD_SEED.cityLayoutPlazaCells + LAYOUT_MARGIN);
      for (const record of records) {
        const rect = rects.get(record.buildingId);
        if (!rect || record === hall) continue;
        expect(overlaps(rect, plaza)).toBe(false);
        const middle = rectCenter(rect);
        expect(cityOfCell(anchors(cities), 9, middle.x, middle.y)?.id).toBe(home.id);
      }
    }

    // 다시 부르면 아무것도 더하지 않는다(멱등). 설정 칸을 늘리면 모자란 것만 더한다
    expect(seedNpcFacilities({ ...input, nowMs: 2_000 })).toEqual({ placed: 0, missing: 0 });
    const more = seedNpcFacilities({ ...input, seed: { ...START_WORLD_SEED, farms: 2 }, nowMs: 3_000 });
    expect(more).toEqual({ placed: 2, missing: 0 });
    expect([...facilities.values()].filter((record) => record.facilityId === "farm")).toHaveLength(4);
    // 한 도시만(실행 중에 선 새 마을, only): 다른 도시는 보지 않는다
    expect(
      seedNpcFacilities({
        ...input,
        seed: { ...START_WORLD_SEED, farms: 3, villageLodgings: 2 },
        only: new Set([3]),
        nowMs: 4_000,
      }),
    ).toEqual({ placed: 1, missing: 0 });
  });

  it("마을: 그 자리에 누구 것이든 행정 건물이 있으면(되살린 폐허) 행정 건물을 더 세우지 않는다", () => {
    const { map, facilities, service } = setup();
    const cities = [city(5, 500, 128, 128, false)];
    // 다른 주체(유저 9)가 지은 행정 건물, 도시 ID 없음(폐허 때 지음)
    const built = map.placeBuilding({ x: 127, y: 127, width: 3, height: 3, rotation: 0 }, 9);
    if (!built.ok || built.buildingId === undefined) throw new Error("place");
    facilities.set(built.buildingId, {
      buildingId: built.buildingId,
      facilityId: "government_hall",
      level: 1,
      conditionPpm: CONDITION_FULL,
      conditionAtMs: 0,
      builtAtMs: 0,
      builtBy: null,
      cityId: null,
    });
    const result = seedNpcFacilities({
      maps: new Map([[9, map]]),
      cities,
      planetId: "p",
      ownerOfFaction: () => 7,
      service,
      catalog,
      seed: START_WORLD_SEED,
      nowMs: 1_000,
    });
    expect(result).toEqual({ placed: 1, missing: 0 });
    expect([...facilities.values()].map((record) => record.facilityId).toSorted()).toEqual([
      "government_hall",
      "lodging",
    ]);
  });

  it("옛 배치(city_layout_mode 0): 가운데 마당 밖 고리마다 처음 맞는 자리", () => {
    const { map, facilities, service } = setup();
    const cities = [city(1, 100, 128, 128), city(2, 200, 64, 64)];
    const oldSeed = { ...START_WORLD_SEED, cityLayoutMode: 0 };
    const result = seedNpcFacilities({
      maps: new Map([[9, map]]),
      cities,
      planetId: "p",
      ownerOfFaction: (factionId: number) => factionId,
      service,
      catalog,
      seed: oldSeed,
      nowMs: 1_000,
    });
    expect(result).toEqual({ placed: 16, missing: 0 });
    // 가운데 마당(둘레 길 포함)에는 짓지 않고, 건물은 그 도시 자리(가장 가까운 도시)에 선다
    map.forEachBuilding((building) => {
      const record = facilities.get(building.id);
      const home = cities.find((entry) => entry.id === record?.cityId);
      if (!home) throw new Error("no city");
      const def = catalog.facility(record?.facilityId ?? "");
      const width = def?.footprint?.width ?? 1;
      const height = def?.footprint?.height ?? 1;
      const awayX =
        building.x - SEED_MARGIN > home.cellX + SEED_PLAZA_RADIUS ||
        building.x + width - 1 + SEED_MARGIN < home.cellX - SEED_PLAZA_RADIUS;
      const awayY =
        building.y - SEED_MARGIN > home.cellY + SEED_PLAZA_RADIUS ||
        building.y + height - 1 + SEED_MARGIN < home.cellY - SEED_PLAZA_RADIUS;
      expect(awayX || awayY).toBe(true);
    });
  });

  it("팩에 없는 시설·주체 없는 세력은 건너뛰고 셈만 한다", () => {
    const { map, facilities, service } = setup();
    const result = seedNpcFacilities({
      maps: new Map([[9, map]]),
      cities: [city(1, 100, 128, 128), city(2, 200, 64, 64)],
      planetId: "p",
      ownerOfFaction: (factionId) => (factionId === 100 ? 7 : undefined),
      service,
      catalog: facilityCatalogOf(() => ({
        facilities: TEST_FACILITY_SOURCE.facilities.filter((entry) => entry.id !== "mine"),
        items: TEST_FACILITY_SOURCE.items,
      }))(),
      seed: START_WORLD_SEED,
      nowMs: 1_000,
    });
    expect(result).toEqual({ placed: 7, missing: 1 });
    expect(facilities.size).toBe(7);
  });

  it("1차 생산 여섯 가지: 약초원·목장·낚시터도 같은 표에서 서고 수 출발값은 0이다", () => {
    const ids = seedPlan(START_WORLD_SEED).map((item) => item.facility);
    expect(ids).toEqual([
      "government_hall",
      "storehouse",
      "lodging",
      "farm",
      "lumber_camp",
      "mine",
      "herb_field",
      "ranch",
      "fishing_spot",
    ]);
    expect(seedPlan(START_WORLD_SEED).filter((item) => item.count > 0)).toHaveLength(6);
    const six = { ...START_WORLD_SEED, herbFields: 1, ranches: 2, fishingSpots: 1 };
    // 숲만 있는 추운 고원: 벌목장·광산 + 약초원(숲), 목장은 농사지을 땅이 아니라 서지 않는다. 낚시터는 땅 조건이 없다
    const cold = { elevationM: 900, temperatureC: -5, precipitationMm: 100, forest: 200 };
    expect(
      seedPlan(six, cold)
        .filter((item) => item.count > 0)
        .map((item) => `${item.facility}:${item.count}`),
    ).toEqual([
      "government_hall:1",
      "storehouse:1",
      "lodging:3",
      "lumber_camp:1",
      "mine:1",
      "herb_field:1",
      "fishing_spot:1",
    ]);
    // 따뜻한 풀밭: 농장 + 약초원 + 목장
    const warm = { elevationM: 50, temperatureC: 18, precipitationMm: 900, forest: 0 };
    expect(
      seedPlan(six, warm)
        .filter((item) => item.count > 0)
        .map((item) => `${item.facility}:${item.count}`),
    ).toEqual([
      "government_hall:1",
      "storehouse:1",
      "lodging:3",
      "farm:1",
      "herb_field:1",
      "ranch:2",
      "fishing_spot:1",
    ]);
  });

  it("채집 시설은 둘레 땅을 따른다(503 다): 숲 → 벌목장, 높은 땅 → 광산, 따뜻하고 비 오는 땅 → 농장, 아무것도 아니면 농장", () => {
    // 시험 2차맵 줄(초지·숲 밀도 15·고도 75m·15°C·강수 261mm)과 같은 값
    const grass: SeedLand = { elevationM: 75, temperatureC: 15, precipitationMm: 261, forest: 15 };
    expect(landGather(grass, START_WORLD_SEED)).toEqual({ farm: true, lumber: true, mine: false });
    // 화면 숲 표시 문턱(밀도 13 ≈ 5%)과 같다
    expect(landGather({ ...grass, forest: 12 }, START_WORLD_SEED).lumber).toBe(false);
    expect(landGather({ ...grass, forest: 13 }, START_WORLD_SEED).lumber).toBe(true);
    expect(
      landGather({ elevationM: 900, temperatureC: -5, precipitationMm: 100, forest: 0 }, START_WORLD_SEED),
    ).toEqual({ farm: false, lumber: false, mine: true });
    expect(
      landGather({ elevationM: 10, temperatureC: 30, precipitationMm: 50, forest: 0 }, START_WORLD_SEED),
    ).toEqual({
      farm: true,
      lumber: false,
      mine: false,
    });
    const plan = seedPlan(START_WORLD_SEED, grass);
    expect(plan.filter((item) => item.count > 0).map((item) => item.facility)).toEqual([
      "government_hall",
      "storehouse",
      "lodging",
      "farm",
      "lumber_camp",
    ]);

    const { map, facilities, service } = setup();
    const result = seedNpcFacilities({
      maps: new Map([[9, map]]),
      cities: [city(1, 100, 128, 128)],
      planetId: "p",
      ownerOfFaction: () => 7,
      service,
      catalog,
      seed: START_WORLD_SEED,
      landOf: (mapKey) => (mapKey === 9 ? grass : undefined),
      nowMs: 1_000,
    });
    expect(result).toEqual({ placed: 7, missing: 0 });
    expect([...facilities.values()].map((record) => record.facilityId).toSorted()).toEqual([
      "farm",
      "government_hall",
      "lodging",
      "lodging",
      "lodging",
      "lumber_camp",
      "storehouse",
    ]);
  });
});
