// 빈 2차맵 알박기 완성 DB 통합 시험(기획 D-572·D-574·D-575, 질문 2122 가·2194 — ruins/landClaim.ts) — TEST_DATABASE_URL이 있을 때만. 계정은
// 가짜 값이다. 도시·폐허 없는 2차맵: 가문 없는 플레이어도 짓는다(D-574 — 1인 독재 도시) → 다른 가문이 같은 2차맵에 짓는 중 → 먼저 다 지은
// 쪽(무소속)의 1인 가문이 생기고(소속 국가로 귀속 = 기본 선택) 그 가문 도시가 서며 지분은 그 가문 국고(D-575) → 늦은 쪽 짓는 중 정부 건물은
// 멈추고(재료 돌려주지 않음) 소식이 간다 → 땅 규칙 → 귀속한 1인 가문의 독립 선언(알박기 도시라 열림) → 다른 가문은 독립을 골라 세움 → 다시 켬.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, holdingsOf } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { facilityScreenSourceOf } from "../facilities/appSource.ts";
import { createFacilityScreenServices } from "../facilities/screen.ts";
import { createHouseCity } from "../factionIdentity/houseCity.ts";
import { TEST_HOUSE_RULES } from "../factionIdentity/rules.ts";
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
  // 첫 접속은 국가 미소속으로 시작한다(ADR 2026-11-24-house-membership-separation.md). 이 시험은 그 나라 시민에서
  // 출발하므로, 가문이 그 나라 도시에 가입했을 때와 같은 맞춤(alignHome)으로 국적을 준다
  persistence.cyborgs.alignHome(userId, { factionId: faction.id, cityId: city.id });
  const ownerId = persistence.settlement.ownerOfUser(userId, clock).id;
  await persistence.writer.durable();
  const viewer: Viewer = { id: userId, loginId: name.toLowerCase(), roles: ["player"] };
  return { userId, ownerId, factionRow: faction.id, viewer };
}

