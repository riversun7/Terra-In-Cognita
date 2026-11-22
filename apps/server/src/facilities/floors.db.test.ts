// 주거 건물 층 올리기 DB 통합 시험(사용자 결정 D-591 1) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 숙소를 짓고 층 올리기 작업(재료 빼기·끝 시각·job_running) → 다시 켠 뒤 끝나면 층 + 1 → 높은 층은 재료가 늘고 → 최고 층이면 floor_full, 주거 아닌 건물은 not_facility.
import { cityLocation } from "@terra/shared/goodsPlaces";
import { UPKEEP_PERIOD_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import {
  TEST_DATABASE_URL,
  type TestDatabase,
  createTestDatabase,
  joinCityFaction,
  rows,
} from "../testDb.ts";
import { addTestUnits, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { goodsStock } from "./materials.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

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

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

describe.skipIf(!TEST_DATABASE_URL)("주거 건물 층 올리기(D-591 1)", () => {
  it("짓기처럼 작업으로 층이 오르고(다시 켜도), 높은 층은 재료가 늘며, 최고 층이면 floor_full", async () => {
    const first = await boot();
    const p = persistence(first);
    const found = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ($1, $2, $3) returning id`,
      ["Fake_floors", "fake-floors@id.placeholder.invalid", "fake_floors"],
    );
    const userId = String(found[0]?.id);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;
    const map = [...first.maps.values()][0];
    if (!map) throw new Error("no map");
    const [unitId = 0] = addTestUnits(first, userId, map.mapKey, 1, clock);
    await joinCityFaction(test.db, userId, map.mapKey);
    p.settlement.grantCredit(ownerId, 100_000n, clock);
    for (const [item, qty] of Object.entries({ pine_log: 60, stone: 30_000 }))
      expect(await p.facilities.service.devFacilityGrant(userId, item, qty)).toEqual({ ok: true });
    const service = p.facilities.service;
    const built = await service.build(userId, {
      mapKey: map.mapKey,
      facility: "lodging",
      x: 44,
      y: 44,
      rotation: 0,
    });
    if (!built.ok || built.buildingId === undefined)
      throw new Error(`build failed: ${JSON.stringify(built)}`);
    const buildingId = built.buildingId;
    clock = built.doneAtMs ?? clock;
    expect(service.finishDue(clock)).toBe(1);
    const cityId = service.facilities.get(buildingId)?.cityId ?? 0;
    const pine = (world: World) =>
      goodsStock(persistence(world).ledger, ownerId, "pine_log", [cityLocation(cityId)]);
    const before = pine(first);
    expect(service.facilities.get(buildingId)?.floors ?? 1).toBe(1);

    // 1층 → 2층: 숙소 Lv1 짓기 재료(소나무 5) × 1층, 작업이 걸려 있는 동안 다른 작업은 job_running
    const floor = await service.floor(userId, buildingId, [unitId]);
    expect(floor.ok).toBe(true);
    const doneAtMs = floor.ok ? (floor.doneAtMs ?? 0) : 0;
    expect(doneAtMs).toBeGreaterThan(clock);
    expect(pine(first)).toBe(before - 5n);
    expect(service.facilities.get(buildingId)?.floors ?? 1).toBe(1);
    expect(await service.upgrade(userId, buildingId, [])).toEqual({ ok: false, code: "job_running" });
    await p.writer.durable();
    expect(
      await rows(test.db, `select kind from facility_jobs where building_id = $1`, [buildingId]),
    ).toEqual([{ kind: "floor" }]);
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);

    // 다시 켜면 작업이 돌아오고 끝 시각에 층이 오른다
    clock = doneAtMs + 1;
    const second = await boot();
    const again = persistence(second).facilities.service;
    expect(again.finishDue(clock)).toBe(1);
    expect(again.facilities.get(buildingId)?.floors).toBe(2);
    // 2층 → 3층: 재료 × 2층(소나무 10)
    const kept = pine(second);
    const next = await again.floor(userId, buildingId, []);
    expect(next.ok).toBe(true);
    expect(pine(second)).toBe(kept - 10n);
    clock = (next.ok ? (next.doneAtMs ?? clock) : clock) + 1;
    expect(again.finishDue(clock)).toBe(1);
    // 운영자 모드(재료·시간 없이)로 최고 층(설정 칸 기본 5)까지 → floor_full
    expect(await again.floor(userId, buildingId, [], { pace: 1 })).toMatchObject({ ok: true });
    expect(await again.floor(userId, buildingId, [], { pace: 1 })).toMatchObject({ ok: true });
    expect(again.facilities.get(buildingId)?.floors).toBe(5);
    expect(await again.floor(userId, buildingId, [], { pace: 1 })).toEqual({ ok: false, code: "floor_full" });
    await persistence(second).writer.durable();
    expect(
      await rows(test.db, `select floors from world_facilities where building_id = $1`, [buildingId]),
    ).toEqual([{ floors: 5 }]);
    expect(await second.checkInvariants()).toEqual([]);
  });
});
