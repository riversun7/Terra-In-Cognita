// 지도 흐름 조회 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름") — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 시험 국가 둘 + 시험 NPC 세력의 시작 도시 → world.cities: 국가 이름·차례·1차맵 칸·띄운 맵·시야(사이보그를 만든 사람만 볼 수 있다),
// world.myPosition: 사이보그 본체가 선 2차맵·배치 칸(시작 도시 둘레), 사이보그 없는 계정은 자리 없음 + 띄운 첫 2차맵.
// 도시 안개(WP7): 시작 도시가 아닌 다른 국가 도시는 그 자리를 본 사람(탐사 기록·지금 내 사이보그 시야)·전체 보기 권한만 받는다.
import { decodeCellKey, isCellKey } from "@terra/planet";
import { DAY_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import type { Viewer } from "../trpc/context.ts";
import { silentLog } from "../world/testSupport.ts";
import { TEST_MAP_KEY, TEST_PLANET_ID, type World, startWorld } from "../world/world.ts";
import { cityVisionCell } from "./knownCities.ts";
import { worldMapReadsOf } from "./reads.ts";

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

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
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function newUser(name: string): Promise<Viewer> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return { id: String(found[0]?.id), loginId: name.toLowerCase(), roles: ["player"] };
}

/** 사이보그를 만든다(첫 국가의 첫 시작 도시) */
async function makeCyborg(world: World, viewer: Viewer) {
  const persistence = world.persistence;
  if (!persistence) throw new Error("persistence");
  const creation = persistence.cyborgs.creation(viewer.id, clock);
  const faction = creation.factions[0];
  const startCity = faction?.cities[0];
  if (!faction || !startCity) throw new Error("no start city");
  await persistence.cyborgs.roll(viewer.id, "balanced");
  const made = await persistence.cyborgs.create(viewer.id, {
    name: viewer.loginId.slice(0, 12),
    appearance: {
      head: "dome",
      face: "visor",
      body: "slim",
      limbs: "piston",
      primary: "mint",
      accent: "lemon",
    },
    factionId: faction.id,
    cityId: startCity.id,
    elements: { fire: 6, wind: 4 },
  });
  expect(made.ok).toBe(true);
  await persistence.writer.durable();
  return { factionId: faction.id, cityId: startCity.id };
}