/** 조건이 맞을 때까지 런타임 틱을 돌린다(1인 가문 만들기·소식은 비동기) */
async function tickUntil(world: World, done: () => boolean | Promise<boolean>): Promise<void> {
  const npc = world.npc;
  if (!npc) throw new Error("npc runtime");
  for (let i = 0; i < 60; i++) {
    await npc.tick(true);
    await persistenceOf(world).writer.durable();
    if (await done()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("tickUntil: timed out");
}

describe.skipIf(!TEST_DATABASE_URL)("빈 2차맵 알박기 완성(D-572·D-574·D-575, 질문 2122·2194)", () => {
  it("가문 없이 지은 정부는 주인 없는 비활성 상태가 되고 다른 정부를 막으며, 차지한 가문이 소유한다. 가문이 있으면 다 지을 때 그 가문 도시", async () => {
    const first = await boot();
    const npc = first.npc;
    if (!npc) throw new Error("npc runtime");
    const persistence = persistenceOf(first);
    const { facilities } = persistence;
    const screen = createFacilityScreenServices(() => facilityScreenSourceOf(first));
    const houseCity = createHouseCity({
      pool: test.db.$client,
      db: test.db,
      rules: () => TEST_HOUSE_RULES,
      now: () => clock,
      world: () => first,
    });
    const one = await citizen(first, "ClaimOne", 0);
    const two = await citizen(first, "ClaimTwo", 1);
    expect(one.factionRow).not.toBe(two.factionRow);

    // 도시도 폐허도 없는 띄운 2차맵 둘
    const settledMaps = new Set([...npc.places.values()].map((place) => place.mapKey));
    for (const city of facilities.service.places.cities()) settledMaps.add(city.mapKey);
    const empties = [...first.maps.keys()].toSorted((a, b) => a - b).filter((key) => !settledMaps.has(key));
    const [empty, other] = empties;
    if (empty === undefined || other === undefined) throw new Error("no empty maps");
    const hall = (x: number, mapKey = empty) =>
      ({
        mapKey,
        facility: "government_hall",
        x,
        y: 100,
        rotation: 0,
        operator: { pace: 10 },
      }) as const;

    // 가문이 없어도 짓는다(사용자 결정 2026-11-25 "그냥도 정부 건설가능") — 미리 묻기 personal, 고르기 없이 보내면 기본 선택(소속 국가로 귀속)
    expect(await screen.landRule(one.viewer, empty)).toMatchObject({
      allowed: true,
      claim: "personal",
      claimLocked: null,
    });
    expect((await screen.landRule(one.viewer, empty)).governmentExists).toBeUndefined();
    const builtOne = await facilities.service.build(one.userId, hall(80));
    expect(builtOne).toMatchObject({ ok: true });
    const hallOne = builtOne.ok ? (builtOne.buildingId ?? -1) : -1;
    expect(facilities.service.facilities.get(hallOne)).toMatchObject({
      level: 1,
      cityId: null,
      claim: { mode: "nation", regime: null },
    });

    // 정부 건물이 있는 2차맵에는 다른 정부를 짓지 못한다(가문이 있어도) — 땅 규칙 미리 묻기가 알리고 짓기는 forbidden
    const houseTwo = await giveTestHouse(test.db.$client, two.userId, persistence);
    expect(await screen.landRule(two.viewer, empty)).toMatchObject({
      allowed: true,
      claim: "house",
      governmentExists: true,
    });
    expect(await facilities.service.build(two.userId, hall(140))).toEqual({ ok: false, code: "forbidden" });

    // 가문 없는 사람이 다 지은 정부는 주인 없는 비활성 상태가 된다(사용자 결정 2026-11-25): 도시가 서지 않고 1인 가문도 생기지 않으며
    // 건물 주인이 없다
    const before = new Set(npc.world.cities.keys());
    const idle = async (): Promise<void> => {
      for (let i = 0; i < 3; i++) {
        await npc.tick(true);
        await persistence.writer.durable();
      }
    };
    await idle();
    expect([...npc.world.cities.keys()].filter((id) => !before.has(id))).toEqual([]);
    expect(facilities.service.facilities.get(hallOne)?.cityId).toBeNull();
    expect(first.maps.get(empty)?.buildingOwner(hallOne)).toBeNull();
    expect(persistence.ruins.vacantHall(hallOne)).toEqual({ mapKey: empty });
    expect(await rows(test.db, "select 1 as n from house_members where user_id = $1", [one.userId])).toEqual(
      [],
    );
    expect(await rows(test.db, "select owner_id from world_buildings where id = $1", [hallOne])).toEqual([
      { owner_id: null },
    ]);
    // 건물 판 머리: 주인 없는 빈 정부
    expect(await screen.owner(two.viewer, hallOne)).toMatchObject({
      status: "ok",
      ownerKind: null,
      vacantHall: true,
    });
    // 지은 사람이 뒤에 가문을 만들어도 저절로 갖지 않는다(지은 사람에게 우선권 없음 — 차지해야 한다)
    const startCity = persistence.cyborgs.record(one.userId)?.startCityId;
    if (startCity === undefined) throw new Error("no start city");
    const houseOne = await giveTestHouse(test.db.$client, one.userId, persistence, {
      cityId: startCity,
      factionId: one.factionRow,
    });
    await idle();
    expect([...npc.world.cities.keys()].filter((id) => !before.has(id))).toEqual([]);

    // 차지하기(house_hall): 가문장 사이보그 본체가 그 2차맵에 있어야 한다
    expect(
      await houseCity.hall(two.userId, { buildingId: hallOne, mode: "independent", regime: "capitalism" }),
    ).toEqual({ ok: false, code: "bad_spot" });
    expect(await houseCity.hall(two.userId, { buildingId: 999_999, mode: "independent" })).toEqual({
      ok: false,
      code: "unknown_ruin",
    });
    const body = persistence.cyborgs.record(two.userId)?.unitId;
    if (body === null || body === undefined) throw new Error("no body");
    const from = [...first.maps.values()].find((map) => map.unitInfo(body) !== undefined);
    const info = from?.unitInfo(body);
    if (!from || !info) throw new Error("body not on a map");
    from.removeUnit(body);
    expect(
      first.maps.get(empty)?.addUnit({
        id: body,
        size: info.size,
        speed: info.speed,
        cellX: 100,
        cellY: 120,
        ownerId: two.ownerId,
      }),
    ).toBe(true);
    // 나라에 들지 않은 가문(국가 미소속 창설)은 귀속할 나라가 없다: 독립만, 독립이면 체제를 고른다
    expect(await houseCity.hall(two.userId, { buildingId: hallOne, mode: "vassal" })).toEqual({
      ok: false,
      code: "mode_locked",
    });
    expect(await houseCity.hall(two.userId, { buildingId: hallOne, mode: "independent" })).toEqual({
      ok: false,
      code: "regime_required",
    });
    const taken = await houseCity.hall(two.userId, {
      buildingId: hallOne,
      mode: "independent",
      regime: "capitalism",
    });
    expect(taken).toMatchObject({ ok: true, factionId: houseTwo, mode: "independent", paid: "0" });
    const cityId = taken.ok ? taken.cityId : -1;
    // 차지한 가문이 소유한다: 그 정부로 도시가 서고(그 2차맵·그 건물), 건물 주인은 차지한 가문장, 도시 주인은 그 가문
    expect(npc.places.get(cityId)?.mapKey).toBe(empty);
    expect(facilities.service.facilities.get(hallOne)).toMatchObject({
      cityId,
      claim: { mode: "independent", regime: "capitalism" },
    });
    expect(first.maps.get(empty)?.buildingOwner(hallOne)).toBe(two.ownerId);
    expect(persistence.ruins.vacantHall(hallOne)).toBeUndefined();
    expect(npc.houses.mirrorOf(houseTwo)).toMatchObject({ vassal: false, regime: "capitalism" });
    await persistence.writer.durable();
    expect(
      await rows(test.db, "select faction_id, map_key from world_cities where id = $1", [cityId]),
    ).toEqual([{ faction_id: String(houseTwo), map_key: String(empty) }]);
    expect(await rows(test.db, "select parent_id, regime from factions where id = $1", [houseTwo])).toEqual([
      { parent_id: null, regime: "capitalism" },
    ]);
    // 지분은 최초 설립자(차지한 가문 국고)가 갖는다(D-575). 알박기 도시 표지
    const ownerTwo = npc.houses.ownerOfRow(houseTwo);
    expect(ownerTwo).toBeDefined();
    expect(holdingsOf(npc.world.book, cityId).map((h) => h.owner)).toEqual([ownerTwo]);
    expect(
      await rows(test.db, "select founder_owner_id, choice from claim_cities where city_id = $1", [cityId]),
    ).toEqual([{ founder_owner_id: String(ownerTwo), choice: "independent:capitalism" }]);
    // 이미 차지한 정부는 다시 차지하지 못한다
    expect(await houseCity.hall(one.userId, { buildingId: hallOne, mode: "vassal" })).toEqual({
      ok: false,
      code: "unknown_ruin",
    });
    // 소식: 차지한 가문에 도시가 섰다
    await tickUntil(first, async () => {
      const notices = await rows<{ user_id: string }>(
        test.db,
        "select user_id from house_notices where kind = 'city_gained'",
      );
      return notices.length >= 1;
    });
    expect(
      await rows(test.db, "select user_id, kind, reason from house_notices where kind = 'city_gained'"),
    ).toEqual([{ user_id: two.userId, kind: "city_gained", reason: "independent" }]);

    // 땅 규칙: 다른 가문은 남의 도시 2차맵
    expect(await screen.landRule(one.viewer, empty)).toMatchObject({
      allowed: false,
      reason: "foreign_city",
      claim: null,
    });

    // 가문이 있는 사람이 지으면 다 지을 때 저절로 그 가문 도시가 된다(원래 규칙): 나라 가문(one)은 귀속(기본 선택) = 봉신
    expect(await screen.landRule(one.viewer, other)).toMatchObject({ allowed: true, claim: "house" });
    const builtThree = await facilities.service.build(one.userId, hall(60, other));
    expect(builtThree).toMatchObject({ ok: true });
    const hallThree = builtThree.ok ? (builtThree.buildingId ?? -1) : -1;
    const seen = new Set(npc.world.cities.keys());
    await tickUntil(first, () => [...npc.world.cities.keys()].some((id) => !seen.has(id)));
    const cityThree = [...npc.world.cities.keys()].find((id) => !seen.has(id)) ?? -1;
    expect(facilities.service.facilities.get(hallThree)?.cityId).toBe(cityThree);
    expect(first.maps.get(other)?.buildingOwner(hallThree)).toBe(one.ownerId);
    expect(
      await rows(test.db, "select kind, parent_id, born_of from factions where id = $1", [houseOne]),
    ).toEqual([{ kind: "player", parent_id: String(one.factionRow), born_of: String(one.factionRow) }]);
    // 귀속한 가문의 독립 선언(D-575·D-577 가문 단위): 알박기 도시가 있어 열림 → 가문 전체가 독립 + 고른 체제. 다시 하면 not_vassal
    expect(await houseCity.view(one.userId, { factionId: houseOne, leader: true })).toMatchObject({
      status: "vassal",
      independence: "open",
    });
    expect(await houseCity.independence(one.userId, { regime: "democracy" })).toMatchObject({
      ok: true,
      mode: "independent",
      cityId: cityThree,
    });
    expect(npc.houses.mirrorOf(houseOne)).toMatchObject({ vassal: false, regime: "democracy" });
    expect(await houseCity.independence(one.userId, { regime: "democracy" })).toEqual({
      ok: false,
      code: "not_vassal",
    });

    // 다시 켜도 그대로(시설 줄 도시·고르기·건물 주인·도시 행)
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);
    const second = await boot();
    const again = persistenceOf(second);
    expect(again.facilities.service.facilities.get(hallOne)).toMatchObject({
      cityId,
      claim: { mode: "independent", regime: "capitalism" },
    });
    expect(second.maps.get(empty)?.buildingOwner(hallOne)).toBe(two.ownerId);
    expect(again.facilities.service.facilities.get(hallThree)).toMatchObject({
      cityId: cityThree,
      claim: { mode: "nation", regime: null },
    });
    expect(second.npc?.places.get(cityId)?.mapKey).toBe(empty);
  });
});
