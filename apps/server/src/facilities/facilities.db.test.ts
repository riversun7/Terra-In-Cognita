// 건물 DB 통합 시험(docs/adr/2026-11-07-buildings-runtime.md) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로 짓기(재료 빼기·일꾼 단축·끝)·노화(30% 멈춤·사용 닳음)·30% 미만 생산 멈춤·수리·장비 수리·다시 켠 뒤 복구를 본다.
// "바뀜 (창고·직무)": 재료 자리(도시 창고·창고 시설·화물만), 창고 시설 넣기·꺼내기·용량, 사라진 창고의 물건, 작업 동안 직무 산출 없음.
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { UPKEEP_PERIOD_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_ORE } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { facilityScreenSourceOf } from "./appSource.ts";
import { goodsAsset, goodsStock, grantGoods } from "./materials.ts";
import { facilitiesOverview } from "./views.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 정시 + 1ms에서 시작 */
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % UPKEEP_PERIOD_MS) + 1;
/** 공방 Lv1(팩): 소나무 10·철광석 6 × 배율 1200‰ → 12·7, 시간 = (2,000g × 10 + 1,000g × 6) × 1.2 × 10초/kg = 312초 */
const WORKSHOP_L1_MS = 312_000;

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

/** 사용자 하나: 소유 주체·시험 일꾼 workers개·재료 */
async function setup(world: World, name: string, workers: number, goods: Record<string, number>) {
  const p = persistence(world);
  const userId = await fakeUser(name);
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  const map = [...world.maps.values()][0];
  if (!map) throw new Error("no map");
  const units = p.settlement.giveWorkers(userId, map.mapKey, workers, clock);
  p.settlement.grantCredit(ownerId, 100_000n, clock);
  for (const [item, qty] of Object.entries(goods))
    expect(await p.facilities.service.devFacilityGrant(userId, item, qty)).toEqual({ ok: true });
  return { userId, ownerId, units, map };
}

/** 공방 Lv1을 짓고 끝낸다 */
async function workshop(world: World, user: Awaited<ReturnType<typeof setup>>, at: number) {
  const service = persistence(world).facilities.service;
  const built = await service.build(user.userId, {
    mapKey: user.map.mapKey,
    facility: "workshop",
    x: at,
    y: at,
    rotation: 0,
  });
  if (!built.ok || built.buildingId === undefined) throw new Error(`build failed: ${JSON.stringify(built)}`);
  clock += WORKSHOP_L1_MS;
  expect(service.finishDue(clock)).toBe(1);
  return built.buildingId;
}