/** 시작 도시가 아닌 도시 하나를 표에 바로 넣는다(NPC 사회가 세운 마을과 같은 줄) */
async function insertCity(spec: { factionId: number; mapKey: number; cellX: number; cellY: number }) {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into world_cities (id, faction_id, planet_id, map_key, cell_x, cell_y, start, founded_at_ms)
     values ((select coalesce(max(id), 0) + 1000 from world_cities), $1, $2, $3, $4, $5, false, $6) returning id`,
    [spec.factionId, TEST_PLANET_ID, spec.mapKey, spec.cellX, spec.cellY, clock],
  );
  return Number(found[0]?.id);
}

describe.skipIf(!TEST_DATABASE_URL)("지도 흐름 조회(world.cities·myPosition)", () => {
  it("도시·국가·시야, 내 사이보그 자리", async () => {
    const world = await boot();
    const persistence = world.persistence;
    if (!persistence) throw new Error("persistence");
    const reads = worldMapReadsOf({ world, pool: test.db.$client, planetId: TEST_PLANET_ID, faceLevel: 9 })();
    if (!reads) throw new Error("reads not ready");

    const maker = await newUser("MapMaker");
    const stranger = await newUser("MapStranger");

    // 사이보그 없는 계정: 자리 없음, 띄운 첫 2차맵, 시험 맵은 볼 수 없다(유닛·탐사 없음)
    const empty = reads.position(stranger, clock);
    expect(empty).toMatchObject({ status: "ready", position: null, fallbackMapKey: TEST_MAP_KEY });
    const before = await reads.cities(stranger, clock);
    expect(before.status).toBe("ready");
    expect(before.planetId).toBe(TEST_PLANET_ID);
    expect(before.myFactionId).toBeNull();
    expect(before.cities.length).toBeGreaterThanOrEqual(2);
    const first = before.cities[0];
    if (!first || !isCellKey(first.mapKey)) throw new Error("no city");
    const cell = decodeCellKey(first.mapKey);
    expect(first).toMatchObject({
      face: cell.face,
      i: cell.i,
      j: cell.j,
      start: true,
      loaded: true,
      viewable: false,
    });
    expect(Math.abs(first.latDeg)).toBeLessThanOrEqual(90);
    expect(first.land).toBeNull();
    // 국가마다 차례 1부터, 이름(시험 NPC 세력·시험 국가)
    for (const faction of before.factions) {
      const numbers = before.cities
        .filter((city) => city.factionId === faction.id)
        .map((city) => city.number);
      expect(numbers[0]).toBe(1);
      expect(faction.name?.ko.length ?? 0).toBeGreaterThan(0);
    }
    // 수도 표시(D-528, 1차맵 영토 레이어): 세력 행 capital_city_id인 도시만 capital
    await test.db.$client.query("update factions set capital_city_id = $1 where id = $2", [
      first.id,
      first.factionId,
    ]);
    const capitals = (await reads.cities(stranger, clock)).cities.filter(
      (city) => city.capital && city.factionId === first.factionId,
    );
    expect(capitals.map((city) => city.id)).toEqual([first.id]);

    // 사이보그를 만들면: 그 국가에 들고, 본체가 선 2차맵을 볼 수 있다
    const creation = persistence.cyborgs.creation(maker.id, clock);
    const faction = creation.factions[0];
    const startCity = faction?.cities[0];
    if (!faction || !startCity) throw new Error("no start city");
    await persistence.cyborgs.roll(maker.id, "balanced");
    const made = await persistence.cyborgs.create(maker.id, {
      name: "MapMaker",
      appearance: {
        head: "dome",
        face: "visor",
        body: "slim",
        limbs: "piston",
        primary: "mint",
        accent: "lemon",
      },
      factionId: faction.id,
      cityId: startCity.id,
      elements: { fire: 6, wind: 4 },
    });
    expect(made.ok).toBe(true);
    await persistence.writer.durable();

    const mine = reads.position(maker, clock);
    const city = before.cities.find((entry) => entry.id === startCity.id);
    if (!city || !mine.position) throw new Error("position");
    expect(mine.position).toMatchObject({
      planetId: TEST_PLANET_ID,
      mapKey: city.mapKey,
      startCityId: city.id,
    });
    expect(Math.abs(mine.position.cellX - city.cellX)).toBeLessThanOrEqual(24);
    expect(Math.abs(mine.position.cellY - city.cellY)).toBeLessThanOrEqual(24);

    const after = await reads.cities(maker, clock);
    expect(after.myFactionId).toBe(faction.id);
    expect(after.cities.find((entry) => entry.id === city.id)?.viewable).toBe(true);
    // 다른 사람의 시야는 그대로
    expect((await reads.cities(stranger, clock)).cities.find((entry) => entry.id === city.id)?.viewable).toBe(
      false,
    );
  });

  it("도시 안개: 시작 도시·내 국가·본 자리·전체 보기만, 차례는 모든 도시로", async () => {
    const world = await boot();
    const reads = worldMapReadsOf({ world, pool: test.db.$client, planetId: TEST_PLANET_ID, faceLevel: 9 })();
    if (!reads) throw new Error("reads not ready");
    const maker = await newUser("FogMaker");
    const stranger = await newUser("FogStranger");
    const explorer = await newUser("FogExplorer");
    const devViewer: Viewer = { ...(await newUser("FogDev")), roles: ["dev"] };

    const mine = await makeCyborg(world, maker);
    const at = reads.position(maker, clock).position;
    if (!at) throw new Error("position");
    const all = await reads.cities(stranger, clock);
    // 시작 도시는 모두 보인다(첫 접속 도시 단계)
    expect(all.cities.length).toBeGreaterThanOrEqual(2);
    expect(all.cities.every((city) => city.start)).toBe(true);
    const other = all.factions.find((faction) => faction.id !== mine.factionId);
    if (!other) throw new Error("no other faction");

    // 다른 국가의 마을 둘: 내 사이보그 곁(지금 시야), 같은 2차맵 먼 구석(아무도 본 적 없음)
    const nearX = Math.min(255, at.cellX + 4);
    const near = await insertCity({ factionId: other.id, mapKey: at.mapKey, cellX: nearX, cellY: at.cellY });
    const farX = at.cellX < 128 ? 250 : 5;
    const farY = at.cellY < 128 ? 250 : 5;
    const far = await insertCity({ factionId: other.id, mapKey: at.mapKey, cellX: farX, cellY: farY });
    // 탐사 기록: explorer는 먼 마을 자리를 본 적이 있다(구독한 적이 없는 사람 — 기록만 DB에)
    const bits = new Uint8Array(128);
    const cell = cityVisionCell(farX, farY);
    bits[cell >> 3] = 1 << (cell & 7);
    await test.db.$client.query(
      `insert into world_exploration (user_id, map_key, planet_id, cells, updated_at_ms) values ($1, $2, $3, $4, $5)`,
      [explorer.id, at.mapKey, TEST_PLANET_ID, Buffer.from(bits), clock],
    );

    const ids = async (viewer: Viewer) => (await reads.cities(viewer, clock)).cities.map((city) => city.id);
    expect(await ids(stranger)).not.toContain(near);
    expect(await ids(stranger)).not.toContain(far);
    expect(await ids(maker)).toContain(near);
    expect(await ids(maker)).not.toContain(far);
    expect(await ids(explorer)).toContain(far);
    expect(await ids(explorer)).not.toContain(near);
    const seenByDev = await reads.cities(devViewer, clock);
    expect(seenByDev.cities.map((city) => city.id)).toEqual(expect.arrayContaining([near, far]));
    // "도시 N" 차례는 모르는 도시까지 센다: explorer가 받은 먼 마을 차례 = 전체 보기의 차례
    const farForExplorer = (await reads.cities(explorer, clock)).cities.find((city) => city.id === far);
    expect(farForExplorer?.number).toBe(seenByDev.cities.find((city) => city.id === far)?.number);
  });
});
