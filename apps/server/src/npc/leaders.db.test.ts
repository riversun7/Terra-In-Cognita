// NPC 국가 지도자·정부 판 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP-NPC") — TEST_DATABASE_URL이 있을 때만. 계정·행성 값은 시험용 가짜다.
// 가짜 지형 서비스(행성 값 = 면 5만 바다인 풀밭)로 새 세계를 켜서:
// 1. 고정 국가마다 지도자 유닛(종류 7) 하나가 수도 행정 건물 곁에 서고, 다시 켜도 그대로(같은 유닛, 더 세우지 않음).
// 2. 정부 판(행정 건물 → 도시·나라·지도자·세율·행정 레벨·휴먼 수), 행정 건물이 아닌 건물은 not_government.
// 3. 세력 화면 실제 자료가 지도자 유닛을 읽고(leader_unit), 팩 이름을 붙인다.
import { loadContentPack } from "@terra/content/node";
import { decodeCellKey, parseCellKey } from "@terra/planet";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS, generateTempTerrain, seedFromCellKey } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { readFactionReal, withNationNames } from "../factionScreen/source.ts";
import { governmentReadsOfWorld } from "../government/reads.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import type { TerrainService } from "../world/terrainService.ts";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import { type World, startWorld } from "../world/world.ts";
import { nationLeaderName, nationName } from "./nations.ts";
import { nationPresetsOf } from "./presets.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = nationPresetsOf(loaded.pack);

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
    testBots: 40,
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

type LeaderLine = { id: string; owner_id: string; map_key: string; faction_id: string; code: string };
const leaders = () =>
  rows<LeaderLine>(
    test.db,
    `select u.id, u.owner_id, u.map_key, o.faction_id, f.code from world_units u
       join world_owners o on o.id = u.owner_id join factions f on f.id = o.faction_id
      where u.kind = $1 order by u.id`,
    [UNIT_KIND_NPC_LEADER],
  );

/** 국가마다 수도(가장 작은 ID 시작 도시)와 그 행정 건물 */
const capitals = () =>
  rows<{ faction_id: string; city_id: string; map_key: string; building_id: string }>(
    test.db,
    `select distinct on (c.faction_id) c.faction_id, c.id as city_id, c.map_key, f.building_id
       from world_cities c join world_facilities f on f.city_id = c.id and f.facility_id = 'government_hall'
      where c.start order by c.faction_id, c.id`,
  );

describe.skipIf(!TEST_DATABASE_URL)("NPC 국가 지도자·정부 판 (DB)", () => {
  it("고정 국가마다 수도 행정 건물 곁에 지도자 하나, 다시 켜도 그대로, 정부 판·세력 화면이 읽는다", async () => {
    const world = await boot();
    const first = await leaders();
    const caps = await capitals();
    expect(first).toHaveLength(4);
    expect(caps).toHaveLength(4);
    expect(new Set(first.map((row) => row.faction_id)).size).toBe(4);
    for (const leader of first) {
      const capital = caps.find((row) => row.faction_id === leader.faction_id);
      expect(capital?.map_key).toBe(leader.map_key);
      // 그 2차맵에 서 있다(지도자 찾기 = 메모리 유닛)
      const map = world.maps.get(Number(leader.map_key));
      expect(map?.unitInfo(Number(leader.id))?.kind).toBe(UNIT_KIND_NPC_LEADER);
    }

    // 정부 판: 수도 행정 건물
    const government = governmentReadsOfWorld(world, {
      knownCityIds: async () =>
        new Set(
          (await rows<{ id: string }>(test.db, `select id from world_cities`)).map((r) => Number(r.id)),
        ),
      nationName: (code) => nationName(code, presets),
      leaderName: (code) => nationLeaderName(code, presets),
    });
    const viewer = {
      id: "00000000-0000-4000-8000-000000000000",
      loginId: "nobody",
      roles: ["player" as const],
    };
    const capital = caps[1];
    if (!capital) throw new Error("capital");
    const answer = await government.government(viewer, Number(capital.building_id), clock);
    expect(answer.status).toBe("ready");
    expect(answer.city).toMatchObject({
      id: Number(capital.city_id),
      capital: true,
      start: true,
      adminLevel: 1,
    });
    expect(answer.city?.humans).toBeGreaterThan(0);
    expect(answer.nation?.fixed).toBe(true);
    expect(answer.nation?.mine).toBe(false);
    // 이 시험 세계는 도시 경제 입력이 없어 세율을 모른다(경제가 도는 서버는 그 나라 세율 — reads.test.ts)
    expect(answer.nation?.taxBp).toBeNull();
    expect(answer.leader?.here).toBe(true);
    expect(answer.leader?.name?.ko).toMatch(/지도자/);
    const farm = await rows<{ building_id: string }>(
      test.db,
      `select building_id from world_facilities where facility_id = 'farm' limit 1`,
    );
    expect((await government.government(viewer, Number(farm[0]?.building_id), clock)).status).toBe(
      "not_government",
    );

    // 세력 화면 실제 자료: 그 나라에 든 사용자는 지도자 유닛과 팩 이름을 받는다
    const user = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('Fake Leader', 'fake_leader@id.placeholder.invalid', 'fake_leader') returning id`,
    );
    const userId = String(user[0]?.id);
    await test.db.$client.query(`insert into faction_members (user_id, faction_id) values ($1, $2)`, [
      userId,
      Number(capital.faction_id),
    ]);
    const real = withNationNames(await readFactionReal(test.db.$client, userId), {
      nationNames: (code) => ({ name: nationName(code, presets), leader: nationLeaderName(code, presets) }),
    });
    expect(real.faction?.leaderUnit).toBe(
      Number(first.find((row) => row.faction_id === capital.faction_id)?.id),
    );
    expect(real.faction?.leaderName?.ko).toMatch(/지도자/);
    expect(real.faction?.label?.ko.length ?? 0).toBeGreaterThan(0);

    // 다시 켜도 그대로(같은 유닛, 더 세우지 않음)
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    await boot();
    expect((await leaders()).map((row) => row.id)).toEqual(first.map((row) => row.id));
  });
});
