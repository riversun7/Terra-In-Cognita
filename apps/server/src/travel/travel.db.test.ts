// 2차맵 사이 이동 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP9", 질문 571 가·582) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로: 내 휴먼을 내 벌목장에 직무 배치하고 다른 2차맵으로 보낸다 → 첫 2차맵 변을 넘으면 유닛 행(새 2차맵 키)과 길 줄(다음 구간)이 함께
// 저장되고, 넘기 직전 정산으로 그때까지의 원목이 들고, 다음 정산에서 직무 배치가 풀린다(떠난 뒤 산출 없음). 서버를 다시 켜도 길이 이어져
// 목적 2차맵 목표 칸 둘레에 닿는다. 노동 계약(임금형)도 떠나면 "유닛 사라짐"으로 끝난다.
// WP11(같은 ADR "WP11"): 정찰은 닿으면 돌아오는 길로 바뀌어 줄(정찰한 2차맵·출발 자리·보낸 사용자)이 저장되고 본 2차맵의 탐사 기록이
// world_exploration에 남는다(그래서 확인 단계가 그 2차맵 오염을 안다 — 질문 594 나). 다시 켜도 돌아오는 길이 이어진다.
import { cityLocation } from "@terra/shared/goodsPlaces";
import { JOB_GATHER, JOB_NONE, UPKEEP_PERIOD_MS, WALK_SPEED, arrivalAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { goodsAsset } from "../facilities/materials.ts";
import { TEST_FACILITY_SOURCE } from "../facilities/testFacilities.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import {
  TEST_DATABASE_URL,
  type TestDatabase,
  createTestDatabase,
  joinCityFaction,
  rows,
} from "../testDb.ts";
import type { Viewer } from "../trpc/context.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { TEST_PLANET_ID, type World, startWorld } from "../world/world.ts";
import { createTravelDanger } from "../worldMap/travelDanger.ts";

const HOUR = 3_600_000;
/**
 * 정찰 출발 칸 x: 동쪽 변에서 56칸 — 유닛 시야(24칸)가 옆 2차맵에 닿지 않는다(경계 너머 시야가 닿으면 그 2차맵을 "아는" 2차맵으로 본다,
 * docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)")
 */
const SCOUT_X = 200;
/** 정시 + 1ms에서 시작 */
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % UPKEEP_PERIOD_MS) + 1;

let test: TestDatabase;
let clock = T0;
const worlds: World[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = T0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    testMaps: 3,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    facilities: { content: () => TEST_FACILITY_SOURCE },
    holdings: { content: () => TEST_HOLDING_CONTENT },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  return String(found[0]?.id);
}

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

function mapsOf(world: World): SecondMap[] {
  return [...world.maps.values()];
}

/**
 * 시험 2차맵 줄 셋(부팅 씨앗 — 띄운 차례의 앞). 변 가까이 선 내 유닛이 옆 2차맵을 미리 띄우면(docs/adr/2026-11-08-seamless-second-map.md
 * "바뀜 (2026-11-12)") 띄운 2차맵 목록이 그 뒤로 늘어난다
 */
function seedKeys(world: World): number[] {
  return [0, 1, 2].map((index) => mapAt(world, index).mapKey);
}

function mapAt(world: World, index: number): SecondMap {
  const map = mapsOf(world)[index];
  if (!map) throw new Error(`no map ${index}`);
  return map;
}

/** 쌓인 약속·마이크로태스크(같은 스레드 길 찾기)를 몇 바퀴 돌린다 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
}

/** 유닛이 선 2차맵 차례(없으면 −1) */
function whereIs(world: World, unitId: number): number {
  return mapsOf(world).findIndex((map) => map.unitInfo(unitId) !== undefined);
}

/** 지금 구간 도착 시각으로 시계를 옮기고 확인한다 */
async function walkLeg(world: World, unitId: number): Promise<void> {
  const map = mapsOf(world)[whereIs(world, unitId)];
  const info = map?.unitInfo(unitId);
  if (!info) throw new Error("unit is not on a map");
  clock = Math.max(clock, arrivalAt(info.motion));
  persistence(world).travel.runDue();
  await flush();
}

