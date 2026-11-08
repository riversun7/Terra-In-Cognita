// NPC 도시 처음 인구·시장 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP-NPC2", 기획 답 744 나·749 다) — TEST_DATABASE_URL이 있을 때만.
// 값은 모두 시험용 가짜다. 행성 값이 없는 세계(시작 도시가 시험 2차맵 줄에 선다)로:
// 1. 옛 세계(처음 인구 칸이 없던 판 — 시험 봇이 휴먼이 됨)를 켠 뒤 처음 인구 칸을 켜면 모자란 것만 더하고 옛 휴먼은 지우지 않는다.
// 2. 다시 켜도 더 세우지 않는다(채운 시각 저장), 시장은 저장된 그대로.
// 3. 시장이 죽으면 다시 고르고 저장한다.
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

/** 국가마다 시작 도시 하나, 처음 인구 천분율(0 = 옛 판처럼 세우지 않음) */
const rulesWith = (populationPm: number) => ({
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1, populationPm },
});

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

async function boot(testBots: number, populationPm: number): Promise<World> {
  const world = startWorld({
    testBots,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true },
    cyborgRules: () => rulesWith(populationPm),
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
  humans: string;
  mayor_unit_id: string | null;
  population_seeded_at_ms: string | null;
};
const cityLines = () =>
  rows<CityLine>(
    test.db,
    `select c.id, (select count(*) from world_humans h where h.city_id = c.id) as humans, c.mayor_unit_id,
            c.population_seeded_at_ms
       from world_cities c where c.start order by c.id`,
  );

describe.skipIf(!TEST_DATABASE_URL)("NPC 도시 처음 인구·시장 (DB)", () => {
  it("옛 세계: 모자란 것만 더하고 옛 휴먼은 그대로, 다시 켜도 그대로, 시장이 죽으면 다시 고른다", async () => {
    // 옛 판처럼(처음 인구 0): 시험 봇 12가 가장 가까운 시작 도시의 휴먼이 된다
    const old = await boot(12, 0);
    const before = await cityLines();
    expect(before).toHaveLength(2);
    expect(before.reduce((sum, city) => sum + Number(city.humans), 0)).toBe(12);
    // 비율 0이면 채운 것으로 치지 않는다. 시장은 그 도시 휴먼 가운데 가장 작은 유닛 ID(모두 기본 스탯)
    expect(before.every((city) => city.population_seeded_at_ms === null)).toBe(true);
    const oldHumans = (await rows<{ unit_id: string }>(test.db, `select unit_id from world_humans`)).map(
      (row) => Number(row.unit_id),
    );
    for (const city of before) {
      const smallest = await rows<{ id: string }>(
        test.db,
        `select min(unit_id) as id from world_humans where city_id = $1`,
        [Number(city.id)],
      );
      expect(city.mayor_unit_id).toBe(smallest[0]?.id);
    }
    await stop(old);

    // 처음 인구 칸을 켠 새 판: 도시마다 주거 40 × 500‰ = 20명까지 모자란 만큼 더한다(옛 휴먼은 그대로)
    const seeded = await boot(12, 500);
    const after = await cityLines();
    for (const city of after) {
      expect(city.humans).toBe("20");
      expect(city.population_seeded_at_ms).not.toBeNull();
    }
    const nowHumans = new Set(
      (await rows<{ unit_id: string }>(test.db, `select unit_id from world_humans`)).map((row) =>
        Number(row.unit_id),
      ),
    );
    expect(oldHumans.every((id) => nowHumans.has(id))).toBe(true);
    // 시험 봇은 휴먼이 아닌 채 더 서지 않았다(이미 12 — 시험 줄 몫 그대로), 새 휴먼은 도시 2차맵에 서 있다
    const npc = seeded.npc;
    if (!npc) throw new Error("npc runtime");
    for (const id of nowHumans) expect([...seeded.maps.values()].some((map) => map.unitInfo(id))).toBe(true);
    // 시장은 저장된 그대로(새로 온 휴먼이 있어도)
    expect(after.map((city) => city.mayor_unit_id)).toEqual(before.map((city) => city.mayor_unit_id));
    await stop(seeded);

    // 다시 켜도 더 세우지 않는다
    const again = await boot(12, 500);
    expect((await cityLines()).map((city) => city.humans)).toEqual(["20", "20"]);
    const runtime = again.npc;
    if (!runtime || !again.persistence) throw new Error("npc runtime");
    // 시장이 죽으면(거울에서 사라짐) 다시 고르고 저장한다
    const cityId = Number(after[0]?.id);
    const mayor = runtime.mayorOf(cityId);
    if (mayor === undefined) throw new Error("mayor");
    const owner = runtime.world.units.get(mayor)?.owner;
    runtime.world.units.delete(mayor);
    if (owner !== undefined) runtime.world.factions.get(owner)?.units.delete(mayor);
    await runtime.tick(true);
    await again.persistence.writer.durable();
    const next = runtime.mayorOf(cityId);
    expect(next).toBeDefined();
    expect(next).not.toBe(mayor);
    expect(runtime.world.units.get(next ?? -1)?.city).toBe(cityId);
    const stored = await rows<{ mayor_unit_id: string }>(
      test.db,
      `select mayor_unit_id from world_cities where id = $1`,
      [cityId],
    );
    expect(Number(stored[0]?.mayor_unit_id)).toBe(next);
    expect(await again.checkInvariants()).toEqual([]);
  });
});
