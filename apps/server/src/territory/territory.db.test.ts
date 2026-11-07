// 영토 비콘·영토 배치 DB 통합 시험(docs/adr/2026-11-03-territory-layer.md) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 서버 규칙: 가입한 세력만 놓는다(개발 시험은 다른 세력 대신), 1차맵 칸 하나에 하나, N42 거리·개수(기준 도시), 다른 세력 도시 영향권(D-486),
// 팩에 비콘 시설이 없으면 disabled, 커밋 뒤 답·다시 켜도 남음, 치우면 꼭짓점이 빠져 다시 셈, 조회(내 세력·전체),
// 건물 규칙(기획 336, docs/adr/2026-11-07-buildings-runtime.md): 재료 빼기·건설 시간 뒤 꼭짓점·노화 30% 멈춤·수리
import { EARTH_FACE_LEVEL, cellKey } from "@terra/planet";
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { goodsStock, grantGoods } from "../facilities/materials.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { TEST_MAP_KEY, TEST_PLANET_ID, type World, startWorld } from "../world/world.ts";

let test: TestDatabase;
let clock = 1_800_000_000_000;
const worlds: World[] = [];
let beaconOn = true;
/** 비콘 건설 시간(0 = 바로) */
let beaconBuildMs = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000;
  beaconOn = true;
  beaconBuildMs = 0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    territory: {
      beaconFacility: () => ({
        enabled: beaconOn,
        materials: [{ item: "pine_log", qty: 3 }],
        ...(beaconBuildMs > 0 ? { buildMs: beaconBuildMs } : {}),
      }),
    },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function territoryOf(world: World) {
  const found = world.persistence?.territory;
  if (!found) throw new Error("no territory service");
  return found;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

/** 세력에 넣고, 비콘 재료(소나무 원목)를 넉넉히 준다(건물 규칙: 놓을 때 재료를 뺀다) */
async function join(userId: string, factionId: number, logs = 100): Promise<void> {
  await rows(test.db, `insert into faction_members (user_id, faction_id) values ($1, $2)`, [
    userId,
    factionId,
  ]);
  const p = worlds.at(-1)?.persistence;
  if (p && logs > 0)
    grantGoods(p.ledger, p.settlement.ownerOfUser(userId, clock).id, "pine_log", logs, clock, null);
}

async function testFaction(): Promise<number> {
  const found = await rows<{ id: string }>(test.db, `select id from factions where code = 's3_test_npc'`);
  return Number(found[0]?.id);
}

/** 시험 2차맵 칸(면 0의 (282, 328))에서 (di, dj) 칸 떨어진 1차맵 칸(같은 면 안) */
function near(di: number, dj: number): number {
  return cellKey(0, EARTH_FACE_LEVEL, 282 + di, 328 + dj);
}

const player = (userId: string) => ({ userId, devPlace: false });
const developer = (userId: string) => ({ userId, devPlace: true });

describe.skipIf(!TEST_DATABASE_URL)("영토 비콘", () => {
  it("놓기 검사(칸·같은 칸·거리·개수·세력)와 저장, 조회의 껍질·칸 표", async () => {
    const world = await boot();
    const territory = territoryOf(world);
    const faction = await testFaction();
    const member = await fakeUser("TerritoryMember");
    const outsider = await fakeUser("TerritoryOutsider");
    await join(member, faction);
    const place = (userId: string, key: number) =>
      territory.place(player(userId), { planetId: TEST_PLANET_ID, cellKey: key });

    expect(await place(outsider, near(4, 0))).toEqual({ ok: false, code: "no_faction" });
    expect(await place(member, TEST_MAP_KEY + 1)).toEqual({ ok: false, code: "invalid_cell" });
    expect(
      await territory.place(player(member), { planetId: "nowhere_planet", cellKey: near(1, 0) }),
    ).toEqual({
      ok: false,
      code: "unknown_planet",
    });
    // N42 마을 거리 10칸 밖
    expect(await place(member, near(12, 0))).toEqual({ ok: false, code: "out_of_range" });
    const first = await place(member, near(5, 0));
    expect(first).toEqual({ ok: true, beaconId: 1 });
    expect(await place(member, near(5, 0))).toEqual({ ok: false, code: "cell_taken" });
    expect((await place(member, near(0, 5))).ok).toBe(true);
    expect((await place(member, near(5, 5))).ok).toBe(true);
    // 마을(발전도 0 = 등급 1) 비콘 수 3
    expect(await place(member, near(-5, 0))).toEqual({ ok: false, code: "beacon_limit" });
    // 다른 세력 대신은 개발 권한만
    expect(
      await territory.place(player(member), {
        planetId: TEST_PLANET_ID,
        cellKey: near(-5, 0),
        factionId: faction + 99,
      }),
    ).toEqual({ ok: false, code: "forbidden" });

    const saved = await rows<{ cell_key: string; city_id: string; durability: number; built_by: string }>(
      test.db,
      `select cell_key, city_id, durability, built_by from territory_beacons order by id`,
    );
    expect(saved.map((row) => Number(row.cell_key))).toEqual([near(5, 0), near(0, 5), near(5, 5)]);
    expect(saved.every((row) => row.durability === 10 && row.built_by === member)).toBe(true);

    const view = await territory.planetView(TEST_PLANET_ID, member);
    expect(view?.myFactionId).toBe(faction);
    expect(view?.groups).toHaveLength(1);
    expect(view?.groups[0]?.hull?.map((vertex) => vertex.kind).toSorted()).toEqual([
      "beacon",
      "beacon",
      "beacon",
      "city",
    ]);
    const city = view?.cities[0];
    expect([city?.grade, city?.beaconsUsed, city?.beaconsMax, city?.rangeMilli]).toEqual([1, 3, 3, 10_000]);
    // 칸 중심 (0,0)~(5,5) 정사각형(도시는 칸 가운데 배치 칸) → 안쪽 16칸 + 가장자리 20칸 안팎
    expect(view?.cells.length).toBeGreaterThan(25);
    expect(view?.cells.every(([, owner, province]) => owner === faction && province === city?.id)).toBe(true);
    expect(view?.beacon).toEqual({ enabled: true, materials: [{ item: "pine_log", qty: 3 }] });

    // 세력이 없으면 내 영토는 비었다
    const empty = await territory.mineView(TEST_PLANET_ID, outsider);
    expect([empty?.myFactionId, empty?.cells.length, empty?.beacons.length]).toEqual([null, 0, 0]);
    expect((await territory.mineView(TEST_PLANET_ID, member))?.cells.length).toBe(view?.cells.length);

    // 다시 켜도 비콘·칸 표가 같다(결정성)
    await world.stop();
    worlds.splice(0);
    const again = territoryOf(await boot());
    expect(again.beaconCount()).toBe(3);
    const reloaded = await again.planetView(TEST_PLANET_ID, member);
    expect(reloaded?.cells).toEqual(view?.cells);
    expect(reloaded?.groups).toEqual(view?.groups);
  });

  it("치우기: 내 세력 비콘만(개발 권한은 아무 비콘), 꼭짓점이 빠지면 껍질이 사라진다", async () => {
    const world = await boot();
    const territory = territoryOf(world);
    const faction = await testFaction();
    const member = await fakeUser("RemoveMember");
    const stranger = await fakeUser("RemoveStranger");
    const dev = await fakeUser("RemoveDev");
    await join(member, faction);
    for (const key of [near(4, 0), near(0, 4), near(4, 4)])
      expect((await territory.place(player(member), { planetId: TEST_PLANET_ID, cellKey: key })).ok).toBe(
        true,
      );
    expect((await territory.planetView(TEST_PLANET_ID, null))?.groups[0]?.hull).not.toBeNull();
    expect(await territory.remove(player(stranger), 1)).toEqual({ ok: false, code: "forbidden" });
    expect(await territory.remove(player(member), 1)).toEqual({ ok: true });
    expect(await territory.remove(player(member), 1)).toEqual({ ok: false, code: "unknown_beacon" });
    expect(await territory.remove(developer(dev), 2)).toEqual({ ok: true });
    const view = await territory.planetView(TEST_PLANET_ID, null);
    // 도시 + 비콘 하나 = 꼭짓점 둘 → 껍질 없음, 마을 영향권(0.1칸)은 칸 표에 남지 않는다
    expect(view?.groups[0]?.hull).toBeNull();
    expect(view?.cells).toEqual([]);
    expect(await rows(test.db, `select id from territory_beacons`)).toEqual([{ id: "3" }]);
  });

  it("다른 세력 도시 영향권 안에는 놓지 못하고(D-486), 개발 권한은 다른 세력 대신 놓는다. 끈 세계는 disabled", async () => {
    const world = await boot();
    const territory = territoryOf(world);
    const testNpc = await testFaction();
    const dev = await fakeUser("TerritoryDev");
    // 두 번째 세력과 그 도시(시험 2차맵에서 3칸 옆 칸 가운데)
    const other = await rows<{ id: string }>(
      test.db,
      `insert into factions (kind, code, regime, fixed) values ('npc', 'territory_other', 'democracy', true) returning id`,
    );
    const otherId = Number(other[0]?.id);
    await rows(
      test.db,
      `insert into world_cities (id, faction_id, planet_id, map_key, cell_x, cell_y, start, housing, research_level, founded_at_ms)
       values (900, $1, $2, $3, 128, 128, false, 0, 0, $4)`,
      [otherId, TEST_PLANET_ID, near(3, 0), clock],
    );
    // 시험 NPC 세력이 남의 도시 칸에 놓으려 함 → 그 도시 영향권 안(칸 가운데)
    expect(
      await territory.place(developer(dev), {
        planetId: TEST_PLANET_ID,
        cellKey: near(3, 0),
        factionId: testNpc,
      }),
    ).toEqual({ ok: false, code: "foreign_city" });
    const placed = await territory.place(developer(dev), {
      planetId: TEST_PLANET_ID,
      cellKey: near(6, 0),
      factionId: otherId,
    });
    expect(placed.ok).toBe(true);
    const anchor = await rows<{ city_id: string; faction_id: string }>(
      test.db,
      `select city_id, faction_id from territory_beacons`,
    );
    expect(anchor).toEqual([{ city_id: "900", faction_id: String(otherId) }]);
    beaconOn = false;
    expect(
      await territory.place(developer(dev), {
        planetId: TEST_PLANET_ID,
        cellKey: near(0, 6),
        factionId: testNpc,
      }),
    ).toEqual({ ok: false, code: "disabled" });
    const view = await territory.planetView(TEST_PLANET_ID, dev);
    expect(view?.factions.map((faction) => faction.code)).toEqual(["s3_test_npc", "territory_other"]);
    expect(view?.myFactionId).toBeNull();
    expect(cellKey(0, EARTH_FACE_LEVEL, 282, 328)).toBe(TEST_MAP_KEY);
  });

  it("건물 규칙(기획 336): 재료를 빼고 건설 시간 뒤에야 꼭짓점, 노화는 30%에서 멈춰 꼭짓점이 남고, 수리로 오른다", async () => {
    beaconBuildMs = 60_000;
    const world = await boot();
    const territory = territoryOf(world);
    const p = world.persistence;
    if (!p) throw new Error("no persistence");
    const faction = await testFaction();
    const poor = await fakeUser("BeaconPoor");
    const member = await fakeUser("BeaconBuilder");
    await join(poor, faction, 2);
    await join(member, faction);
    expect(await territory.place(player(poor), { planetId: TEST_PLANET_ID, cellKey: near(5, 0) })).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    for (const key of [near(5, 0), near(0, 5), near(5, 5)])
      expect((await territory.place(player(member), { planetId: TEST_PLANET_ID, cellKey: key })).ok).toBe(
        true,
      );
    const ownerId = p.settlement.ownerOfUser(member, clock).id;
    expect(goodsStock(p.ledger, ownerId, "pine_log")).toBe(91n);
    // 짓는 동안은 꼭짓점이 아니다(목록에는 보인다), 개수는 센다
    const building = await territory.planetView(TEST_PLANET_ID, member);
    expect(building?.groups[0]?.hull).toBeNull();
    expect(building?.beacons.map((beacon) => beacon.readyAtMs)).toEqual([
      clock + 60_000,
      clock + 60_000,
      clock + 60_000,
    ]);
    expect(await territory.place(player(member), { planetId: TEST_PLANET_ID, cellKey: near(-5, 0) })).toEqual(
      {
        ok: false,
        code: "beacon_limit",
      },
    );
    clock += 60_000 + 30 * 86_400_000;
    const built = await territory.planetView(TEST_PLANET_ID, member);
    expect(built?.groups[0]?.hull).not.toBeNull();
    // 쓰지 않는 건물: 30%(N50 문턱 = 기능 정지 직전)에서 멈춰 꼭짓점이 남는다. 내구도 = 10 × 30%
    expect(built?.beacons.map((beacon) => [beacon.conditionPpm, beacon.durability])).toEqual([
      [300_000, 3],
      [300_000, 3],
      [300_000, 3],
    ]);
    // 수리(건물 서비스의 작업이 끝날 때 더함)
    expect(territory.repairBeacon(1, 500_000, clock)).toBe(true);
    expect(territory.beaconState(1, clock)?.conditionPpm).toBe(800_000);
    expect(territory.repairBeacon(1, CONDITION_FULL, clock)).toBe(true);
    expect(territory.beaconState(1, clock)?.conditionPpm).toBe(CONDITION_FULL);
    await p.writer.durable();
    const saved = await rows<{ condition_ppm: number; ready_at_ms: string | null }>(
      test.db,
      `select condition_ppm, ready_at_ms from territory_beacons where id = 1`,
    );
    expect(saved).toEqual([{ condition_ppm: CONDITION_FULL, ready_at_ms: String(clock - 30 * 86_400_000) }]);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("기준 도시를 빼앗기면 비콘이 도시와 함께 넘어간다(D-512 335): 개수·거리는 새 주인 기준, 다시 켜도 남음", async () => {
    const world = await boot();
    const territory = territoryOf(world);
    const owner = await testFaction();
    const member = await fakeUser("FollowMember");
    const dev = await fakeUser("FollowDev");
    await join(member, owner);
    for (const key of [near(5, 0), near(0, 5), near(5, 5)])
      expect((await territory.place(player(member), { planetId: TEST_PLANET_ID, cellKey: key })).ok).toBe(
        true,
      );
    // 다른 세력이 시험 NPC 세력의 시작 도시를 빼앗음(NPC 런타임 점령과 같은 저장: 도시 줄 + cityOwnerChanged, 같은 묶음)
    const taker = await rows<{ id: string }>(
      test.db,
      `insert into factions (kind, code, regime, fixed) values ('npc', 'territory_taker', 'democracy', true) returning id`,
    );
    const takerId = Number(taker[0]?.id);
    const startCity = await rows<{ id: string }>(
      test.db,
      `select id from world_cities where faction_id = $1 and planet_id = $2 order by id limit 1`,
      [owner, TEST_PLANET_ID],
    );
    const cityId = Number(startCity[0]?.id);
    await rows(test.db, `update world_cities set faction_id = $1 where id = $2`, [takerId, cityId]);
    expect(territory.cityOwnerChanged(cityId, takerId)).toBe(3);
    expect(territory.cityOwnerChanged(cityId, takerId)).toBe(0);
    const view = await territory.planetView(TEST_PLANET_ID, null);
    expect(view?.beacons.map((beacon) => [beacon.factionId, beacon.cityId])).toEqual([
      [takerId, cityId],
      [takerId, cityId],
      [takerId, cityId],
    ]);
    // 새 주인 기준으로 다시 셈: 도시의 비콘 3/3, 껍질은 새 주인 것, 칸 표도 새 주인
    const city = view?.cities.find((entry) => entry.id === cityId);
    expect([city?.factionId, city?.beaconsUsed, city?.beaconsMax]).toEqual([takerId, 3, 3]);
    expect(view?.groups.map((group) => group.factionId)).toEqual([takerId]);
    expect(view?.cells.every(([, faction]) => faction === takerId)).toBe(true);
    // 옛 주인은 이제 그 비콘을 치우지 못한다(새 주인 세력의 것)
    expect(await territory.remove(player(member), 1)).toEqual({ ok: false, code: "forbidden" });
    // 저장(커밋)되어 다시 켜도 새 주인
    await world.stop();
    worlds.splice(0);
    const saved = await rows<{ faction_id: string }>(
      test.db,
      `select faction_id from territory_beacons order by id`,
    );
    expect(saved.map((row) => Number(row.faction_id))).toEqual([takerId, takerId, takerId]);
    // 다른 길(옛 판이 남긴 줄)로 도시 주인만 바뀐 경우: 셈할 때 비콘이 도시를 따라간다
    await rows(test.db, `update world_cities set faction_id = $1 where id = $2`, [owner, cityId]);
    const again = territoryOf(await boot());
    const fixed = await again.planetView(TEST_PLANET_ID, dev);
    expect(fixed?.beacons.every((beacon) => beacon.factionId === owner)).toBe(true);
    await worlds[0]?.persistence?.writer.durable();
    const after = await rows<{ faction_id: string }>(test.db, `select faction_id from territory_beacons`);
    expect(after.every((row) => Number(row.faction_id) === owner)).toBe(true);
  });
});
