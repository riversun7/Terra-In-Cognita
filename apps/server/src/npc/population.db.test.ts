// NPC 도시 처음 인구·시장 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP-NPC2", 기획 답 744 나·749 다) — TEST_DATABASE_URL이 있을 때만.
// 값은 모두 시험용 가짜다. 행성 값이 없는 세계(시작 도시가 시험 2차맵 줄에 선다)로:
// 1. 옛 세계(처음 인구 칸이 없던 판 — 시험 봇이 휴먼이 됨)를 켠 뒤 처음 인구 칸을 켜면 모자란 것만 더하고 옛 휴먼은 지우지 않는다.
// 2. 다시 켜도 더 세우지 않는다(채운 시각 저장), 시장은 저장된 그대로.
// 3. 시장이 죽으면 다시 고르고 저장한다.
// 4. 처음부터 있던 휴먼도 스탯·속성을 받는다(774 나, "WP-NPC4"): 저장된 스탯이 없는 휴먼(옛 NAS 세계처럼)은 켤 때 같은 값으로 채운다(지우지 않음).
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

type StatLine = { unitId: number; city: number; level: number; stats: number[]; elements: number[] };
const statsOf = async (): Promise<StatLine[]> =>
  (
    await rows<{
      unit_id: string;
      city_id: string;
      level: string | number;
      stats: number[] | null;
      elements: number[] | null;
    }>(test.db, `select unit_id, city_id, level, stats, elements from world_humans order by unit_id`)
  ).map((row) => ({
    unitId: Number(row.unit_id),
    city: Number(row.city_id),
    level: Number(row.level),
    stats: (row.stats ?? []).map(Number),
    elements: (row.elements ?? []).map(Number),
  }));

describe.skipIf(!TEST_DATABASE_URL)("NPC 도시 처음 인구·시장 (DB)", () => {
  it("옛 세계: 모자란 것만 더하고 옛 휴먼은 그대로, 스탯이 없는 휴먼은 같은 값으로 채움, 다시 켜도 그대로, 시장이 죽으면 다시 고른다", async () => {
    // 옛 판처럼(처음 인구 0): 시험 봇 12가 가장 가까운 시작 도시의 휴먼이 된다
    const old = await boot(12, 0);
    const before = await cityLines();
    expect(before).toHaveLength(2);
    expect(before.reduce((sum, city) => sum + Number(city.humans), 0)).toBe(12);
    // 비율 0이면 채운 것으로 치지 않는다
    expect(before.every((city) => city.population_seeded_at_ms === null)).toBe(true);
    const oldHumans = (await rows<{ unit_id: string }>(test.db, `select unit_id from world_humans`)).map(
      (row) => Number(row.unit_id),
    );
    // 774 나: 들인 휴먼도 그 도시 행정 레벨(1) 구인 카드 규칙으로 스탯 6칸(토탈 = Lv1 범위)·속성 12칸·레벨 1을 받는다
    const statLines = await statsOf();
    expect(statLines).toHaveLength(12);
    const lv1 = TEST_SOCIETY_COEFFICIENTS.recruit.levels[0];
    for (const line of statLines) {
      expect(line.stats).toHaveLength(6);
      expect(line.elements).toHaveLength(12);
      expect(line.level).toBe(1);
      const total = line.stats.reduce((sum, value) => sum + value, 0);
      expect(total).toBeGreaterThanOrEqual(lv1?.statsMin ?? 0);
      expect(total).toBeLessThanOrEqual(lv1?.statsMax ?? 0);
    }
    // 시장 = 그 도시 휴먼 가운데 INT + WIS → 스탯 합 → 작은 유닛 ID(772 가)
    for (const city of before) {
      const best = statLines
        .filter((line) => line.city === Number(city.id))
        .map((line) => ({
          id: line.unitId,
          mind: (line.stats[4] ?? 0) + (line.stats[5] ?? 0),
          total: line.stats.reduce((sum, value) => sum + value, 0),
        }))
        .toSorted((a, b) => b.mind - a.mind || b.total - a.total || a.id - b.id)[0];
      expect(Number(city.mayor_unit_id)).toBe(best?.id);
    }
    await stop(old);
    // 옛 NAS 세계 흉내: 저장된 스탯이 없는 휴먼(이 판 전 처음 인구·봇 휴먼) — 다음 켤 때 같은 값으로 채운다
    await test.db.$client.query(`update world_humans set stats = null, elements = null`);

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
    // 채운 스탯은 지우기 전과 같다((세계 시드, 유닛 ID) 결정적), 새로 세운 휴먼도 스탯이 있다
    const refilled = new Map((await statsOf()).map((line) => [line.unitId, line]));
    for (const line of statLines) expect(refilled.get(line.unitId)?.stats).toEqual(line.stats);
    expect([...refilled.values()].every((line) => line.stats.length === 6)).toBe(true);
    expect(refilled.size).toBe(40);
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
