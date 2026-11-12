// NPC 도시 이름 DB 통합 시험(기획 답 601 나, docs/adr/2026-11-07-play-flow.md "WP12 특산·이름 마무리") — TEST_DATABASE_URL이 있을 때만.
// 값은 모두 시험용 가짜다. 고정 나라가 아닌 세력의 도시: 실행 중에 세운 마을은 그 세력이 따르는 나라(독립 가문은 태어날 때 부모) 목록의 다음
// 이름을 받고, 켤 때 이름이 없는 도시는 반란 부모를 따라 올라간 나라 목록에서 받는다. 경제 화면(거래소 도시·창고 곳·도시 이름 조회)도 그 이름이다.
import { randomUUID } from "node:crypto";
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, HOUR_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { worldEconomySource } from "../economyView/worldSource.ts";
import { marketSourceOf } from "../market/appSource.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { presetOfCode } from "./nations.ts";
import { nationPresetsOf } from "./presets.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
// 옛 규칙(등급 없음, 성격 칸 도시 수 4·3·2)을 보는 시험이다 — 국력 등급 씨앗은 world/nationTiers.db.test.ts
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));
const economy = serverEconomyCatalogAccessor(
  economyCatalogFromPack(loaded.pack, { version: "core@test", placeholder: true }),
  () => pack,
);

let test: TestDatabase;
const worlds: World[] = [];
/** 시작 도시는 국가마다 하나(마을 세우기 시험이 도시 하나에 휴먼을 모은다, docs/adr/2026-11-07-play-flow.md WP1) */
const ONE_CITY = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
};
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  // UTC 0시 + 1시간(하루 끝이 멀다)
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + HOUR_MS;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 30,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 3, manual: true, presets },
    cyborgRules: () => ONE_CITY,
    holdings: { content: () => pack },
    facilities: { content: () => pack },
    economy,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

const nameOf = async (cityId: number): Promise<string | null> =>
  (await rows<{ name: string | null }>(test.db, `select name from world_cities where id = $1`, [cityId]))[0]
    ?.name ?? null;

describe.skipIf(!TEST_DATABASE_URL)("NPC 도시 이름(601 나)", () => {
  it("독립을 고른 새 가문의 마을 = 부모 나라 목록의 다음 이름, 경제 화면도 그 이름, 이름이 비면 켤 때 반란 부모 나라 목록에서", async () => {
    const world = await boot();
    const npc = world.npc;
    if (!npc || !world.persistence) throw new Error("npc runtime");
    const parent = [...npc.world.factions.values()]
      .filter((f) => f.units.size >= 8)
      .toSorted((a, b) => b.units.size - a.units.size)[0];
    if (!parent) throw new Error("no crowded nation");
    const names = presetOfCode(parent.code, presets)?.cityNames ?? [];
    const [parentCity] = [...parent.cities];
    // 부모 나라 시작 도시가 목록의 첫 이름(510 다)
    expect(npc.places.get(parentCity ?? 0)?.name).toBe(names[0]);
    for (const id of parent.cities) {
      const city = npc.world.cities.get(id);
      // 붐비게: 주거 4, 숙소 침대도 빼고 셈(인구 상한 = 주거 + 침대, 질문 1089 나)
      if (city) {
        city.housing = 4;
        city.beds = 0;
      }
    }
    // 공격 성향이 높으면 새 가문이 독립을 고른다(종주 없음, 반란 부모도 없음 — 태어날 때 부모로만 나라를 안다)
    parent.traits = { aggression: 1000, commerce: 500, faith: 500, station: 500 };
    npc.society.found(parent, clock);
    await npc.tick(true);
    await world.persistence.writer.durable();
    const house = [...npc.world.factions.values()].find((f) => f.code.startsWith("house_"));
    if (!house) throw new Error("no house");
    expect(house.overlord).toBeNull();
    expect(house.rebelOf).toBeNull();
    const [village] = [...house.cities];
    if (village === undefined) throw new Error("no village");
    // 둘째 이름(첫 이름은 부모 도시가 쓴다), DB 이름 칸·도시 자리 모두
    expect(names.length).toBeGreaterThan(1);
    expect(await nameOf(village)).toBe(names[1]);
    expect(npc.places.get(village)?.name).toBe(names[1]);

    // 경제 화면: 거래소 도시 목록·도시 이름 조회는 이름, 이름 없는 도시만 "#ID"
    const views = marketSourceOf(world, () => clock)()?.views;
    const cities = views?.cities(randomUUID(), "ration", clock).rows ?? [];
    expect(cities.find((row) => row.city === String(village))?.name).toBe(names[1]);
    expect(cities.every((row) => !row.name.startsWith("#"))).toBe(true);
    const source = worldEconomySource(world);
    expect(source.cityNames?.()).toContainEqual({ id: village, name: names[1] });
    expect(source.cityName?.(village)).toBe(names[1]);

    // 켤 때(601 나): 이름이 빈 마을은 반란 부모(rebel_of)·종주(parent_id)를 따라 올라간 나라 목록에서. 태어날 때 부모는 저장하지 않으므로
    // 반란 부모를 적어 둔다
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    await test.db.$client.query(`update world_cities set name = null where id = $1`, [village]);
    await test.db.$client.query(
      `update factions set rebel_of = (select faction_id from world_owners where id = $1)
       where id = (select faction_id from world_owners where id = $2)`,
      [parent.id, house.id],
    );
    const again = await boot();
    await again.persistence?.writer.durable();
    expect(await nameOf(village)).toBe(names[1]);
    expect(again.npc?.places.get(village)?.name).toBe(names[1]);
    expect(await again.checkInvariants()).toEqual([]);
  });
});
