// 도시 하루 생필품 충족 저장 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP-NPC4", 기획 정리 781 나) — TEST_DATABASE_URL이 있을 때만.
// 값은 모두 시험용 가짜다. 도시 경제가 도는 세계를 하루 끝(UTC 0시) 두 시간 전에 켜서:
// 1. 하루 끝 전에는 값이 없다(정부 판 "—"), 하루 끝이 지나면 도시마다 그날 생필품 충족 ‰(하루 끝 만족도가 쓴 값)을 world_cities.necessities_pm에 쓴다.
// 2. 다음 하루 끝까지 흔들리지 않고(정시 유지비가 돌아도 그대로), 다시 켜도 같은 값이 보인다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, HOUR_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { nationPresetsOf } from "./presets.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = nationPresetsOf(loaded.pack);
const economy = serverEconomyCatalogAccessor(
  economyCatalogFromPack(loaded.pack, { version: "core@test", placeholder: true }),
  () => pack,
);
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
  // UTC 22시(하루 끝 두 시간 전)
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 22 * HOUR_MS;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 12,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true, presets },
    cyborgRules: () => ONE_CITY,
    holdings: { content: () => pack },
    facilities: { content: () => pack },
    economy,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

/** 5분씩 민다 */
async function advance(world: World, ms: number): Promise<void> {
  const npc = world.npc;
  if (!npc) throw new Error("npc runtime");
  for (let passed = 0; passed < ms; passed += 5 * 60_000) {
    clock += 5 * 60_000;
    await npc.tick();
  }
  await world.persistence?.writer.durable();
}

const stored = async (): Promise<Map<number, number | null>> =>
  new Map(
    (
      await rows<{ id: string; necessities_pm: string | number | null }>(
        test.db,
        `select id, necessities_pm from world_cities order by id`,
      )
    ).map((row) => [Number(row.id), row.necessities_pm === null ? null : Number(row.necessities_pm)]),
  );

describe.skipIf(!TEST_DATABASE_URL)("도시 하루 생필품 충족 저장 (DB, 781 나)", () => {
  it("하루 끝 전엔 없음 → 하루 끝에 도시마다 그날 값을 쓰고, 다음 하루 끝까지·다시 켜도 그대로", async () => {
    const world = await boot();
    const npc = world.npc;
    if (!npc?.economy) throw new Error("city economy");
    const cityIds = [...npc.world.cities.keys()].toSorted((a, b) => a - b);
    expect(cityIds.length).toBe(2);
    // 하루 끝 전(정시 유지비가 돌아도 오늘 몫은 저장하지 않는다)
    await advance(world, HOUR_MS + 30 * 60_000);
    for (const cityId of cityIds) expect(npc.necessitiesOf(cityId)).toBeUndefined();
    expect([...(await stored()).values()].every((value) => value === null)).toBe(true);

    // 하루 끝(UTC 0시)을 지나면 도시마다 값 하나(0~1000), DB에도 같은 값
    await advance(world, HOUR_MS);
    const first = new Map(cityIds.map((cityId) => [cityId, npc.necessitiesOf(cityId)]));
    for (const value of first.values()) {
      expect(value).toEqual(expect.any(Number));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1000);
    }
    const saved = await stored();
    for (const cityId of cityIds) expect(saved.get(cityId)).toBe(first.get(cityId));

    // 다음 하루 끝 전에는 정시 유지비가 돌아도 그대로
    await advance(world, 3 * HOUR_MS);
    for (const cityId of cityIds) expect(npc.necessitiesOf(cityId)).toBe(first.get(cityId));
    expect(await world.checkInvariants()).toEqual([]);

    // 다시 켜도 같은 값(저장한 칸을 읽는다)
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    const again = await boot();
    for (const cityId of cityIds) expect(again.npc?.necessitiesOf(cityId)).toBe(first.get(cityId));
  });
});