function jobOf(world: World, unitId: number): number | undefined {
  let job: number | undefined;
  for (const map of mapsOf(world))
    map.forEachUnit((unit) => {
      if (unit.id === unitId) job = unit.job.job;
    });
  return job;
}

const woodAssets = TEST_HOLDING_CONTENT.items
  .filter((item) => item.subcategory?.id === "wood")
  .map((item) => goodsAsset(item.id));

function woodAt(world: World, ownerId: number, location: number): bigint {
  let total = 0n;
  for (const account of persistence(world).ledger.accounts())
    if (account.ownerId === ownerId && account.location === location && woodAssets.includes(account.asset))
      total += account.balance;
  return total;
}

/** 사용자 하나: 소유 주체·시험 화폐·첫 2차맵 칸 (x, y)의 휴먼 유닛 */
async function setup(world: World, name: string, x: number, y: number) {
  const p = persistence(world);
  const userId = await fakeUser(name);
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  // 땅 규칙(docs/adr/2026-11-14-second-map-build.md): 시험 세계 2차맵에는 NPC 도시가 있어 그 세력에 들어야 짓는다
  await joinCityFaction(test.db, userId, mapAt(world, 0).mapKey);
  p.settlement.grantCredit(ownerId, 100_000n, clock);
  const unitId = p.nextId.unit();
  expect(
    mapAt(world, 0).addUnit({
      id: unitId,
      size: 1,
      speed: WALK_SPEED,
      cellX: x,
      cellY: y,
      ownerId,
      kind: UNIT_KIND_HUMAN,
    }),
  ).toBe(true);
  return { userId, ownerId, unitId };
}

/** 첫 2차맵 칸 (x, x)에 시설을 짓고 끝낸다(재료는 그 칸의 도시 창고로 개발 받기) */
async function buildAt(world: World, userId: string, facility: string, x: number) {
  const service = persistence(world).facilities.service;
  const mapKey = mapAt(world, 0).mapKey;
  for (const [item, qty] of Object.entries({ pine_log: 30, stone: 20 }))
    expect(await service.devFacilityGrant(userId, item, qty, { mapKey, x, y: x })).toEqual({ ok: true });
  const built = await service.build(userId, { mapKey, facility, x, y: x, rotation: 0 });
  if (!built.ok || built.buildingId === undefined) throw new Error(`build failed: ${JSON.stringify(built)}`);
  clock += 6 * HOUR;
  service.finishDue(clock);
  return built.buildingId;
}

