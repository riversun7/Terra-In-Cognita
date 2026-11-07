// 지도 흐름 조회 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름") — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 시험 국가 둘 + 시험 NPC 세력의 시작 도시 → world.cities: 국가 이름·차례·1차맵 칸·띄운 맵·시야(사이보그를 만든 사람만 볼 수 있다),
// world.myPosition: 사이보그 본체가 선 2차맵·배치 칸(시작 도시 둘레), 사이보그 없는 계정은 자리 없음 + 띄운 첫 2차맵.
import { decodeCellKey, isCellKey } from "@terra/planet";
import { DAY_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import type { Viewer } from "../trpc/context.ts";
import { silentLog } from "../world/testSupport.ts";
import { TEST_MAP_KEY, TEST_PLANET_ID, type World, startWorld } from "../world/world.ts";
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
});
