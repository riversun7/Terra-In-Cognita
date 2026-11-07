// 세계 배치 DB 통합 시험(docs/adr/2026-11-07-world-layout.md) — TEST_DATABASE_URL이 있을 때만. 계정·행성 값은 시험용 가짜다.
// 가짜 지형 서비스(행성 값 = 면 5만 바다인 풀밭)로 켜서:
// 1. 새 세계: 고정 국가마다 행성 위 자기 자리(수도 + 붙은 2차맵)에 시작 도시, 시험 2차맵 줄에는 없고, 도시 2차맵을 함께 띄우고, 기본 시설이
//    서고, 국가 사이가 국가 간격만큼 멀고, 다시 켜도 그대로.
// 2. 옛 세계(시작 도시가 시험 2차맵 줄): WORLD_RELAYOUT이 꺼져 있으면 계획만 기록하고 그대로, 켜면 플레이어 것이 걸리지 않은 도시만 옮기고
//    (사이보그·NPC 휴먼은 새 도시 둘레로, NPC 시설은 새 자리에 다시), 플레이어 일꾼이 선 2차맵의 도시는 그대로 두고 까닭을 남긴다.
import { loadContentPack } from "@terra/content/node";
import { decodeCellKey, parseCellKey } from "@terra/planet";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { territoryMetric, territoryPoint, placementCellKey } from "@terra/planet/territory";
import { territoryDistanceMilli } from "@terra/shared/territory";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS, generateTempTerrain, seedFromCellKey } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import type { TerrainService } from "./terrainService.ts";
import { type World, startWorld, testMapKey } from "./world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = nationPresetsOf(loaded.pack);
const WANT = [2, 4, 3, 2];
const metric = territoryMetric(9);

/** 가짜 행성 값: 면 5는 바다, 나머지는 풀밭(15°C·강수 400mm·숲 없음·고도 120m) */
function cellValues(mapKey: number): PlanetCellValues {
  const { face, i, j } = decodeCellKey(parseCellKey(mapKey));
  const sea = face === 5;
  return {
    mapKey,
    face,
    i,
    j,
    biomeId: sea ? "ocean" : "grassland",
    elevationM: sea ? -300 : 120,
    temperatureC: 15,
    humidity: 120,
    precipitationMm: 400,
    water: sea ? 1 : 0,
    riverOrder: 0,
    forest: 0,
  };
}

/** 가짜 지형 서비스: 2차맵 지형은 S1 임시 지형, 행성 값은 위 무늬 */
function fakeTerrain(): TerrainService {
  return {
    ready: Promise.resolve(),
    version: () => "fake",
    get: async (mapKey) => mapTerrainFromTemp(mapKey, generateTempTerrain(seedFromCellKey(mapKey))),
    peek: () => undefined,
    prefetch: () => {},
    cellValues,
    takeMetrics: () => ({}),
    close: async () => {},
  };
}

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;
const logged: { obj: object; message: string }[] = [];
const log = {
  info: (obj: object, message: string) => logged.push({ obj, message }),
  warn: (obj: object, message: string) => logged.push({ obj, message }),
  error: () => {},
};

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
  logged.length = 0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(options: { terrain: boolean; relayout?: boolean; testMaps?: number }): Promise<World> {
  const world = startWorld({
    testBots: 0,
    testMaps: options.testMaps ?? 2,
    relayout: options.relayout,
    paths: { kind: "inline" },
    now: () => clock,
    log,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    terrain: options.terrain ? fakeTerrain() : undefined,
    npc: { testNations: 4, manual: true, presets },
    cyborgRules: () => TEST_SOCIETY_COEFFICIENTS,
    holdings: { content: () => pack },
    facilities: { content: () => pack },
  });
  worlds.push(world);
  await world.ready;
  await world.persistence?.writer.durable();
  return world;
}

async function stop(world: World): Promise<void> {
  await world.stop();
  worlds.splice(worlds.indexOf(world), 1);
}

type CityLine = { id: string; faction_id: string; map_key: string; cell_x: number; cell_y: number };
const startCities = () =>
  rows<CityLine>(
    test.db,
    `select id, faction_id, map_key, cell_x, cell_y from world_cities where start order by id`,
  );
