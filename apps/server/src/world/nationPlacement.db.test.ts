// 사람이 고른 국가 자리·NPC 수도 DB 통합 시험(기획 D-528, docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)") — TEST_DATABASE_URL이 있을 때만.
// 계정·행성 값은 시험용 가짜다(면 5만 바다인 풀밭 — worldLayout.db.test.ts와 같은 무늬).
// 1. 켠 세계: NPC가 고른 수도를 세력 행에 적는다. 세계 배치 서비스로 자리를 놓으면(알맞은 땅·바다·너무 가까움 검사, 감사 기록) 다음 켤 때
//    막는 것이 없는 국가는 국가째 새 자리로 옮기고(지도자·NPC 시설이 따라감, 감사 기록), 플레이어 유닛이 선 국가는 그대로 두고 까닭을 적는다.
// 2. 새 세계(세계 새로 시작 뒤 — 자리는 세력 코드로 남는다): 처음 켤 때 그 국가가 놓은 자리에 선다.
import { loadContentPack } from "@terra/content/node";
import { cellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { placementCellKey, territoryMetric, territoryPoint } from "@terra/planet/territory";
import { territoryDistanceMilli } from "@terra/shared/territory";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS, generateTempTerrain, seedFromCellKey } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { nationCode } from "../npc/nations.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import { createPlacementService } from "./placementService.ts";
import type { TerrainService } from "./terrainService.ts";
import { addTestUnits } from "./testSupport.ts";
import { UNIT_KIND_NPC_LEADER } from "./unitKinds.ts";
import { type World, startWorld, testMapKey } from "./world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = nationPresetsOf(loaded.pack);
const metric = territoryMetric(9);
const PLANET = "s2_test_planet";
/** 놓아 볼 자리(면 1~4 가운데 — 시험 2차맵 줄(면 0)과 멀다) */
const SPOTS = ([1, 2, 3, 4] as const).map((face) => cellKey(face, 9, 256, 256));

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
const log = { info: () => {}, warn: () => {}, error: () => {} };

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    testMaps: 2,
    paths: { kind: "inline" },
    now: () => clock,
    log,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    terrain: fakeTerrain(),
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
const startCities = (factionId: number) =>
  rows<CityLine>(
    test.db,
    `select id, faction_id, map_key, cell_x, cell_y from world_cities where start and faction_id = $1 order by id`,
    [factionId],
  );
const pointOf = (mapKey: number, x = 128, y = 128) =>
  territoryPoint(placementCellKey(parseCellKey(mapKey), x, y));
const count = async (sql: string, values: unknown[] = []) =>
  Number((await rows<{ n: string }>(test.db, sql, values))[0]?.n ?? 0);

async function newUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

const service = () =>
  createPlacementService({
    pool: test.db.$client,
    planetId: PLANET,
    testMapKeys: [testMapKey(0), testMapKey(1)],
    land: cellValues,
    seed: () => TEST_SOCIETY_COEFFICIENTS.worldSeed,
    nationName: () => undefined,
    now: () => clock,
  });

