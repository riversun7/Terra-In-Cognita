// 세계 씨앗 DB 통합 시험 — docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗". TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 고정 국가마다 시작 도시(나라 성격 칸: 큰 나라 4·보통 3·작은 나라 2, 칸 없는 국가 = 아래 끝 2 — WP5)를 시험 2차맵들에 나누고, 도시마다
// 팩 도시 이름(510 다)을 붙이고, 시작 도시마다 기본 시설을 다 지은 채로 세우며, 다시 켜도 그대로(멱등)이고, 옛 세계(국가마다 첫 장 도시
// 하나)에서 켜면 모자란 도시만 더하는지, 사이보그 만들기 목록에 그대로 보이는지 본다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { type World, startWorld, testMapKey } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
// 옛 규칙(등급 없음, 성격 칸 도시 수 4·3·2)을 보는 시험이다 — 국력 등급 씨앗은 world/nationTiers.db.test.ts
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));
/** 옛 세계 흉내: 국가마다 시작 도시 하나 */
const ONE_CITY = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
};

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

async function boot(options: {
  testMaps: number;
  npc?: boolean;
  rules?: typeof TEST_SOCIETY_COEFFICIENTS;
  /** 국가 프리셋(없으면 팩 그대로) */
  presets?: typeof presets;
}): Promise<World> {
  const rules = options.rules;
  const world = startWorld({
    testBots: 12,
    testMaps: options.testMaps,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc:
      options.npc === false
        ? undefined
        : { testNations: 4, manual: true, presets: options.presets ?? presets },
    cyborgRules: rules ? () => rules : undefined,
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

type CityLine = {
  id: string;
  code: string;
  map_key: string;
  cell_x: number;
  cell_y: number;
  name: string | null;
  housing: number;
};
const startCities = () =>
  rows<CityLine>(
    test.db,
    `select c.id, f.code, c.map_key, c.cell_x, c.cell_y, c.name, c.housing from world_cities c join factions f on f.id = c.faction_id
     where c.start order by c.id`,
  );
/** 숙소 수 = ⌈주거 ÷ Lv1 침대 10⌉, 위 끝 8(질문 1049 나, npcSeed.ts seedLodgings) — 시설 목록(이름 차례)에 넣는다 */
const withLodgings = (list: readonly string[], housing: number): string[] =>
  [...list, ...Array.from({ length: Math.min(8, Math.ceil(housing / 10)) }, () => "lodging")].toSorted();
/** 기본 시설(성벽 고리는 따로 — walls) */
const seeded = () =>
  rows<{ city_id: string; facility_id: string; level: number; owner_ok: boolean }>(
    test.db,
    `select wf.city_id, wf.facility_id, wf.level,
            (b.owner_id = (select o.id from world_owners o join world_cities c on c.faction_id = o.faction_id
                           where c.id = wf.city_id)) as owner_ok
     from world_facilities wf join world_buildings b on b.id = wf.building_id
     where wf.facility_id <> 'city_wall' order by wf.city_id, wf.facility_id`,
  );
/** 도시마다 성벽 수(질문 1048 가, cityWalls.ts) */
const walls = () =>
  rows<{ city_id: string; n: number }>(
    test.db,
    `select city_id, count(*)::int as n from world_facilities where facility_id = 'city_wall' group by city_id order by city_id`,
  );
const codes = ["s3_test_npc", ...presets.slice(0, 3).map((preset) => preset.code)];
/** 국가 1 = 16번째 프리셋(성격 칸 없음 → 아래 끝 2), 2~4 = 프리셋 1~3(팩 성격 칸 4·3·2) */
const nationPresets = [presets[15], ...presets.slice(0, 3)];
const WANT = [2, 4, 3, 2];

describe.skipIf(!TEST_DATABASE_URL)("세계 씨앗(고정 국가 시작 도시·기본 시설)", () => {
  it("국가마다 씨앗 값(시작 국가 설정 편집기): 그 국가만 주거·처음 인구·기본 시설 수가 다르다", async () => {
    // 국가 2(프리셋 1)만 주거 60·처음 인구 50%·농장 2·창고 2·벌목장 0·광산 0. 나머지는 설정 칸 값(주거 40 등)
    const edited = presets.map((preset, index) =>
      index === 0
        ? {
            ...preset,
            personality: {
              ...preset.personality,
              startHousing: 60,
              startPopulationPm: 500,
              startFarms: 2,
              startStorehouses: 2,
              startLumberCamps: 0,
              startMines: 0,
            },
          }
        : preset,
    );
    const rules = {
      ...TEST_SOCIETY_COEFFICIENTS,
      worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, populationPm: 250 },
    };
    const world = await boot({ testMaps: 3, presets: edited, rules });
    const lines = await rows<{ code: string; housing: number; humans: string; id: string }>(
      test.db,
      `select f.code, c.housing, c.id, (select count(*) from world_humans h where h.city_id = c.id) as humans
         from world_cities c join factions f on f.id = c.faction_id where c.start order by c.id`,
    );
    const mine = lines.filter((line) => line.code === "placeholder_nation_01");
    const others = lines.filter((line) => line.code !== "placeholder_nation_01");
    expect(mine).toHaveLength(4);
    // 새 시작 도시의 주거 = 국가 칸 60, 처음 인구 = 60 × 50% = 30(봇 12가 가까운 도시의 휴먼이 되어 더해질 수 있다)
    for (const line of mine) {
      expect(line.housing).toBeGreaterThanOrEqual(60);
      expect(Number(line.humans)).toBeGreaterThanOrEqual(30);
    }
    // 다른 국가 = 설정 칸(주거 40 × 25% = 10)
    for (const line of others) expect(Number(line.humans)).toBeLessThan(30);
    expect(others.some((line) => line.housing === 40)).toBe(true);
    const facilities = await seeded();
    for (const line of mine)
      expect(facilities.filter((row) => row.city_id === line.id).map((row) => row.facility_id)).toEqual(
        withLodgings(
          ["farm", "farm", "fx_exchange", "goods_exchange", "government_hall", "storehouse", "storehouse"],
          line.housing,
        ),
      );
    for (const line of others)
      expect(facilities.filter((row) => row.city_id === line.id).map((row) => row.facility_id)).toEqual(
        withLodgings(
          ["farm", "fx_exchange", "goods_exchange", "government_hall", "lumber_camp", "mine", "storehouse"],
          line.housing,
        ),
      );
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("빈 세계: 국가 넷 × 나라 성격 수(2·4·3·2)를 2차맵 셋에 나누고, 팩 도시 이름, 도시마다 기본 시설 여덟 + 거래소 둘(전략 배치), 다시 켜도 그대로", async () => {
    const world = await boot({ testMaps: 3 });
    const cities = await startCities();
    const perNation = codes.map((code) => cities.filter((city) => city.code === code));
    expect(perNation.map((list) => list.length)).toEqual(WANT);
    // 국가 하나의 도시는 2차맵 수까지 서로 다른 2차맵에, 2차맵마다 도시가 있다(국가 1이 모든 2차맵에 있지는 않다)
    for (const list of perNation)
      expect(new Set(list.map((city) => city.map_key)).size).toBe(Math.min(list.length, 3));
    // 도시 이름 = 그 국가 프리셋 목록 차례(510 다, 번역하지 않는다)
    perNation.forEach((list, index) =>
      expect(list.map((city) => city.name)).toEqual(nationPresets[index]?.cityNames?.slice(0, list.length)),
    );
    const mapKeys = [0, 1, 2].map((k) => String(testMapKey(k)));
    for (const mapKey of mapKeys) expect(cities.some((city) => city.map_key === mapKey)).toBe(true);
    expect(perNation[0]?.map((city) => city.map_key)).toEqual(mapKeys.slice(0, 2));

    const facilities = await seeded();
    expect(facilities).toHaveLength(
      cities.reduce((sum, city) => sum + withLodgings([], city.housing).length + 7, 0),
    );
    // 성벽 고리(설정 칸 city_wall_mode 1): 도시마다 행정 건물 둘레에 몇 토막
    const wallRows = await walls();
    expect(wallRows).toHaveLength(cities.length);
    for (const row of wallRows) expect(row.n).toBeGreaterThanOrEqual(4);
    // 전략 배치(docs/adr/2026-11-11-city-building-layout.md): 행정 건물은 도시 칸 가운데(3×3 가운데 = 도시 칸). 그 칸에 원자재
    // 오브젝트·막힌 땅이 있으면 가장 가까운 자리(몇 칸 안)
    const halls = await rows<{ cell_x: number; cell_y: number; x: number; y: number }>(
      test.db,
      `select c.cell_x, c.cell_y, b.x, b.y from world_facilities wf join world_buildings b on b.id = wf.building_id
         join world_cities c on c.id = wf.city_id where wf.facility_id = 'government_hall'`,
    );
    expect(halls).toHaveLength(cities.length);
    for (const hall of halls)
      expect(
        Math.max(Math.abs(hall.x + 1 - hall.cell_x), Math.abs(hall.y + 1 - hall.cell_y)),
      ).toBeLessThanOrEqual(3);
    expect(
      halls.filter((hall) => hall.x + 1 === hall.cell_x && hall.y + 1 === hall.cell_y).length,
    ).toBeGreaterThan(halls.length / 2);
    for (const city of cities)
      expect(facilities.filter((row) => row.city_id === city.id).map((row) => row.facility_id)).toEqual(
        withLodgings(
          ["farm", "fx_exchange", "goods_exchange", "government_hall", "lumber_camp", "mine", "storehouse"],
          city.housing,
        ),
      );
    expect(facilities.every((row) => row.level === 1 && row.owner_ok)).toBe(true);

    // 사이보그 만들기 목록: 국가 넷, 국가마다 나라 성격 수, 이름 = 팩 국가 프리셋(국가 1 = 16번째 프리셋), 도시 이름 = 팩
    const creation = world.persistence?.cyborgs.creation("fake-user", clock);
    expect(creation?.factions.map((faction) => faction.cities.length)).toEqual(WANT);
    expect(
      creation?.factions[1]?.cities.every((city) => presets[0]?.cityNames?.includes(city.name ?? "")),
    ).toBe(true);
    expect(creation?.factions[0]?.name).toEqual(presets[15]?.name);
    expect(creation?.factions[1]?.name).toEqual(presets[0]?.name);
    expect(await world.checkInvariants()).toEqual([]);

    await stop(world);
    const again = await boot({ testMaps: 3 });
    expect(await startCities()).toEqual(cities);
    expect(await seeded()).toEqual(facilities);
    expect(await walls()).toEqual(wallRows);
    expect(await again.checkInvariants()).toEqual([]);
  }, 60_000);

  it("옛 세계(국가마다 첫 장 도시 하나): 있는 도시는 그대로 두고 모자란 도시만 다른 2차맵에 더한다", async () => {
    const old = await boot({ testMaps: 1, rules: ONE_CITY });
    const before = await startCities();
    expect(before.map((city) => city.code)).toEqual(codes);
    await stop(old);

    const world = await boot({ testMaps: 3 });
    const after = await startCities();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(codes.map((code) => after.filter((city) => city.code === code).length)).toEqual(WANT);
    expect(after.every((city) => city.name !== null)).toBe(true);
    // 새 도시는 옛 도시와 32칸 넘게 떨어진다
    for (const city of after.slice(before.length))
      for (const other of before)
        if (other.map_key === city.map_key)
          expect(Math.hypot(other.cell_x - city.cell_x, other.cell_y - city.cell_y)).toBeGreaterThanOrEqual(
            32,
          );
    expect(await seeded()).toHaveLength(
      after.reduce((sum, city) => sum + withLodgings([], city.housing).length + 7, 0),
    );
    expect(await world.checkInvariants()).toEqual([]);
  }, 60_000);

  it("NPC 사회를 끈 세계는 옛 방식(시험 NPC 세력이 2차맵마다 가운데 도시 하나, 기본 시설 없음)", async () => {
    await boot({ testMaps: 2, npc: false });
    const cities = await startCities();
    expect(cities.map((city) => [city.code, city.cell_x, city.cell_y])).toEqual([
      ["s3_test_npc", 128, 128],
      ["s3_test_npc", 128, 128],
    ]);
    expect(await seeded()).toEqual([]);
  });
});