const pointOf = (city: CityLine) =>
  territoryPoint(placementCellKey(parseCellKey(Number(city.map_key)), city.cell_x, city.cell_y));

async function newUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

/** 그 시작 도시에 사이보그를 만든다 */
async function makeCyborg(world: World, userId: string, cityId: number): Promise<void> {
  const persistence = world.persistence;
  if (!persistence) throw new Error("persistence");
  const faction = persistence.cyborgs
    .creation(userId, clock)
    .factions.find((entry) => entry.cities.some((city) => city.id === cityId));
  if (!faction) throw new Error("no faction for the city");
  await persistence.cyborgs.roll(userId, "balanced");
  const made = await persistence.cyborgs.create(userId, {
    name: `c${userId.slice(0, 8)}`,
    appearance: {
      head: "dome",
      face: "visor",
      body: "slim",
      limbs: "piston",
      primary: "mint",
      accent: "lemon",
    },
    factionId: faction.id,
    cityId,
    elements: { fire: 6, wind: 4 },
  });
  expect(made.ok).toBe(true);
  await persistence.writer.durable();
}

/** 그 사용자 사이보그 본체가 선 2차맵 키 */
async function cyborgMap(userId: string): Promise<string | undefined> {
  const found = await rows<{ map_key: string }>(
    test.db,
    `select u.map_key from cyborgs y join world_units u on u.id = y.unit_id where y.user_id = $1`,
    [userId],
  );
  return found[0]?.map_key;
}