describe.skipIf(!TEST_DATABASE_URL)("사람이 고른 국가 자리·NPC 수도(D-528)", () => {
  it("수도를 세력 행에 적고, 놓은 자리로 다음 켤 때 국가째 옮긴다(지도자 따라감), 플레이어 유닛이 선 국가는 막힘", async () => {
    const world = await boot();
    // NPC가 고른 수도: 고정 국가마다 그 국가 도시 하나
    const capitals = await rows<{ id: string; capital_city_id: string | null }>(
      test.db,
      `select f.id, f.capital_city_id from factions f where f.fixed and f.kind = 'npc' order by f.id`,
    );
    expect(capitals.length).toBe(4);
    for (const row of capitals) {
      const own = await startCities(Number(row.id));
      expect(own.map((city) => city.id)).toContain(row.capital_city_id);
    }
    const places = service();
    const view = await places.view();
    expect(view?.nations).toHaveLength(4);
    const [, nationA, nationB, nationC] = view?.nations ?? [];
    if (!nationA || !nationB || !nationC) throw new Error("nations");
    expect(nationA.cities.filter((city) => city.capital)).toHaveLength(1);
    const admin = await newUser("PlaceAdmin");
    const actor = { userId: admin, ip: "127.0.0.1" };
    // 바다 한가운데는 알맞은 땅이 없다
    const sea = await places.place([{ code: nationA.code, mapKey: cellKey(5, 9, 256, 256) }], actor);
    expect(sea?.[0]?.result).toBe("not_land");
    // A: 막는 것 없이 놓인다
    let homeA: number | undefined;
    for (const spot of SPOTS) {
      const result = await places.place([{ code: nationA.code, mapKey: spot }], actor);
      if (result?.[0]?.result === "ok") {
        homeA = spot;
        expect(result[0].blocked).toEqual([]);
        break;
      }
    }
    if (homeA === undefined) throw new Error("no spot for A");
    // C를 A 바로 곁에 놓으면 너무 가깝다
    const close = await places.place([{ code: nationC.code, mapKey: homeA }], actor);
    expect(close?.[0]).toMatchObject({ result: "too_close", near: nationA.code });
    // B: 수도 2차맵에 플레이어 일꾼이 서 있으면 놓되 막힘으로 적는다
    const worker = await newUser("PlaceWorker");
    const capitalB = nationB.cities.find((city) => city.capital);
    if (!capitalB) throw new Error("capital B");
    expect(addTestUnits(world, worker, Number(capitalB.mapKey), 1, clock)).toHaveLength(1);
    await world.persistence?.writer.durable();
    let homeB: number | undefined;
    for (const spot of SPOTS.filter((key) => key !== homeA)) {
      const result = await places.place([{ code: nationB.code, mapKey: spot }], actor);
      if (result?.[0]?.result === "ok") {
        homeB = spot;
        expect(result[0].blocked).toContain("player_unit_on_map");
        break;
      }
    }
    expect(homeB).toBeDefined();
    expect(await count(`select count(*) as n from audit_log where action = 'world.place_nation'`)).toBe(2);
    const beforeB = await startCities(nationB.factionId);
    const beforeA = await startCities(nationA.factionId);
    await stop(world);

    const again = await boot();
    // A: 시작 도시가 모두 새 자리(수도 2차맵 + 붙은 2차맵)로, 도시 ID 그대로
    const afterA = await startCities(nationA.factionId);
    expect(afterA.map((city) => city.id)).toEqual(beforeA.map((city) => city.id));
    expect(afterA.some((city) => Number(city.map_key) === homeA)).toBe(true);
    for (const city of afterA)
      expect(territoryDistanceMilli(pointOf(Number(city.map_key)), pointOf(homeA), metric)).toBeLessThan(
        1600,
      );
    expect(await count(`select count(*) as n from audit_log where action = 'world.place_nation_city'`)).toBe(
      afterA.length,
    );
    const rowA = await rows<{ applied_at_ms: string | null; blocked: unknown }>(
      test.db,
      `select applied_at_ms, blocked from world_nation_placements where faction_code = $1`,
      [nationA.code],
    );
    expect(rowA[0]?.applied_at_ms).not.toBeNull();
    expect(rowA[0]?.blocked).toBeNull();
    // A 지도자: 하나뿐이고 A 도시 2차맵에 선다(옛 2차맵에 남지 않는다)
    const ownerA = await rows<{ id: string }>(test.db, `select id from world_owners where faction_id = $1`, [
      nationA.factionId,
    ]);
    const leaders = await rows<{ map_key: string }>(
      test.db,
      `select map_key from world_units where owner_id = $1 and kind = $2`,
      [ownerA[0]?.id, UNIT_KIND_NPC_LEADER],
    );
    expect(leaders).toHaveLength(1);
    expect(afterA.map((city) => city.map_key)).toContain(leaders[0]?.map_key);
    // B: 그대로, 까닭이 남고 아직 들지 않음
    expect(await startCities(nationB.factionId)).toEqual(beforeB);
    const rowB = await rows<{ applied_at_ms: string | null; blocked: string[] | null }>(
      test.db,
      `select applied_at_ms, blocked from world_nation_placements where faction_code = $1`,
      [nationB.code],
    );
    expect(rowB[0]?.applied_at_ms).toBeNull();
    expect(rowB[0]?.blocked).toContain("player_unit_on_map");
    const viewAfter = await service().view();
    expect(
      viewAfter?.nations.find((nation) => nation.code === nationA.code)?.placement?.appliedAtMs,
    ).not.toBeNull();
    expect(viewAfter?.nations.find((nation) => nation.code === nationB.code)?.placement?.blocked).toContain(
      "player_unit_on_map",
    );
    expect(await again.checkInvariants()).toEqual([]);
    // 지우면 자동 배치로(도시는 그대로)
    expect(await service().clear(nationB.code, actor)).toBe(true);
    expect(
      await count(`select count(*) as n from world_nation_placements where faction_code = $1`, [
        nationB.code,
      ]),
    ).toBe(0);
  });

  it("새 세계: 세력 코드로 남은 자리에 처음부터 선다, 자동 제안은 놓지 않은 국가만", async () => {
    const code = nationCode(2, presets);
    const home = SPOTS[1] ?? 0;
    await rows(
      test.db,
      `insert into world_nation_placements (planet_id, faction_code, map_key, placed_at_ms) values ($1, $2, $3, $4)`,
      [PLANET, code, home, clock],
    );
    await boot();
    const faction = await rows<{ id: string }>(test.db, `select id from factions where code = $1`, [code]);
    const cities = await startCities(Number(faction[0]?.id));
    expect(cities.length).toBeGreaterThan(0);
    expect(Number(cities[0]?.map_key)).toBe(home);
    const row = await rows<{ applied_at_ms: string | null }>(
      test.db,
      `select applied_at_ms from world_nation_placements where faction_code = $1`,
      [code],
    );
    expect(row[0]?.applied_at_ms).not.toBeNull();
    const suggestion = await service().suggest();
    expect(suggestion?.homes.map((entry) => entry.code)).not.toContain(code);
    expect(suggestion?.homes).toHaveLength(3);
  });
});