describe.skipIf(!TEST_DATABASE_URL)("건물 짓기·노화·수리(서버)", () => {
  it("짓기: 재료를 빼고 칸을 놓고, 건설 시간 뒤 레벨 1이 되며 짓는 동안은 일하지 않는다", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "builder", 1, { pine_log: 30, iron_ore: 20 });
    // 재료가 모자라면 아무것도 바뀌지 않는다
    const poor = await setup(world, "poor", 0, { pine_log: 1 });
    expect(
      await service.build(poor.userId, {
        mapKey: a.map.mapKey,
        facility: "workshop",
        x: 60,
        y: 60,
        rotation: 0,
      }),
    ).toEqual({ ok: false, code: "insufficient_materials" });
    expect(goodsStock(p.ledger, poor.ownerId, "pine_log")).toBe(1n);
    expect(
      await service.build(a.userId, {
        mapKey: a.map.mapKey,
        facility: "territory_beacon",
        x: 60,
        y: 60,
        rotation: 0,
      }),
    ).toEqual({ ok: false, code: "not_buildable" });

    // 일꾼 하나 = 20% 단축(옛 ConstructionEngine), 재료 = 소나무 12·철광석 7
    const built = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "workshop",
      x: 40,
      y: 40,
      rotation: 0,
      unitIds: a.units,
    });
    expect(built).toEqual({
      ok: true,
      buildingId: expect.any(Number),
      doneAtMs: clock + WORKSHOP_L1_MS * 0.8,
    });
    const buildingId = built.ok ? (built.buildingId ?? 0) : 0;
    expect(goodsStock(p.ledger, a.ownerId, "pine_log")).toBe(18n);
    expect(goodsStock(p.ledger, a.ownerId, "iron_ore")).toBe(13n);
    expect(a.map.buildingOwner(buildingId)).toBe(a.ownerId);
    expect(service.works(buildingId)).toBe(false);
    // 짓는 동안 그 일꾼은 다른 작업에 쓸 수 없다
    expect(
      await service.build(a.userId, {
        mapKey: a.map.mapKey,
        facility: "workshop",
        x: 50,
        y: 50,
        rotation: 0,
        unitIds: a.units,
      }),
    ).toEqual({ ok: false, code: "unit_busy" });
    clock += WORKSHOP_L1_MS * 0.8;
    expect(service.finishDue(clock)).toBe(1);
    expect(service.works(buildingId)).toBe(true);
    expect(service.facilities.get(buildingId)).toMatchObject({ level: 1, conditionPpm: CONDITION_FULL });
    expect(await world.checkInvariants()).toEqual([]);
    const saved = await rows<{ facility_id: string; level: number; condition_ppm: number }>(
      test.db,
      "select facility_id, level, condition_ppm from world_facilities",
    );
    expect(saved).toEqual([{ facility_id: "workshop", level: 1, condition_ppm: CONDITION_FULL }]);
    expect(await rows(test.db, "select id from facility_jobs")).toEqual([]);
    const sinks = await rows<{ balance: string }>(
      test.db,
      "select balance from ledger_accounts where system_code = 'sink:item:pine_log'",
    );
    expect(sinks).toEqual([{ balance: "12" }]);

    // 레벨업: 다음 레벨 재료(가공품 판자·주괴)가 없으면 거절, 있으면 레벨 2
    expect(await service.upgrade(a.userId, buildingId, [])).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    await service.devFacilityGrant(a.userId, "plank", 100);
    await service.devFacilityGrant(a.userId, "iron_ingot", 100);
    const up = await service.upgrade(a.userId, buildingId, []);
    expect(up.ok).toBe(true);
    expect(await service.upgrade(a.userId, buildingId, [])).toEqual({ ok: false, code: "job_running" });
    // 판자 10 × 4 × 1.2 = 48
    expect(goodsStock(p.ledger, a.ownerId, "plank")).toBe(52n);
    clock = up.ok ? (up.doneAtMs ?? clock) : clock;
    service.finishDue(clock);
    expect(service.facilities.get(buildingId)?.level).toBe(2);
  });

  it("노화: 쓰지 않으면 30%에서 멈추고, 일하는 계약이 있으면 더 닳아 30% 아래로 내려가 생산이 멈춘다", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "owner", 2, { pine_log: 30, iron_ore: 20 });
    const buildingId = await workshop(world, a, 40);
    const record = service.facilities.get(buildingId);
    // 10일(노화 기간)의 절반 → 65%
    clock += 5 * DAY;
    service.age(clock);
    expect(record?.conditionPpm).toBe(650_000);
    clock += 30 * DAY;
    service.age(clock);
    expect(record?.conditionPpm).toBe(300_000);
    expect(service.works(buildingId)).toBe(true);

    // 임금형 계약(일함) → 사용 닳음 하루 7% → 30% 아래 → 기능 정지
    const unitId = a.units[0] ?? 0;
    expect((await p.labor.create(a.userId, { kind: "wage", buildingId, unitId })).ok).toBe(true);
    p.settlement.settleOwner(a.ownerId, clock);
    const oreBefore = p.ledger.balanceOf(a.ownerId, ASSET_ORE);
    clock += DAY;
    service.age(clock);
    expect(record?.conditionPpm).toBe(230_000);
    expect(service.works(buildingId)).toBe(false);
    // 그 계약 유닛의 산출은 없다(다른 일꾼 하나는 계약 없이 그대로 시험 광석을 낸다)
    p.settlement.settleOwner(a.ownerId, clock);
    const contracted = p.ledger.balanceOf(a.ownerId, ASSET_ORE) - oreBefore;
    const solo = await setup(world, "solo", 1, {});
    const soloBefore = p.ledger.balanceOf(solo.ownerId, ASSET_ORE);
    clock += DAY;
    p.settlement.settleOwner(solo.ownerId, clock);
    const oneWorkerDay = p.ledger.balanceOf(solo.ownerId, ASSET_ORE) - soloBefore;
    expect(oneWorkerDay).toBeGreaterThan(0n);
    expect(contracted).toBeLessThanOrEqual(oneWorkerDay);
    await p.writer.durable();
    const saved = await rows<{ condition_ppm: number }>(
      test.db,
      "select condition_ppm from world_facilities",
    );
    expect(saved).toEqual([{ condition_ppm: 230_000 }]);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("수리: 노동(유닛) 필요, 10% × 단계, 재료 = 지금 레벨 건설 재료 × 비율, 끝나면 그만큼 오른다", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "repairer", 1, { pine_log: 60, iron_ore: 40 });
    const buildingId = await workshop(world, a, 40);
    expect(await service.repair(a.userId, { buildingId }, 1, a.units)).toEqual({
      ok: false,
      code: "not_damaged",
    });
    clock += 5 * DAY;
    service.age(clock);
    expect(await service.repair(a.userId, { buildingId }, 1, [])).toEqual({
      ok: false,
      code: "unknown_unit",
    });
    const before = goodsStock(p.ledger, a.ownerId, "pine_log");
    // 65% → 10단계 요청이어도 모자란 35%만: 소나무 ⌈12 × 0.35⌉ = 5, 철광석 ⌈7 × 0.35⌉ = 3, 시간 = 312초 × 0.35 × 0.8
    const fixed = await service.repair(a.userId, { buildingId }, 10, a.units);
    expect(fixed).toEqual({ ok: true, doneAtMs: clock + Math.round(WORKSHOP_L1_MS * 0.35 * 0.8) });
    expect(before - goodsStock(p.ledger, a.ownerId, "pine_log")).toBe(5n);
    expect(await service.repair(a.userId, { buildingId }, 1, a.units)).toEqual({
      ok: false,
      code: "job_running",
    });
    clock = fixed.ok ? (fixed.doneAtMs ?? clock) : clock;
    service.finishDue(clock);
    // 고치는 동안(87.36초)에도 노화는 흐른다: 70만 ppm × 87,360 ÷ 10일 = 70 ppm
    expect(service.facilities.get(buildingId)?.conditionPpm).toBe(CONDITION_FULL - 70);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("장비 수리: 공방 수리 줄 재료를 시작할 때 빼고, 고치는 동안 입지 못하며, 끝나면 끝까지 고친다(최대 감소 F11)", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "smith", 1, { pine_log: 30, iron_ore: 20, iron_ingot: 5, deer_hide: 5 });
    const buildingId = await workshop(world, a, 40);
    const unitId = a.units[0] ?? 0;
    const granted = p.holdings.service.acquire({
      ownerId: a.ownerId,
      item: "hold_vest",
      quantity: 1,
      location: -unitId,
      source: "dev_grant",
      atMs: clock,
      seed: 7,
    });
    const holdingId = granted.ok ? (granted.holdings[0] ?? 0) : 0;
    const record = p.holdings.service.list(a.ownerId, clock).holdings.find((entry) => entry.id === holdingId);
    if (!record) throw new Error("no vest");
    expect(await service.repairEquipment(a.userId, buildingId, holdingId, [unitId])).toEqual({
      ok: false,
      code: "not_damaged",
    });
    record.durability = 40;
    // 재료 = 철 주괴 ⌈1 × 티어 1 × 60 ÷ 100⌉ = 1, 사슴 가죽 1. 시간 = 10분 × 1 × 0.6 × 장인 보정(점수 10 → 1.0)
    const started = await service.repairEquipment(a.userId, buildingId, holdingId, [unitId]);
    expect(started).toEqual({ ok: true, doneAtMs: clock + 360_000 });
    expect(goodsStock(p.ledger, a.ownerId, "iron_ingot")).toBe(4n);
    expect(goodsStock(p.ledger, a.ownerId, "deer_hide")).toBe(4n);
    expect(p.holdings.service.equip(a.ownerId, holdingId, 1)).toEqual({ ok: false, code: "busy" });
    expect(await service.repairEquipment(a.userId, buildingId, holdingId, [unitId])).toEqual({
      ok: false,
      code: "holding_busy",
    });
    clock += 360_000;
    expect(service.finishDue(clock)).toBe(1);
    expect(record.maxDurability).toBeLessThan(100);
    expect(record.durability).toBe(record.maxDurability);
    await p.writer.durable();
    const saved = await rows<{ durability: number; max_durability: number }>(
      test.db,
      "select durability, max_durability from item_holdings where id = $1",
      [holdingId],
    );
    expect(saved[0]?.durability).toBe(record.maxDurability);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("다시 켜면: 짓던 작업과 상태가 DB에서 돌아오고, 지난 끝 시각은 그 시각으로 적용된다", async () => {
    const first = await boot();
    const a = await setup(first, "restart", 0, { pine_log: 30, iron_ore: 20 });
    const built = await persistence(first).facilities.service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "workshop",
      x: 40,
      y: 40,
      rotation: 0,
    });
    const buildingId = built.ok ? (built.buildingId ?? 0) : 0;
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);

    clock += WORKSHOP_L1_MS + 5 * DAY;
    const second = await boot();
    const service = persistence(second).facilities.service;
    expect(service.jobs.size).toBe(1);
    expect(service.works(buildingId)).toBe(false);
    service.finishDue(clock);
    // 다 지은 시각부터 5일 노화 → 65%
    service.age(clock);
    expect(service.facilities.get(buildingId)).toMatchObject({ level: 1, conditionPpm: 650_000 });
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("재료 자리·창고 시설: 도시 창고·창고 시설·화물에서만 꺼내고, 넣기는 용량까지, 작업 동안 그 일꾼은 직무 산출이 없다", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "keeper", 1, { pine_log: 22 });
    const unitId = a.units[0] ?? 0;
    const cityId = service.places.cities().find((city) => city.mapKey === a.map.mapKey)?.id ?? 0;
    const pine = goodsAsset("pine_log");
    // 개발 재료는 짓는 자리(기본 = 2차맵 가운데)의 도시 창고로 온다. 위치 없는 옛 물자는 짓기에 쓰지 않는다
    expect(p.ledger.balanceOf(a.ownerId, pine, cityLocation(cityId))).toBe(22n);
    grantGoods(p.ledger, a.ownerId, "iron_ore", 50, clock, null);
    expect(
      await service.build(a.userId, {
        mapKey: a.map.mapKey,
        facility: "workshop",
        x: 40,
        y: 40,
        rotation: 0,
      }),
    ).toEqual({ ok: false, code: "insufficient_materials" });

    // 야적장(창고 단계, 옛 1t): 소나무 2 → 다 지으면 도시가 시설 줄에 남는다
    const yard = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "stockpile",
      x: 60,
      y: 60,
      rotation: 0,
    });
    const yardId = yard.ok ? (yard.buildingId ?? 0) : 0;
    expect(
      await service.storageMove(a.userId, { buildingId: yardId, asset: pine, qty: 1, direction: "in" }),
    ).toEqual({ ok: false, code: "under_construction" });
    clock += 3_600_000;
    service.finishDue(clock);
    expect(service.facilities.get(yardId)).toMatchObject({ level: 1, cityId });
    // 넣기: 도시 창고에서 10 → 창고. 용량 1,000kg = 소나무(2kg) 500 → 600 더는 넘친다. 물자가 아닌 시험 광석은 넣지 않는다
    expect(
      await service.storageMove(a.userId, { buildingId: yardId, asset: pine, qty: 10, direction: "in" }),
    ).toEqual({
      ok: true,
    });
    expect(
      await service.storageMove(a.userId, { buildingId: yardId, asset: pine, qty: 600, direction: "in" }),
    ).toEqual({ ok: false, code: "storage_full" });
    expect(
      await service.storageMove(a.userId, { buildingId: yardId, asset: ASSET_ORE, qty: 1, direction: "in" }),
    ).toEqual({ ok: false, code: "not_storage" });
    expect(p.ledger.balanceOf(a.ownerId, pine, cityLocation(cityId))).toBe(10n);
    expect(p.ledger.balanceOf(a.ownerId, pine, buildingLocation(yardId))).toBe(10n);
    const other = await setup(world, "stranger", 0, {});
    expect(
      await service.storageMove(other.userId, { buildingId: yardId, asset: pine, qty: 1, direction: "in" }),
    ).toEqual({ ok: false, code: "forbidden" });

    // 공방: 소나무 12 = 도시 창고 10 → 창고 시설 2, 철광석 7은 도시 창고(받은 것). 일꾼은 짓는 동안 직무 산출이 없다
    await service.devFacilityGrant(a.userId, "iron_ore", 7, { mapKey: a.map.mapKey, x: 40, y: 40 });
    p.settlement.settleOwner(a.ownerId, clock);
    const oreBefore = p.ledger.balanceOf(a.ownerId, ASSET_ORE);
    const built = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "workshop",
      x: 40,
      y: 40,
      rotation: 0,
      unitIds: [unitId],
    });
    expect(built.ok).toBe(true);
    expect(p.ledger.balanceOf(a.ownerId, pine, cityLocation(cityId))).toBe(0n);
    expect(p.ledger.balanceOf(a.ownerId, pine, buildingLocation(yardId))).toBe(8n);
    expect(goodsStock(p.ledger, a.ownerId, "iron_ore")).toBe(50n);
    // 작업에 묶인 유닛은 노동 계약도 맺지 못한다
    expect(await p.labor.create(a.userId, { kind: "wage", buildingId: yardId, unitId })).toEqual({
      ok: false,
      code: "unit_busy",
    });
    clock = built.ok ? (built.doneAtMs ?? clock) : clock;
    p.settlement.settleOwner(a.ownerId, clock - 60_000);
    expect(service.finishDue(clock)).toBe(1);
    expect(p.ledger.balanceOf(a.ownerId, ASSET_ORE)).toBe(oreBefore);
    clock += 10 * 60_000;
    p.settlement.settleOwner(a.ownerId, clock);
    expect(p.ledger.balanceOf(a.ownerId, ASSET_ORE)).toBeGreaterThan(oreBefore);

    // 화면 자료: 자리 목록(빈 도시 창고는 빠지고 건물 창고 → 위치 없음), 창고 시설 카드의 든 무게, 건물이 선 도시
    const source = facilityScreenSourceOf(world);
    if (!source) throw new Error("no screen source");
    const view = facilitiesOverview(
      source.view,
      { userId: a.userId, ownerId: a.ownerId, nowMs: clock, dev: true },
      [],
    );
    expect(view.places.map((place) => [place.key, place.storage])).toEqual([
      [`building_${yardId}`, true],
      ["ledger", false],
    ]);
    expect(view.facilities.find((facility) => facility.buildingId === yardId)).toMatchObject({
      storage: true,
      storageKg: 1000,
      storedKg: 16,
      cityId,
    });
    expect(view.cities.some((city) => city.id === cityId)).toBe(true);

    // 꺼내기: 창고 → 도시 창고. 모자라면 거절. 창고 건물이 사라지면 남은 물건은 그 도시 창고로 돌아온다
    expect(
      await service.storageMove(a.userId, { buildingId: yardId, asset: pine, qty: 3, direction: "out" }),
    ).toEqual({
      ok: true,
    });
    expect(
      await service.storageMove(a.userId, { buildingId: yardId, asset: pine, qty: 9, direction: "out" }),
    ).toEqual({ ok: false, code: "insufficient_materials" });
    expect(a.map.removeBuilding(yardId)).toEqual({ ok: true });
    service.age(clock);
    expect(service.facilities.has(yardId)).toBe(false);
    expect(p.ledger.balanceOf(a.ownerId, pine, buildingLocation(yardId))).toBe(0n);
    expect(p.ledger.balanceOf(a.ownerId, pine, cityLocation(cityId))).toBe(8n);
    await p.writer.durable();
    expect(await world.checkInvariants()).toEqual([]);
  });
});
