// NPC 사회 런타임 DB 통합 시험(docs/adr/2026-11-01-npc-brain-r5.md 7절) — TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 시험 국가를 만들고 봇을 휴먼으로 들이고, 하루 끝·마을 세우기·사망을 DB·2차맵에 맞추고, 다시 켜면 이어 돈다.
import { cellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { DAY_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";

let test: TestDatabase;
const worlds: World[] = [];
/** 시험 시계(UTC 0시 몇 분 전에서 시작) */
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + DAY_MS - 60_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(testBots: number): Promise<World> {
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
    npc: { testNations: 3, manual: true },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

const count = async (sql: string): Promise<number> =>
  Number((await rows<{ n: string }>(test.db, `select count(*) as n from (${sql}) t`))[0]?.n ?? 0);

describe.skipIf(!TEST_DATABASE_URL)("NPC 사회 런타임", () => {
  it("시험 국가 셋(고정·시작 도시), 봇을 가장 가까운 도시의 휴먼으로 들이고 주인을 맞춘다", async () => {
    const world = await boot(30);
    const npc = world.npc;
    if (!npc || !world.persistence) throw new Error("npc runtime");
    await world.persistence.writer.durable();
    const nations = await rows<{ code: string; fixed: boolean }>(
      test.db,
      `select code, fixed from factions where kind = 'npc' and code is not null order by id`,
    );
    expect(nations.map((n) => n.code)).toEqual(["s3_test_npc", "npc_nation_02", "npc_nation_03"]);
    expect(nations.every((n) => n.fixed)).toBe(true);
    expect(await count("select id from world_cities where start")).toBe(3);
    expect(await count("select unit_id from world_humans")).toBe(30);
    // 휴먼의 유닛 주인 = 그 도시 세력의 소유 주체
    expect(
      await count(`select h.unit_id from world_humans h join world_units u on u.id = h.unit_id
        join world_cities c on c.id = h.city_id join world_owners o on o.faction_id = c.faction_id
        where u.owner_id <> o.id`),
    ).toBe(0);
    // 성향은 굴려서 저장했고, 국가마다 처음 화폐가 있다
    expect(await count("select id from factions where code is not null and traits is null")).toBe(0);
    expect(
      [...npc.world.factions.values()].every((f) => npc.world.book.balanceOf(f.id, "s3_test_credit") > 0n),
    ).toBe(true);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("하루 끝: 날 수·만족도를 저장하고, 수명이 다한 휴먼은 지우고(환생은 남김), 다시 켜면 이어 돈다", async () => {
    const world = await boot(12);
    const npc = world.npc;
    if (!npc || !world.persistence) throw new Error("npc runtime");
    // 모두 수명이 다하게
    for (const unit of npc.world.units.values()) unit.bornAtMs = clock - unit.lifespanMs - 1;
    clock += 120_000;
    await npc.tick();
    expect(npc.society.currentDay()).toBe(1);
    await world.persistence.writer.durable();
    const left = npc.world.units.size;
    expect(left).toBeLessThan(12);
    expect(await count("select unit_id from world_humans")).toBe(left);
    expect(await count("select id from world_units where kind = 0")).toBe(left);
    expect((await rows<{ day: number }>(test.db, "select day from npc_society"))[0]?.day).toBe(1);
    expect(await world.checkInvariants()).toEqual([]);
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    // 다시 켜면 봇을 채우고(spawnBots) 새 봇만 들이며, 날 수는 이어진다
    const again = await boot(12);
    expect(again.npc?.society.currentDay()).toBe(1);
    expect(again.npc?.world.units.size).toBe(12);
  });

  it("붐비는 도시에서 마을을 세우면 새 세력(예비 행)·도시·소유 주체가 생기고 휴먼·유닛 주인이 옮겨 간다", async () => {
    const world = await boot(30);
    const npc = world.npc;
    if (!npc || !world.persistence) throw new Error("npc runtime");
    const parent = [...npc.world.factions.values()]
      .filter((f) => f.units.size >= 8)
      .toSorted((a, b) => b.units.size - a.units.size)[0];
    if (!parent) throw new Error("no crowded nation");
    for (const id of parent.cities) {
      const city = npc.world.cities.get(id);
      if (city) city.housing = 4;
    }
    parent.traits = { aggression: 100, commerce: 500, faith: 500, station: 500 };
    npc.society.found(parent, clock);
    await npc.tick(true);
    await world.persistence.writer.durable();
    const house = [...npc.world.factions.values()].find((f) => f.overlord === parent.id);
    if (!house) throw new Error("no house");
    const found = await rows<{ code: string; parent_id: string; dissolved_at_ms: string | null }>(
      test.db,
      `select f.code, f.parent_id, f.dissolved_at_ms from factions f join world_owners o on o.faction_id = f.id
       where o.id = $1`,
      [house.id],
    );
    expect(found[0]?.code).toBe(house.code);
    expect(found[0]?.dissolved_at_ms).toBeNull();
    expect(await count(`select id from world_cities where not start`)).toBe(1);
    expect(await count(`select id from world_units where owner_id = ${house.id}`)).toBe(8);
    expect(await world.checkInvariants()).toEqual([]);
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    const again = await boot(30);
    const reloaded = again.npc?.world.factions.get(house.id);
    expect(reloaded?.overlord).toBe(parent.id);
    expect(reloaded?.units.size).toBe(8);
  });

  it("점령으로 도시 주인이 바뀌면 그 도시의 영토 비콘도 새 주인에게 넘어간다(D-512 335, 같은 저장 묶음)", async () => {
    const world = await boot(30);
    const npc = world.npc;
    const territory = world.persistence?.territory;
    if (!npc || !world.persistence || !territory) throw new Error("npc runtime");
    // 시작 도시는 빼앗지 않는다(occupy가 막음) → 붐비는 도시에서 마을을 세워 그 마을을 빼앗는다
    const parent = [...npc.world.factions.values()]
      .filter((f) => f.units.size >= 8)
      .toSorted((a, b) => b.units.size - a.units.size)[0];
    if (!parent) throw new Error("no crowded nation");
    for (const id of parent.cities) {
      const city = npc.world.cities.get(id);
      if (city) city.housing = 4;
    }
    parent.traits = { aggression: 100, commerce: 500, faith: 500, station: 500 };
    npc.society.found(parent, clock);
    await npc.tick(true);
    await world.persistence.writer.durable();
    const house = [...npc.world.factions.values()].find((f) => f.overlord === parent.id);
    const townId = house ? [...house.cities][0] : undefined;
    const place = townId === undefined ? undefined : npc.places.get(townId);
    const attacker = [...npc.world.factions.values()].find(
      (f) => f.cities.size > 0 && f.id !== house?.id && f.id !== parent.id,
    );
    if (!house || townId === undefined || !place || !attacker) throw new Error("town and attacker");
    const rowOf = async (ownerId: number): Promise<number> =>
      Number(
        (
          await rows<{ faction_id: string }>(test.db, "select faction_id from world_owners where id = $1", [
            ownerId,
          ])
        )[0]?.faction_id,
      );
    const [houseRow, attackerRow] = [await rowOf(house.id), await rowOf(attacker.id)];
    // 마을이 있는 1차맵 칸에서 5칸 떨어진 곳에 마을 세력 비콘(개발 권한으로 대신 놓기)
    const dev = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('FollowDev', 'followdev@id.placeholder.invalid', 'followdev') returning id`,
    );
    const { face, level, i, j } = decodeCellKey(parseCellKey(place.mapKey));
    const placed = await territory.place(
      { userId: String(dev[0]?.id), devPlace: true },
      { planetId: place.planetId, cellKey: cellKey(face, level, i + 5, j), factionId: houseRow },
    );
    expect(placed.ok).toBe(true);
    npc.society.occupy(attacker, house, townId, { treatment: "integrate", shares: "keep" }, clock);
    await npc.tick(true);
    await world.persistence.writer.durable();
    const beacon = await rows<{ faction_id: string; city_id: string }>(
      test.db,
      "select faction_id, city_id from territory_beacons",
    );
    expect(beacon).toEqual([{ faction_id: String(attackerRow), city_id: String(townId) }]);
    expect(attackerRow).not.toBe(houseRow);
  });
});
