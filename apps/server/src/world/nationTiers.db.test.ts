// 국력 등급 씨앗·반영 DB 통합 시험 — docs/adr/2026-11-10-nation-editor.md·2026-11-07-world-layout.md "바뀜 (2026-11-11)".
// TEST_DATABASE_URL이 있을 때만. 계정·행성 값은 시험용 가짜다(면 5만 바다인 풀밭).
// 1. 새 세계: 국가 넷이 팩 등급(소국·초강대국·강대국·중견국)대로 시작 도시·주거·처음 인구·경비대·기술·국고·시설을 받고, 강한 나라일수록
//    서로 멀고 도시가 넓게 퍼지며, 다시 켜도 그대로(멱등).
// 2. 이미 선 세계: 등급이 든 팩으로 켜도(배포) 그대로이고, 미리 보기는 아무것도 쓰지 않으며, 반영 예약 뒤 다음 켤 때 모자란 도시·주거·휴먼·
//    경비대·기술만 더한다(옛 도시·플레이어 것은 그대로, 감사 기록, 불변 조건 0). 한 번 더 켜도 더 늘지 않는다.
// 3. 이 세계에 이 국가 세우기: 차례 밖 프리셋에 자리를 놓으면 다음 켤 때 그 국가가 등급대로 선다.
// 4. 경비대 다시 채우기(기획 답 920 나): 죽은 경비대를 NPC 판단의 구인 규칙식(@terra/sim — 시뮬과 같은 함수)이 구인 카드로 등급 값까지
//    다시 채운다(값은 국고에서 소각, 경비대 표시 저장, 등급 값을 넘지 않음). 국고가 없으면 채우지 않는다.
import { loadContentPack } from "@terra/content/node";
import { cellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { placementCellKey, territoryMetric, territoryPoint } from "@terra/planet/territory";
import { territoryDistanceMilli } from "@terra/shared/territory";
import {
  DAY_MS,
  type SimWorld,
  TEST_SOCIETY_COEFFICIENTS,
  generateTempTerrain,
  seedFromCellKey,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import type { NationPreset } from "../npc/nations.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import { ASSET_CREDIT } from "./settlement.ts";
import { createPlacementService } from "./placementService.ts";
import type { TerrainService } from "./terrainService.ts";
import { worldMapReadsOf } from "../worldMap/reads.ts";
import { addTestUnits, legacyNationPresets } from "./testSupport.ts";
import { type World, startWorld, testMapKey } from "./world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
/** 팩 그대로(국력 등급이 붙은 프리셋) */
const tiered = nationPresetsOf(loaded.pack);
/** 등급 전의 팩 흉내(시작 도시 4·3·2·없음) */
const legacy = legacyNationPresets(tiered);
const metric = territoryMetric(9);
const PLANET = "s2_test_planet";
/** 국가 넷(1번 = 16번째 프리셋 소국, 2~4번 = 프리셋 1~3 초강대국·강대국·중견국) */
const CODES = ["s3_test_npc", "placeholder_nation_01", "placeholder_nation_02", "placeholder_nation_03"];

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
    // 2차맵 지형은 모두 첫 시험 2차맵의 임시 지형(가운데 둘레에 설 자리가 있다 — 도시마다 휴먼 수를 정확히 본다)
    get: async (mapKey) => mapTerrainFromTemp(mapKey, generateTempTerrain(seedFromCellKey(testMapKey(0)))),
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

async function boot(presets: readonly NationPreset[]): Promise<World> {
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

type CityLine = {
  id: string;
  code: string;
  map_key: string;
  cell_x: number;
  cell_y: number;
  housing: number;
  humans: string;
  guards: string;
};
const startCities = () =>
  rows<CityLine>(
    test.db,
    `select c.id, f.code, c.map_key, c.cell_x, c.cell_y, c.housing,
            (select count(*) from world_humans h where h.city_id = c.id and not h.guard) as humans,
            (select count(*) from world_humans h where h.city_id = c.id and h.guard) as guards
     from world_cities c join factions f on f.id = c.faction_id where c.start order by c.id`,
  );
const byCode = (cities: readonly CityLine[]) =>
  CODES.map((code) => cities.filter((city) => city.code === code));
const pointOf = (city: CityLine) =>
  territoryPoint(placementCellKey(parseCellKey(Number(city.map_key)), city.cell_x, city.cell_y));
const cells = (a: CityLine, b: CityLine) => territoryDistanceMilli(pointOf(a), pointOf(b), metric) / 1000;
const count = async (sql: string): Promise<number> => Number((await rows<{ n: string }>(test.db, sql))[0]?.n);
const techs = async () =>
  (
    await rows<{ code: string; tech_level: number }>(
      test.db,
      `select code, tech_level from factions where code = any($1::text[])`,
      [CODES],
    )
  ).toSorted((a, b) => CODES.indexOf(a.code) - CODES.indexOf(b.code));

/** 미리 보기가 아무것도 쓰지 않았는지 견줄 줄 수 */
const snapshot = async (): Promise<number[]> => [
  await count(`select count(*) as n from world_cities`),
  await count(`select count(*) as n from world_units`),
  await count(`select count(*) as n from world_humans`),
  await count(`select count(*) as n from audit_log`),
  await count(`select count(*) as n from world_tier_requests`),
];
const sumOf = (list: readonly CityLine[], key: "humans" | "guards"): number =>
  list.reduce((n, city) => n + Number(city[key]), 0);

async function newUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

const service = (presets: readonly NationPreset[]) =>
  createPlacementService({
    pool: test.db.$client,
    planetId: PLANET,
    testMapKeys: [testMapKey(0), testMapKey(1)],
    land: cellValues,
    seed: () => TEST_SOCIETY_COEFFICIENTS.worldSeed,
    nationName: () => undefined,
    now: () => clock,
    presets: () => presets,
    testNations: 4,
  });

/** 거울 세계에서 그 도시의 경비대 ID(ID 차례) */
const guardsIn = (mirror: SimWorld, cityId: number): number[] =>
  [...mirror.units.values()]
    .filter((unit) => unit.city === cityId && unit.guard === true)
    .map((unit) => unit.id)
    .toSorted((a, b) => a - b);

describe.skipIf(!TEST_DATABASE_URL)("국력 등급(고정 NPC 국가의 고르지 않은 힘 분포)", () => {
  it("새 세계: 등급대로 도시·주거·인구·경비대·기술·국고·시설, 강한 나라는 멀고 넓게, 다시 켜도 그대로", async () => {
    const world = await boot(tiered);
    const cities = await startCities();
    const lists = byCode(cities);
    // 소국 2 · 초강대국 6 · 강대국 4 · 중견국 3
    expect(lists.map((list) => list.length)).toEqual([2, 6, 4, 3]);
    expect(lists.map((list) => [...new Set(list.map((city) => city.housing))])).toEqual([
      [32],
      [60],
      [50],
      [40],
    ]);
    // 처음 인구 = 주거 × 75%, 경비대 = 등급 수(도시마다)
    expect(lists.map((list) => [...new Set(list.map((city) => Number(city.humans)))])).toEqual([
      [24],
      [45],
      [37],
      [30],
    ]);
    expect(lists.map((list) => [...new Set(list.map((city) => Number(city.guards)))])).toEqual([
      [2],
      [5],
      [4],
      [3],
    ]);
    expect((await techs()).map((row) => row.tech_level)).toEqual([1, 3, 3, 2]);
    // 처음 국고: 강한 등급이 많다(소국 600‰ < 중견국 1000‰ < 강대국 2000‰ < 초강대국 3000‰)
    const credit = await rows<{ code: string; balance: string }>(
      test.db,
      `select f.code, a.balance from ledger_accounts a join world_owners o on o.id = a.owner_id
       join factions f on f.id = o.faction_id where a.asset = 's3_test_credit' and f.code = any($1::text[])`,
      [CODES],
    );
    const balance = (code: string) => BigInt(credit.find((row) => row.code === code)?.balance ?? "0");
    const [small, superpower, great, middle] = CODES.map(balance);
    expect(small !== undefined && middle !== undefined && small < middle).toBe(true);
    expect(middle !== undefined && great !== undefined && middle < great).toBe(true);
    expect(great !== undefined && superpower !== undefined && great < superpower).toBe(true);
    // 기본 시설(풀밭: 농장만 땅에 맞는다): 초강대국·강대국 = 농장 2·창고 2, 중견국·소국 = 농장 1·창고 1
    const facilities = await rows<{ city_id: string; facility_id: string }>(
      test.db,
      `select city_id, facility_id from world_facilities order by city_id, facility_id`,
    );
    const facilitiesOf = (city: CityLine) =>
      facilities.filter((row) => row.city_id === city.id).map((row) => row.facility_id);
    const big = ["farm", "farm", "government_hall", "storehouse", "storehouse"];
    const plain = ["farm", "government_hall", "storehouse"];
    lists.forEach((list, index) => {
      for (const city of list) expect(facilitiesOf(city)).toEqual(index === 1 || index === 2 ? big : plain);
    });
    // 도시 간격: 초강대국·강대국은 수도에서 두 칸 걸음(넓게), 중견국·소국은 붙은 2차맵
    const spread = lists.map(([capital, ...rest]) =>
      capital ? Math.min(...rest.map((city) => cells(city, capital))) : 0,
    );
    expect(spread[1]).toBeGreaterThan(1.7);
    expect(spread[2]).toBeGreaterThan(1.7);
    expect(spread[3]).toBeLessThan(1.6);
    expect(spread[0]).toBeLessThan(1.6);
    // 국가 사이: 초강대국 ↔ 강대국(간격 30 × 1.45)이 소국 ↔ 가장 가까운 이웃보다 멀다
    const capitals = lists.map((list) => list[0]);
    const between = (a: number, b: number) => {
      const x = capitals[a];
      const y = capitals[b];
      return x && y ? cells(x, y) : 0;
    };
    expect(between(1, 2)).toBeGreaterThan(30 * 1.45 - 0.01);
    const smallNearest = Math.min(between(0, 1), between(0, 2), between(0, 3));
    expect(smallNearest).toBeLessThan(between(1, 2));
    expect(smallNearest).toBeGreaterThan(30 * 0.85 - 0.01);
    // 한 2차맵에 도시 하나, 띄운 2차맵 = 시험 줄 2 + 도시 15
    expect(new Set(cities.map((city) => city.map_key)).size).toBe(15);
    expect(world.maps.size).toBe(17);
    const units = await count(`select count(*) as n from world_units`);
    // 휴먼 556 + 경비대 59 + 지도자 4
    expect(units).toBe(2 * 24 + 6 * 45 + 4 * 37 + 3 * 30 + (2 * 2 + 6 * 5 + 4 * 4 + 3 * 3) + 4);
    expect(await world.checkInvariants()).toEqual([]);
    await stop(world);

    const again = await boot(tiered);
    expect(await startCities()).toEqual(cities);
    expect(await count(`select count(*) as n from world_units`)).toBe(units);
    expect(await again.checkInvariants()).toEqual([]);
  }, 120_000);

  it("이미 선 세계: 배포만으로 그대로, 미리 보기는 쓰지 않고, 반영 예약 뒤 다음 켤 때 모자란 것만 더한다", async () => {
    // 등급 전 세계: 2·4·3·2곳, 주거 40, 경비대 없음
    const old = await boot(legacy);
    const before = await startCities();
    expect(byCode(before).map((list) => list.length)).toEqual([2, 4, 3, 2]);
    expect(before.every((city) => city.housing === 40 && city.guards === "0")).toBe(true);
    // 플레이어 유닛(초강대국 첫 도시 2차맵)
    const player = await newUser("TierPlayer");
    const playerMap = Number(byCode(before)[1]?.[0]?.map_key);
    expect(addTestUnits(old, player, playerMap, 2, clock)).toHaveLength(2);
    await old.persistence?.writer.durable();
    const playerUnits = () =>
      rows<{ id: string; map_key: string }>(
        test.db,
        `select u.id, u.map_key from world_units u join world_owners o on o.id = u.owner_id
         where o.user_id = $1 order by u.id`,
        [player],
      );
    const mine = await playerUnits();
    await stop(old);

    // 등급이 든 팩으로 켠다(배포): 도시·휴먼·경비대 그대로
    const deployed = await boot(tiered);
    expect(await startCities()).toEqual(before);
    expect((await techs()).map((row) => row.tech_level)).toEqual([1, 1, 1, 1]);
    // 미리 보기: 무엇이 더해지는지 — 아무것도 쓰지 않는다
    const admin = await newUser("TierAdmin");
    const counts = await snapshot();
    const plan = await service(tiered).tierPlan();
    expect(await snapshot()).toEqual(counts);
    expect(plan?.request).toBeNull();
    const row = (code: string) => plan?.nations.find((nation) => nation.code === code);
    expect(CODES.map((code) => row(code)?.tier)).toEqual([
      "small_state",
      "superpower",
      "great_power",
      "middle_power",
    ]);
    expect(CODES.map((code) => row(code)?.cities)).toEqual([
      { have: 2, want: 2, add: 0, surplus: 0 },
      { have: 4, want: 6, add: 2, surplus: 0 },
      { have: 3, want: 4, add: 1, surplus: 0 },
      { have: 2, want: 3, add: 1, surplus: 0 },
    ]);
    // 초강대국: 옛 도시 넷의 주거 40 → 60, 휴먼 30 → 45(+15씩), 경비대 0 → 5, 새 도시 둘 × (45 + 5)
    expect(row("placeholder_nation_01")).toMatchObject({
      housingRaised: 4,
      humans: { have: 120, add: 60 },
      guards: { have: 0, add: 20 },
      newHumans: 90,
      newGuards: 10,
      tech: { from: 1, to: 3 },
    });
    // 소국: 주거는 내리지 않는다(40 그대로 — 처음 인구 30이 이미 등급 값 24보다 많다), 경비대만 2씩
    expect(row("s3_test_npc")).toMatchObject({
      housingRaised: 0,
      humans: { have: 60, add: 0 },
      guards: { have: 0, add: 4 },
      tech: { from: 1, to: 1 },
    });
    expect(plan?.totals.cities).toBe(4);
    expect(plan?.unitsNow).toBe(counts[1]);

    // 반영 예약(감사 기록) → 다음 켤 때 든다
    const requested = await service(tiered).requestTierApply({ userId: admin, ip: "10.0.0.9" });
    expect(requested?.request).toMatchObject({ appliedAtMs: null });
    expect(await startCities()).toEqual(before);
    await stop(deployed);
    clock += 60_000;
    const applied = await boot(tiered);
    const after = await startCities();
    expect(byCode(after).map((list) => list.length)).toEqual([2, 6, 4, 3]);
    // 옛 도시는 ID·자리 그대로, 주거는 올리기만
    for (const city of before) {
      const now = after.find((entry) => entry.id === city.id);
      expect(now).toMatchObject({ map_key: city.map_key, cell_x: city.cell_x, cell_y: city.cell_y });
    }
    const lists = byCode(after);
    expect(
      lists.map((list) => [...new Set(list.map((city) => city.housing))].toSorted((a, b) => a - b)),
    ).toEqual([[40], [60], [50], [40]]);
    expect(lists.map((list) => [...new Set(list.map((city) => Number(city.guards)))])).toEqual([
      [2],
      [5],
      [4],
      [3],
    ]);
    expect(lists[1]?.every((city) => Number(city.humans) === 45)).toBe(true);
    expect(lists[0]?.every((city) => Number(city.humans) === 30)).toBe(true);
    expect((await techs()).map((tech) => tech.tech_level)).toEqual([1, 3, 3, 2]);
    // 미리 보기의 합 = 실제로 더해진 수
    const total = plan?.totals ?? { cities: 0, humans: 0, guards: 0 };
    expect(after.length - before.length).toBe(total.cities);
    expect(sumOf(after, "humans") - sumOf(before, "humans")).toBe(total.humans);
    expect(sumOf(after, "guards")).toBe(total.guards);
    // 플레이어 유닛은 그대로
    expect(await playerUnits()).toEqual(mine);
    // 요청은 든 것으로 적히고 감사 기록이 남는다
    const request = await rows<{ applied_at_ms: string | null; report: Record<string, number> }>(
      test.db,
      `select applied_at_ms, report from world_tier_requests where planet_id = $1`,
      [PLANET],
    );
    expect(request[0]?.applied_at_ms).not.toBeNull();
    expect(request[0]?.report).toMatchObject({
      citiesAdded: total.cities,
      humans: total.humans,
      guards: total.guards,
      housingRaised: 7,
    });
    const audits = await rows<{ action: string }>(
      test.db,
      `select action from audit_log where action like 'world.tier_%' order by id`,
    );
    expect(audits.map((entry) => entry.action)).toEqual(["world.tier_apply_request", "world.tier_apply"]);
    expect(await applied.checkInvariants()).toEqual([]);
    await stop(applied);

    // 한 번 더 켜도 더 늘지 않는다(요청은 한 번만 든다)
    const again = await boot(tiered);
    expect(await startCities()).toEqual(after);
    expect((await service(tiered).tierPlan())?.totals).toMatchObject({ cities: 0, humans: 0, guards: 0 });
    expect(await again.checkInvariants()).toEqual([]);
  }, 180_000);

  it("이 세계에 이 국가 세우기: 차례 밖 프리셋에 자리를 놓으면 다음 켤 때 등급대로 선다", async () => {
    const world = await boot(tiered);
    const admin = await newUser("FoundAdmin");
    // 등급 배치 제안을 모두 놓으면 모두 받는다(놓기 검사도 등급 간격 — 소국이 가까워도 too_close가 아니다). 새 세계는 이미 그 자리
    const suggestion = await service(tiered).suggest();
    const homes = suggestion?.homes ?? [];
    expect(homes).toHaveLength(4);
    const placedAll = await service(tiered).place(
      homes.map((home) => ({ code: home.code, mapKey: Number(home.mapKey) })),
      { userId: admin, ip: null },
    );
    expect(placedAll?.map((result) => result.result)).toEqual(["ok", "ok", "ok", "ok"]);
    for (const home of homes) await service(tiered).clear(home.code, { userId: admin, ip: null });
    const view = await service(tiered).view();
    const founding = view?.founding ?? [];
    // 선 국가 넷의 프리셋(16번째·1~3번째)은 후보가 아니다. 5번째(강대국)는 후보
    expect(founding.some((entry) => CODES.includes(entry.code))).toBe(false);
    expect(founding.some((entry) => entry.code === "placeholder_nation_16")).toBe(false);
    const target = founding.find((entry) => entry.code === "placeholder_nation_05");
    expect(target).toMatchObject({ mapKey: null, start: { tier: "great_power", cities: 4 } });
    // 다른 국가와 먼 땅(면 3 가운데)을 고른다. 너무 가까우면 거절
    const near = Number((await startCities())[0]?.map_key);
    const refused = await service(tiered).place([{ code: "placeholder_nation_05", mapKey: near }], {
      userId: admin,
      ip: null,
    });
    expect(refused?.[0]?.result).toBe("too_close");
    const spot = cellKey(3, 9, 256, 256);
    const placed = await service(tiered).place([{ code: "placeholder_nation_05", mapKey: spot }], {
      userId: admin,
      ip: null,
    });
    const placedOk = placed?.[0]?.result === "ok";
    // 가짜 행성은 온통 풀밭이라 자동 배치가 면 3 가운데 가까이 국가를 뒀을 수 있다 — 그러면 계획이 고른 빈 자리에 놓는다
    let home = spot;
    if (!placedOk) {
      const replanned = await service(tiered).suggest();
      expect(replanned?.plan?.nations.length).toBe(4);
      home = cellKey(4, 9, 256, 256);
      const retry = await service(tiered).place([{ code: "placeholder_nation_05", mapKey: home }], {
        userId: admin,
        ip: null,
      });
      expect(retry?.[0]?.result).toBe("ok");
    }
    expect(
      (await service(tiered).view())?.founding?.find((entry) => entry.code === "placeholder_nation_05"),
    ).toMatchObject({ mapKey: String(home) });
    expect(await count(`select count(*) as n from audit_log where action = 'world.found_nation'`)).toBe(1);
    // 실행 중에는 서지 않는다(다음 서버 시작 때)
    expect(await count(`select count(*) as n from factions where code = 'placeholder_nation_05'`)).toBe(0);
    await stop(world);

    const next = await boot(tiered);
    const cities = await rows<{ map_key: string; housing: number }>(
      test.db,
      `select c.map_key, c.housing from world_cities c join factions f on f.id = c.faction_id
       where f.code = 'placeholder_nation_05' and c.start order by c.id`,
    );
    expect(cities).toHaveLength(4);
    expect(cities[0]?.map_key).toBe(String(home));
    expect(cities.every((city) => city.housing === 50)).toBe(true);
    const faction = await rows<{ fixed: boolean; tech_level: number }>(
      test.db,
      `select fixed, tech_level from factions where code = 'placeholder_nation_05'`,
    );
    expect(faction[0]).toEqual({ fixed: true, tech_level: 3 });
    // 선 뒤에는 후보에서 빠지고, 놓은 자리는 든 것으로 적힌다
    const after = await service(tiered).view();
    expect(after?.founding?.some((entry) => entry.code === "placeholder_nation_05")).toBe(false);
    expect(
      after?.nations.find((nation) => nation.code === "placeholder_nation_05")?.placement?.appliedAtMs,
    ).not.toBeNull();
    expect(await next.checkInvariants()).toEqual([]);
  }, 120_000);

  it("경비대 다시 채우기(920 나): 죽은 경비대를 구인 카드로 등급 값까지(값 소각·표시 저장), 국고가 없으면 채우지 않는다", async () => {
    const world = await boot(tiered);
    const npc = world.npc;
    const persistence = world.persistence;
    if (!npc || !persistence) throw new Error("npc runtime");
    const factionOf = (code: string) => {
      const found = [...npc.world.factions.values()].find((faction) => faction.code === code);
      if (!found) throw new Error(code);
      return found;
    };
    // 경비대 목표 = 자기 프리셋 등급 값(소국 2 · 초강대국 5 · 강대국 4 · 중견국 3)
    expect(CODES.map((code) => factionOf(code).guardsPerCity)).toEqual([2, 5, 4, 3]);
    /** 경비대를 없앤다(전투에서 죽은 셈 — 거울 세계에서 빼면 다음 저장이 휴먼 행·유닛을 지운다) */
    const kill = (cityId: number, n: number): number[] => {
      const gone = guardsIn(npc.world, cityId).slice(0, n);
      for (const id of gone) {
        const unit = npc.world.units.get(id);
        npc.world.units.delete(id);
        if (unit) npc.world.factions.get(unit.owner)?.units.delete(id);
      }
      return gone;
    };
    const superpower = factionOf(CODES[1] ?? "");
    const small = factionOf(CODES[0] ?? "");
    const bigCity = Math.min(...superpower.cities);
    const smallCity = Math.min(...small.cities);
    const dead = kill(bigCity, 2);
    kill(smallCity, 1);
    // 소국 국고를 비운다(값을 소각하는 구인과 같은 거래 모양). 지분도 초강대국에 넘긴다(판단이 지분을 팔아 국고를 채우지 못하게)
    const drain = npc.world.book.balanceOf(small.id, ASSET_CREDIT);
    npc.world.book.post({
      kind: "recruit",
      atMs: clock,
      entries: [
        { account: npc.world.book.ownerAccount(small.id, ASSET_CREDIT), amount: -drain },
        { account: npc.world.book.systemAccount(`sink:${ASSET_CREDIT}`, ASSET_CREDIT), amount: drain },
      ],
    });
    // 돌면서 계정이 생길 수 있어 먼저 목록을 굳힌다
    for (const account of Array.from(npc.world.book.accounts())) {
      if (account.ownerId !== small.id || !account.asset.startsWith("share_")) continue;
      const held = npc.world.book.balanceOf(small.id, account.asset);
      if (held > 0n)
        npc.world.book.post({
          kind: "transfer",
          atMs: clock,
          entries: [
            { account: npc.world.book.ownerAccount(small.id, account.asset), amount: -held },
            { account: npc.world.book.ownerAccount(superpower.id, account.asset), amount: held },
          ],
        });
    }
    await npc.tick(true);
    await persistence.writer.durable();
    expect(guardsIn(npc.world, bigCity)).toHaveLength(3);
    const before = npc.world.book.balanceOf(superpower.id, ASSET_CREDIT);
    // 판단 간격(6시간 ± 25%)이 한 번 지나도록 민다(하루 끝 전)
    clock += 8 * 3_600_000;
    await npc.tick(true);
    await persistence.writer.durable();
    const refilled = guardsIn(npc.world, bigCity);
    expect(refilled).toHaveLength(5);
    expect(refilled.some((id) => dead.includes(id))).toBe(false);
    // 카드 값은 국고에서 나갔다(같은 판단에서 휴먼 구인도 함께 살 수 있어 줄었는지만 본다)
    expect(npc.world.book.balanceOf(superpower.id, ASSET_CREDIT)).toBeLessThan(before);
    // 국고가 없는 소국은 채우지 않았다
    expect(guardsIn(npc.world, smallCity)).toHaveLength(1);
    // 어느 도시도 등급 값을 넘지 않는다
    for (const code of CODES) {
      const faction = factionOf(code);
      for (const cityId of faction.cities)
        expect(guardsIn(npc.world, cityId).length).toBeLessThanOrEqual(faction.guardsPerCity ?? 0);
    }
    // 새 경비대는 경비대 표시·구인 카드 스탯과 함께 저장된다
    const saved = await rows<{ unit_id: string; guard: boolean; stats: number[] | null }>(
      test.db,
      `select unit_id, guard, stats from world_humans where city_id = $1 and guard order by unit_id`,
      [bigCity],
    );
    expect(saved.map((row) => Number(row.unit_id))).toEqual(refilled);
    expect(saved.slice(-2).every((row) => row.stats?.length === 6)).toBe(true);
    // 한눈 정보(tRPC world.unitGlance와 같은 조회, 920 라): 경비대는 guard 표시, 다른 휴먼은 없음
    const reads = worldMapReadsOf({ world, pool: test.db.$client, planetId: PLANET, faceLevel: 9 })();
    if (!reads) throw new Error("reads");
    const dev = { id: "00000000-0000-4000-8000-000000000920", loginId: "guarddev", roles: ["dev" as const] };
    const mapKey = npc.places.get(bigCity)?.mapKey ?? 0;
    const glanceOf = async (unitId: number) => (await reads.unitGlance(dev, mapKey, unitId, clock)).glance;
    const guardId = refilled.at(-1) ?? 0;
    expect(await glanceOf(guardId)).toMatchObject({ unitId: guardId, kind: "human", guard: true });
    const worker = [...npc.world.units.values()].find((unit) => unit.city === bigCity && unit.guard !== true);
    const workerGlance = await glanceOf(worker?.id ?? 0);
    expect(workerGlance).toMatchObject({ kind: "human" });
    expect(workerGlance && "guard" in workerGlance).toBe(false);
    expect(await world.checkInvariants()).toEqual([]);
    await stop(world);
    // 다시 켜도 그대로(경비대 표시가 이어진다)
    const again = await boot(tiered);
    const mirror = again.npc?.world;
    if (!mirror) throw new Error("npc runtime");
    expect(guardsIn(mirror, bigCity)).toEqual(refilled);
  }, 120_000);
});
