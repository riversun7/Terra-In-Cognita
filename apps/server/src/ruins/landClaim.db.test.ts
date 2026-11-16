// 빈 2차맵 알박기 완성 DB 통합 시험(기획 D-572, 질문 2122 가 — ruins/landClaim.ts) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 도시·폐허 없는 2차맵: 가문 없는 플레이어는 행정 건물을 못 짓고(질문 2192 — 묻는 중) → 가문원이 되면 짓는다 → 다른 세력도 같은 2차맵에
// 짓는다(알박기 경쟁) → 다 지은 뒤 런타임 틱에 먼저 다 지은 쪽 편(사이보그 나라)의 새 도시가 서고 그 건물이 새 도시 시설 → 늦은 쪽 건물은
// 남지만 도시가 되지 않는다 → 땅 규칙: 다른 나라는 foreign_city, 지은 쪽은 내 도시 → 다시 켜도 그대로.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { facilityScreenSourceOf } from "../facilities/appSource.ts";
import { createFacilityScreenServices } from "../facilities/screen.ts";
import { giveTestHouse } from "../factionIdentity/testHouses.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import type { Viewer } from "../trpc/context.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();

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
    testBots: 12,
    testMaps: 6, // 도시 없는 시험 2차맵이 남게
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true },
    holdings: { content: () => pack },
    facilities: { content: () => pack },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function persistenceOf(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("persistence");
  return found;
}

/** 사이보그(nation번째 나라의 첫 도시)를 만든다 */
async function citizen(world: World, name: string, nation: number) {
  const persistence = persistenceOf(world);
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  const userId = String(found[0]?.id);
  const creation = persistence.cyborgs.creation(userId, clock);
  const faction = creation.factions[nation];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await persistence.cyborgs.roll(userId, "balanced");
  const made = await persistence.cyborgs.create(userId, {
    name,
    appearance: {
      head: "dome",
      face: "visor",
      body: "slim",
      limbs: "piston",
      primary: "mint",
      accent: "lemon",
    },
    factionId: faction.id,
    cityId: city.id,
    elements: { fire: 6, wind: 4 },
  });
  if (!made.ok) throw new Error(`cyborg ${made.code}`);
  const ownerId = persistence.settlement.ownerOfUser(userId, clock).id;
  await persistence.writer.durable();
  const viewer: Viewer = { id: userId, loginId: name.toLowerCase(), roles: ["player"] };
  return { userId, ownerId, factionRow: faction.id, viewer };
}