describe.skipIf(!TEST_DATABASE_URL)("2차맵 사이 이동(서버·DB)", () => {
  it("직무 중인 유닛을 보내면 넘는 순간까지 일한 몫이 들고 다음 정산에서 배치가 풀린다. 다시 켜도 길이 이어진다", async () => {
    const first = await boot();
    const p = persistence(first);
    const a = await setup(first, "walker", 240, 40);
    const camp = await buildAt(first, a.userId, "lumber_camp", 50);
    const city = cityLocation(p.facilities.service.facilities.get(camp)?.cityId ?? 0);
    expect(await p.labor.assign(a.userId, camp, a.unitId)).toEqual({ ok: true });
    clock += HOUR;
    p.settlement.settleOwner(a.ownerId, clock);

    // 확인 단계: 직무 중이라 떠나면 끝난다고 알린다, 지나는 2차맵 셋
    const target = mapAt(first, 2).mapKey;
    const plan = p.travel.plan(a.userId, { unitId: a.unitId, mapKey: target, x: 10, y: 40 });
    expect(plan).toMatchObject({
      ok: true,
      plan: { working: true, route: seedKeys(first) },
    });
    expect(
      await p.travel.start(a.userId, { unitId: a.unitId, mapKey: target, x: 10, y: 40, kind: "move" }),
    ).toMatchObject({ ok: true, maps: 3 });
    await p.writer.durable();
    expect(
      await rows(test.db, "select leg, kind, route from world_travels where unit_id = $1", [a.unitId]),
    ).toEqual([{ leg: 0, kind: "move", route: seedKeys(first).map(String) }]);

    // 변 끝(15칸) 걷는 동안도 그 2차맵이라 일한다 → 넘기 직전 정산으로 그때까지의 원목이 든다
    const before = woodAt(first, a.ownerId, city);
    await walkLeg(first, a.unitId);
    expect(whereIs(first, a.unitId)).toBe(1);
    const crossed = woodAt(first, a.ownerId, city);
    expect(crossed).toBeGreaterThanOrEqual(before);
    await p.writer.durable();
    const saved = await rows<{ map_key: string }>(test.db, "select map_key from world_units where id = $1", [
      a.unitId,
    ]);
    expect(saved[0]?.map_key).toBe(String(mapAt(first, 1).mapKey));
    expect(await rows(test.db, "select leg from world_travels where unit_id = $1", [a.unitId])).toEqual([
      { leg: 1 },
    ]);

    // 질문 582: 다음 정산에서 직무 배치가 풀리고(유닛이 시설의 2차맵에 없다), 떠난 뒤로는 원목이 없다
    expect(jobOf(first, a.unitId)).toBe(JOB_GATHER);
    clock += HOUR;
    p.settlement.settleOwner(a.ownerId, clock);
    expect(p.labor.workersAt(camp)).toEqual([]);
    expect(jobOf(first, a.unitId)).toBe(JOB_NONE);
    expect(woodAt(first, a.ownerId, city)).toBe(crossed);
    expect(await first.checkInvariants()).toEqual([]);

    // 다시 켠다: 유닛은 두 번째 2차맵에서 그 구간을 다시 시작한다. 시계가 1시간 지나 이미 변 끝에 닿아 있었으므로 곧바로 넘고,
    // 마지막 구간을 걸어 목적 2차맵 (10, 40)에 닿는다
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);
    const second = await boot();
    const q = persistence(second);
    await flush();
    expect(q.travel.active).toBe(1);
    expect(whereIs(second, a.unitId)).toBe(2);
    expect(q.travel.list(a.userId)).toMatchObject([{ state: "going", leg: 2 }]);
    await walkLeg(second, a.unitId);
    expect(q.travel.active).toBe(0);
    expect(q.travel.list(a.userId)).toMatchObject([
      { unitId: a.unitId, state: "arrived", mapKey: target, cellX: 10, cellY: 40 },
    ]);
    // 목적 2차맵은 이제 내 유닛이 있어 볼 수 있다(시야 규칙, 513 다)
    expect(await mapAt(second, 2).vision.canView({ userId: a.userId, ownerId: a.ownerId })).toBe(true);
    await q.writer.durable();
    expect(await rows(test.db, "select unit_id from world_travels")).toEqual([]);
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("정찰: 닿으면 돌아오는 길(줄 저장)·탐사 기록(확인 단계가 오염을 안다), 다시 켜도 돌아와 출발 자리에 선다", async () => {
    const first = await boot();
    const p = persistence(first);
    const a = await setup(first, "scout", SCOUT_X, 40);
    const scouted = mapAt(first, 1).mapKey;
    const viewer: Viewer = { id: a.userId, loginId: "fake_scout", roles: ["player"] };
    const danger = createTravelDanger({
      pool: test.db.$client,
      planetId: TEST_PLANET_ID,
      maps: first.maps,
      directory: first,
      threshold: () => 2_000,
    });
    await test.db.$client.query(
      `insert into planet_pollution (planet_id, cell_key, value, updated_at_ms) values ($1, $2, 3000, $3)`,
      [TEST_PLANET_ID, scouted, clock],
    );
    const route = [mapAt(first, 0).mapKey, scouted];
    // 아직 모르는 2차맵: 오염이 높아도 보이지 않는다
    expect(await danger(viewer, route)).toEqual({ dangers: [], unknownMaps: 1 });

    expect(
      (await p.travel.start(a.userId, { unitId: a.unitId, mapKey: scouted, x: 20, y: 40, kind: "scout" })).ok,
    ).toBe(true);
    await walkLeg(first, a.unitId);
    expect(whereIs(first, a.unitId)).toBe(1);
    await walkLeg(first, a.unitId);
    expect(p.travel.list(a.userId)).toMatchObject([
      { state: "going", returning: true, scoutedMapKey: scouted },
    ]);
    await expect
      .poll(async () => {
        await p.writer.durable();
        return rows(
          test.db,
          `select scouted_map_key, user_id, origin_map_key, origin_x, origin_y, target_x, target_y, leg
           from world_travels where unit_id = $1`,
          [a.unitId],
        );
      })
      .toEqual([
        {
          scouted_map_key: String(scouted),
          user_id: a.userId,
          origin_map_key: String(mapAt(first, 0).mapKey),
          origin_x: SCOUT_X,
          origin_y: 40,
          target_x: SCOUT_X,
          target_y: 40,
          leg: 0,
        },
      ]);
    await expect
      .poll(async () => {
        await p.writer.durable();
        return (
          await rows<{ n: string }>(
            test.db,
            `select count(*) as n from world_exploration where user_id = $1 and map_key = $2`,
            [a.userId, scouted],
          )
        )[0]?.n;
      })
      .toBe("1");
    // 이제 아는 2차맵: 오염 위험이 보인다
    expect(await danger(viewer, route)).toEqual({
      dangers: [{ leg: 1, mapKey: scouted, pollution: 3000, pollutionHigh: true, warFactionIds: [] }],
      unknownMaps: 0,
    });

    // 다시 켠다: 돌아오는 길이 이어져 출발 자리 (SCOUT_X, 40)에 선다
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);
    const second = await boot();
    const q = persistence(second);
    await flush();
    expect(q.travel.list(a.userId)).toMatchObject([
      { state: "going", returning: true, scoutedMapKey: scouted },
    ]);
    for (let step = 0; step < 4 && q.travel.active > 0; step++) await walkLeg(second, a.unitId);
    expect(q.travel.list(a.userId)).toMatchObject([
      { state: "arrived", returning: true, mapKey: mapAt(second, 0).mapKey, cellX: SCOUT_X, cellY: 40 },
    ]);
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("노동 계약(임금형) 유닛이 시설의 2차맵을 떠나면 다음 정산에서 '유닛 사라짐'으로 끝난다", async () => {
    const world = await boot();
    const p = persistence(world);
    const boss = await setup(world, "boss", 245, 60);
    const camp = await buildAt(world, boss.userId, "lumber_camp", 50);
    const made = await p.labor.create(boss.userId, { kind: "wage", buildingId: camp, unitId: boss.unitId });
    if (!made.ok || made.contractId === undefined)
      throw new Error(`contract failed: ${JSON.stringify(made)}`);
    clock += HOUR;
    p.settlement.settleOwner(boss.ownerId, clock);
    expect(p.labor.contracts.get(made.contractId)?.state).toBe("active");

    const next = mapAt(world, 1).mapKey;
    expect(
      (await p.travel.start(boss.userId, { unitId: boss.unitId, mapKey: next, x: 20, y: 60, kind: "move" }))
        .ok,
    ).toBe(true);
    await walkLeg(world, boss.unitId);
    expect(whereIs(world, boss.unitId)).toBe(1);
    const crossedAt = clock;
    clock += HOUR;
    p.settlement.settleOwner(boss.ownerId, clock);
    const contract = p.labor.contracts.get(made.contractId);
    expect(contract?.state).toBe("ended");
    expect(contract?.endReason).toBe("unit_gone");
    // 넘기 직전 정산이 계약도 그 시각까지 정산했다 → 떠난 시각에 끝난다
    expect(contract?.endedAtMs).toBe(crossedAt);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