describe.skipIf(!TEST_DATABASE_URL)("세계 배치(국가마다 행성 위 자기 자리)", () => {
  it("새 세계: 시작 도시는 국가마다 수도 + 붙은 2차맵, 시험 줄 밖, 2차맵을 함께 띄우고 기본 시설, 국가 사이는 멀다, 다시 켜도 그대로", async () => {
    const world = await boot({ terrain: true });
    const cities = await startCities();
    const testKeys = new Set([0, 1].map((k) => String(testMapKey(k))));
    const byFaction = new Map<string, CityLine[]>();
    for (const city of cities)
      byFaction.set(city.faction_id, [...(byFaction.get(city.faction_id) ?? []), city]);
    expect([...byFaction.values()].map((list) => list.length)).toEqual(WANT);
    expect(new Set(cities.map((city) => city.map_key)).size).toBe(cities.length);
    for (const city of cities) {
      expect(testKeys.has(city.map_key)).toBe(false);
      expect(world.maps.has(Number(city.map_key))).toBe(true);
      expect([city.cell_x, city.cell_y]).toEqual([128, 128]);
    }
    expect(world.maps.size).toBe(cities.length + 2);
    // 한 국가 도시는 수도에서 한 칸, 다른 국가 도시와는 국가 간격(30칸)에 가깝게 멀다
    const lists = [...byFaction.values()];
    for (const [capital, ...rest] of lists)
      for (const city of rest)
        if (capital)
          expect(territoryDistanceMilli(pointOf(city), pointOf(capital), metric)).toBeLessThan(1600);
    for (const [a, listA] of lists.entries())
      for (const [b, listB] of lists.entries())
        if (a !== b)
          for (const x of listA)
            for (const y of listB)
              expect(territoryDistanceMilli(pointOf(x), pointOf(y), metric)).toBeGreaterThan(27_000);
    // 기본 시설: 시작 도시마다 행정 건물·창고 + 둘레 땅(풀밭)에 맞는 농장
    const facilities = await rows<{ city_id: string; n: string }>(
      test.db,
      `select city_id, count(*) as n from world_facilities group by city_id order by city_id`,
    );
    expect(facilities.map((row) => row.city_id)).toEqual(cities.map((city) => city.id));
    expect(await world.checkInvariants()).toEqual([]);
    await stop(world);
    const again = await boot({ terrain: true });
    expect(await startCities()).toEqual(cities);
    expect(again.maps.size).toBe(cities.length + 2);
  });

  it("옛 세계: 끄면 계획만 기록, 켜면 플레이어 것이 걸리지 않은 도시만 옮기고 사이보그·NPC 시설이 따라간다", async () => {
    // 옛 세계 = 행성 값 없이 켠 세계(시험 2차맵 줄에 시작 도시)
    const legacyWorld = await boot({ terrain: false, testMaps: 3 });
    const legacy = await startCities();
    const testKeys = new Set([0, 1, 2].map((k) => String(testMapKey(k))));
    expect(legacy.every((city) => testKeys.has(city.map_key))).toBe(true);
    const mover = await newUser("LayoutMover");
    const worker = await newUser("LayoutWorker");
    const firstCity = legacy[0];
    if (!firstCity) throw new Error("no legacy city");
    await makeCyborg(legacyWorld, mover, Number(firstCity.id));
    // 플레이어 일꾼이 선 2차맵(셋째 시험 2차맵)의 도시는 옮기지 않는다
    const blockedMap = String(testMapKey(2));
    expect(legacyWorld.devSpawn?.(worker, Number(blockedMap), 2)).toBe(2);
    await legacyWorld.persistence?.writer.durable();
    expect(await cyborgMap(mover)).toBe(firstCity.map_key);
    await stop(legacyWorld);

    // 끔: 계획만(도시 그대로, 모자란 도시도 없음)
    const planned = await boot({ terrain: true, testMaps: 3 });
    expect(await startCities()).toEqual(legacy);
    expect(logged.some((line) => line.message.startsWith("world relayout plan"))).toBe(true);
    await stop(planned);

    // 켬: 옮긴다
    logged.length = 0;
    const moved = await boot({ terrain: true, testMaps: 3, relayout: true });
    const after = await startCities();
    expect(after.map((city) => city.id)).toEqual(legacy.map((city) => city.id));
    for (const [index, city] of after.entries()) {
      const before = legacy[index];
      if (!before) throw new Error("legacy city");
      if (before.map_key === blockedMap) expect(city).toEqual(before);
      else {
        expect(testKeys.has(city.map_key)).toBe(false);
        expect(moved.maps.has(Number(city.map_key))).toBe(true);
        // 옮긴 도시는 시험 2차맵 줄에서 국가 간격(30칸)에 가깝게 멀다(줄 바로 옆에 모이지 않는다)
        for (const key of testKeys)
          expect(
            territoryDistanceMilli(pointOf(city), pointOf({ ...city, map_key: key }), metric),
          ).toBeGreaterThan(27_000);
      }
    }
    const report = logged.find((line) => line.message === "world relayout: moved legacy start cities");
    expect(report).toBeDefined();
    const kept = Reflect.get(report?.obj ?? {}, "kept");
    expect(
      Array.isArray(kept) &&
        kept.every((entry: unknown) => JSON.stringify(entry).includes("player_unit_on_map")),
    ).toBe(true);
    // 사이보그는 옮긴 시작 도시의 새 2차맵에
    const movedFirst = after[0];
    expect(movedFirst?.map_key).not.toBe(firstCity.map_key);
    expect(await cyborgMap(mover)).toBe(movedFirst?.map_key);
    // 일꾼은 그대로(플레이어 자료를 옮기거나 지우지 않는다)
    const workers = await rows<{ map_key: string }>(
      test.db,
      `select u.map_key from world_units u join world_owners o on o.id = u.owner_id where o.user_id = $1 and u.kind <> 3`,
      [worker],
    );
    expect(workers.map((row) => row.map_key)).toEqual([blockedMap, blockedMap]);
    // NPC 시설은 새 자리에 다시 섰다(옮긴 도시의 시설 건물은 모두 그 도시의 새 2차맵에)
    const facilityMaps = await rows<{ city_id: string; map_key: string }>(
      test.db,
      `select f.city_id, b.map_key from world_facilities f join world_buildings b on b.id = f.building_id`,
    );
    for (const city of after)
      for (const row of facilityMaps.filter((entry) => entry.city_id === city.id))
        expect(row.map_key).toBe(city.map_key);
    const audits = await rows<{ n: string }>(
      test.db,
      `select count(*) as n from audit_log where action = 'world.relayout_city'`,
    );
    expect(Number(audits[0]?.n)).toBe(after.filter((city) => !testKeys.has(city.map_key)).length);
    expect(await moved.checkInvariants()).toEqual([]);
  });
});