describe.skipIf(!TEST_DATABASE_URL)("빈 2차맵 알박기 완성(D-572, 질문 2122)", () => {
  it("무소속은 막고, 먼저 다 지은 쪽 편의 새 도시가 서며 늦은 쪽 건물은 남는다 — 땅 규칙도 따라가고 다시 켜도 그대로", async () => {
    const first = await boot();
    const npc = first.npc;
    if (!npc) throw new Error("npc runtime");
    const persistence = persistenceOf(first);
    const { facilities } = persistence;
    const screen = createFacilityScreenServices(() => facilityScreenSourceOf(first));
    const one = await citizen(first, "ClaimOne", 0);
    const two = await citizen(first, "ClaimTwo", 1);
    expect(one.factionRow).not.toBe(two.factionRow);

    // 도시도 폐허도 없는 띄운 2차맵
    const settledMaps = new Set([...npc.places.values()].map((place) => place.mapKey));
    for (const city of facilities.service.places.cities()) settledMaps.add(city.mapKey);
    const empty = [...first.maps.keys()].toSorted((a, b) => a - b).find((key) => !settledMaps.has(key));
    if (empty === undefined) throw new Error("no empty map");
    const hall = (x: number) =>
      ({
        mapKey: empty,
        facility: "government_hall",
        x,
        y: 100,
        rotation: 0,
        operator: { pace: 10 },
      }) as const;

    // 가문 없는 플레이어는 묻는 중이라 막는다(질문 2192) — 미리 묻기도 no_house
    expect(await screen.landRule(one.viewer, empty)).toMatchObject({ allowed: true, claim: "no_house" });
    expect(await facilities.service.build(one.userId, hall(80))).toEqual({ ok: false, code: "forbidden" });

    // 가문원(도시 없는 가문)이 되면 짓는다 — 편 = 사이보그 나라(폐허 복원과 같은 joinOf, 질문 2193)
    await giveTestHouse(test.db.$client, one.userId, persistence);
    await giveTestHouse(test.db.$client, two.userId, persistence);
    expect(await screen.landRule(one.viewer, empty)).toMatchObject({ allowed: true, claim: "nation" });
    const builtOne = await facilities.service.build(one.userId, hall(80));
    expect(builtOne).toMatchObject({ ok: true });
    const hallOne = builtOne.ok ? (builtOne.buildingId ?? -1) : -1;
    // 짓는 중에는 땅 주인이 바뀌지 않는다 → 다른 나라도 같은 2차맵에 짓는다(알박기 경쟁)
    const builtTwo = await facilities.service.build(two.userId, hall(140));
    expect(builtTwo).toMatchObject({ ok: true });
    const hallTwo = builtTwo.ok ? (builtTwo.buildingId ?? -1) : -1;
    // 알박기 행정 건물은 도시가 설 때까지 시설 줄 도시가 비어 있다(운영자 모드라 바로 레벨 1)
    expect(facilities.service.facilities.get(hallOne)).toMatchObject({ level: 1, cityId: null });
    expect(facilities.service.facilities.get(hallTwo)).toMatchObject({ level: 1, cityId: null });

    // 런타임 틱: 먼저 지은(작은 건물 ID) 쪽 편의 새 도시
    const before = new Set(npc.world.cities.keys());
    await npc.tick(true);
    await persistence.writer.durable();
    const fresh = [...npc.world.cities.keys()].filter((id) => !before.has(id));
    expect(fresh).toHaveLength(1);
    const cityId = fresh[0] ?? -1;
    expect(npc.places.get(cityId)?.mapKey).toBe(empty);
    expect(facilities.service.facilities.get(hallOne)?.cityId).toBe(cityId);
    expect(facilities.service.facilities.get(hallTwo)?.cityId).toBeNull();
    const cityRows = await rows<{ faction_id: string; map_key: string; admin_level: number }>(
      test.db,
      "select faction_id, map_key, admin_level from world_cities where id = $1",
      [cityId],
    );
    expect(cityRows).toEqual([
      { faction_id: String(one.factionRow), map_key: String(empty), admin_level: 1 },
    ]);
    // 늦은 쪽 건물은 남지만 도시가 되지 않는다(다음 틱도)
    await npc.tick(true);
    expect([...npc.world.cities.keys()].filter((id) => !before.has(id))).toHaveLength(1);
    expect(first.maps.get(empty)?.buildingOwner(hallTwo)).toBe(two.ownerId);

    // 땅 규칙: 다른 나라는 남의 도시 2차맵, 지은 쪽은 내 도시. 알박기 자리가 아니게 됐다
    expect(await screen.landRule(two.viewer, empty)).toMatchObject({
      allowed: false,
      reason: "foreign_city",
      cityFaction: one.factionRow,
      claim: null,
    });
    expect(await screen.landRule(one.viewer, empty)).toMatchObject({ allowed: true, claim: null });
    expect(await facilities.service.build(one.userId, hall(200))).toEqual({ ok: false, code: "not_ruin" });

    // 다시 켜도 그대로(시설 줄 도시·도시 행)
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);
    const second = await boot();
    const again = persistenceOf(second);
    expect(again.facilities.service.facilities.get(hallOne)?.cityId).toBe(cityId);
    expect(again.facilities.service.facilities.get(hallTwo)?.cityId).toBeNull();
    expect(second.npc?.places.get(cityId)?.mapKey).toBe(empty);
  });
});
