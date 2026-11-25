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
  it("무소속은 1인 가문 도시로 귀속해 세우고, 늦은 쪽 짓는 중 정부는 멈추며, 알박기 도시는 독립을 선언할 수 있다", async () => {
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

    // 무소속도 짓는다(D-574 "무소속이면 유닛 독재 도시") — 미리 묻기 personal, 고르기 없이 보내면 기본 선택(소속 국가로 귀속)
    expect(await screen.landRule(one.viewer, empty)).toMatchObject({
      allowed: true,
      claim: "personal",
      claimLocked: null,
    });
    const builtOne = await facilities.service.build(one.userId, hall(80));
    expect(builtOne).toMatchObject({ ok: true });
    const hallOne = builtOne.ok ? (builtOne.buildingId ?? -1) : -1;
    expect(facilities.service.facilities.get(hallOne)).toMatchObject({
      level: 1,
      cityId: null,
      claim: { mode: "nation", regime: null },
    });

    // 다른 가문(도시 없음)도 같은 2차맵에 짓는다 — 짓는 중으로 돌려 둔다(운영자 모드는 바로 다 지어서)
    await giveTestHouse(test.db.$client, two.userId, persistence);
    expect(await screen.landRule(two.viewer, empty)).toMatchObject({ allowed: true, claim: "house" });
    const builtTwo = await facilities.service.build(two.userId, hall(140));
    expect(builtTwo).toMatchObject({ ok: true });
    const hallTwo = builtTwo.ok ? (builtTwo.buildingId ?? -1) : -1;
    const recordTwo = facilities.service.facilities.get(hallTwo);
    if (!recordTwo) throw new Error("hall two");
    recordTwo.level = 0;
    const jobs = facilities.service.jobs;
    if (!(jobs instanceof Map)) throw new Error("jobs map");
    jobs.set(9_999_001, {
      id: 9_999_001,
      kind: "build",
      ownerId: two.ownerId,
      buildingId: hallTwo,
      beaconId: null,
      holdingId: null,
      targetLevel: 1,
      restorePpm: null,
      unitIds: [],
      materials: [],
      startedAtMs: clock,
      doneAtMs: clock + DAY_MS,
    });

    // 런타임 틱: 무소속의 1인 가문을 만든 뒤(비동기) 그 가문 도시 — 소속 국가의 봉신(기본 선택)
    const before = new Set(npc.world.cities.keys());
    await tickUntil(first, () => [...npc.world.cities.keys()].some((id) => !before.has(id)));
    const fresh = [...npc.world.cities.keys()].filter((id) => !before.has(id));
    expect(fresh).toHaveLength(1);
    const cityId = fresh[0] ?? -1;
    expect(npc.places.get(cityId)?.mapKey).toBe(empty);
    expect(facilities.service.facilities.get(hallOne)?.cityId).toBe(cityId);
    const houseRows = await rows<{ faction_id: string; role: string }>(
      test.db,
      "select faction_id, role from house_members where user_id = $1",
      [one.userId],
    );
    expect(houseRows).toHaveLength(1);
    expect(houseRows[0]?.role).toBe("leader");
    const house = Number(houseRows[0]?.faction_id);
    const factionRows = await rows<{ kind: string; parent_id: string | null; born_of: string | null }>(
      test.db,
      "select kind, parent_id, born_of from factions where id = $1",
      [house],
    );
    expect(factionRows).toEqual([
      { kind: "player", parent_id: String(one.factionRow), born_of: String(one.factionRow) },
    ]);
    // 이름 없는 1인 가문 → 자리표시 정체성(질문 2242 이름 붙이기 길 — 운영자가 되돌린 이름과 같은 꼴, 이름 대기 없음)
    expect(
      await rows(test.db, "select name, short_name, source from faction_profiles where faction_id = $1", [
        house,
      ]),
    ).toEqual([
      { name: `가문 #${house}`, short_name: `H${house.toString(36).toUpperCase()}`, source: "player" },
    ]);
    expect(
      await rows(test.db, "select faction_id, name from faction_identities where user_id = $1", [one.userId]),
    ).toEqual([{ faction_id: String(house), name: `가문 #${house}` }]);
    const cityRows = await rows<{ faction_id: string; map_key: string }>(
      test.db,
      "select faction_id, map_key from world_cities where id = $1",
      [cityId],
    );
    expect(cityRows).toEqual([{ faction_id: String(house), map_key: String(empty) }]);
    // 지분은 최초 설립자(1인 가문 국고)가 갖는다 — 귀속해도 나라가 아니라(D-575). 알박기 도시 표지
    const houseOwner = npc.houses.ownerOfRow(house);
    expect(houseOwner).toBeDefined();
    expect(holdingsOf(npc.world.book, cityId).map((h) => h.owner)).toEqual([houseOwner]);
    expect(
      await rows(test.db, "select founder_owner_id, choice from claim_cities where city_id = $1", [cityId]),
    ).toEqual([{ founder_owner_id: String(houseOwner), choice: "nation" }]);

    // 늦은 쪽 짓는 중 정부 건물은 멈춘다(작업 없음·레벨 0인 채 남음, 2194) — 소식이 간다
    expect([...jobs.values()].some((job) => job.buildingId === hallTwo)).toBe(false);
    expect(facilities.service.facilities.get(hallTwo)?.level).toBe(0);
    expect(first.maps.get(empty)?.buildingOwner(hallTwo)).toBe(two.ownerId);
    await tickUntil(first, async () => {
      const notices = await rows<{ user_id: string; kind: string }>(
        test.db,
        "select user_id, kind from house_notices where kind in ('claim_halted', 'city_gained')",
      );
      return notices.length >= 2;
    });
    const notices = await rows<{ user_id: string; kind: string; reason: string | null }>(
      test.db,
      "select user_id, kind, reason from house_notices where kind in ('claim_halted', 'city_gained') order by kind",
    );
    expect(notices).toEqual([
      { user_id: one.userId, kind: "city_gained", reason: "vassal" },
      { user_id: two.userId, kind: "claim_halted", reason: null },
    ]);

    // 땅 규칙: 다른 가문은 남의 도시 2차맵. 지은 쪽은 내 도시(가문 도시라 이미 정한 봉신)
    expect(await screen.landRule(two.viewer, empty)).toMatchObject({
      allowed: false,
      reason: "foreign_city",
      claim: null,
    });
    expect(await screen.landRule(one.viewer, other)).toMatchObject({
      allowed: true,
      claim: "house",
      claimLocked: "vassal",
    });

    // 귀속한 1인 가문의 독립 선언(D-575·D-577 가문 단위): 알박기 도시가 있어 열림 → 가문 전체가 독립 + 고른 체제. 다시 하면 not_vassal
    expect(await houseCity.view(one.userId, { factionId: house, leader: true })).toMatchObject({
      status: "vassal",
      independence: "open",
    });
    expect(await houseCity.independence(one.userId, { regime: "democracy" })).toMatchObject({
      ok: true,
      mode: "independent",
      cityId,
    });
    expect(npc.houses.mirrorOf(house)).toMatchObject({ vassal: false, regime: "democracy" });
    expect(await rows(test.db, "select parent_id, regime from factions where id = $1", [house])).toEqual([
      { parent_id: null, regime: "democracy" },
    ]);
    expect(await houseCity.independence(one.userId, { regime: "democracy" })).toEqual({
      ok: false,
      code: "not_vassal",
    });

    // 다른 가문은 독립(자본주의)을 골라 다른 빈 2차맵에 세운다(D-574·D-340)
    const builtThree = await facilities.service.build(two.userId, {
      ...hall(60, other),
      claim: { mode: "independent", regime: "capitalism" },
    });
    expect(builtThree).toMatchObject({ ok: true });
    const hallThree = builtThree.ok ? (builtThree.buildingId ?? -1) : -1;
    const seen = new Set(npc.world.cities.keys());
    await tickUntil(first, () => [...npc.world.cities.keys()].some((id) => !seen.has(id)));
    const houseTwo = Number(
      (
        await rows<{ faction_id: string }>(
          test.db,
          "select faction_id from house_members where user_id = $1",
          [two.userId],
        )
      )[0]?.faction_id,
    );
    expect(npc.houses.mirrorOf(houseTwo)).toMatchObject({ vassal: false, regime: "capitalism" });

    // 다시 켜도 그대로(시설 줄 도시·고르기·도시 행)
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);
    const second = await boot();
    const again = persistenceOf(second);
    expect(again.facilities.service.facilities.get(hallOne)).toMatchObject({
      cityId,
      claim: { mode: "nation", regime: null },
    });
    // 멈춘 건물(시험은 메모리에서만 짓는 중으로 돌렸다 — 레벨은 저장하지 않음): 작업이 없고 도시가 되지 않는다
    expect(again.facilities.service.facilities.get(hallTwo)?.cityId).toBeNull();
    expect([...again.facilities.service.jobs.values()].some((job) => job.buildingId === hallTwo)).toBe(false);
    expect(again.facilities.service.facilities.get(hallThree)?.claim).toEqual({
      mode: "independent",
      regime: "capitalism",
    });
    expect(second.npc?.places.get(cityId)?.mapKey).toBe(empty);
  });
});
