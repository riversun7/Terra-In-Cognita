// 건물 DB 통합 시험(docs/adr/2026-11-07-buildings-runtime.md) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로 짓기(재료 빼기·일꾼 단축·끝)·노화(30% 멈춤·사용 닳음)·30% 미만 생산 멈춤·수리·장비 수리·다시 켠 뒤 복구를 본다.
// "바뀜 (창고·직무)": 재료 자리(도시 창고·창고 시설·화물만), 창고 시설 넣기·꺼내기·용량, 사라진 창고의 물건, 작업 동안 직무 산출 없음.
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { waterMaskFromHex } from "@terra/shared/waterNearby";
import { REPAIR_SERVICE_ITEM } from "@terra/shared/businessBooks";
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
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
import { ASSET_CREDIT, ASSET_ORE } from "../world/settlement.ts";
import { addTestUnits, silentLog, fundTestVault } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import type { Viewer } from "../trpc/context.ts";
import { facilityScreenSourceOf } from "./appSource.ts";
import { goodsAsset, goodsStock, grantGoods } from "./materials.ts";
import { createFacilityScreenServices } from "./screen.ts";
import { facilitiesOverview } from "./views.ts";
import { waterOk } from "./water.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 정시 + 1ms에서 시작 */
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % UPKEEP_PERIOD_MS) + 1;
/** 공방 Lv1(팩 core@137 — 광석 1g 기본 단위): 소나무 10·철광석 6,000g × 배율 1000‰ → 10·6,000, 시간 = (2,000g × 10 + 1g × 6,000) × 1.0 × 10초/kg = 260초 */
const WORKSHOP_L1_MS = 260_000;
/** 공방 Lv1 짓기 소나무 통나무(개) */
const WORKSHOP_L1_PINE = 10n;

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

/** 사용자 하나: 소유 주체·휴먼 workers개(직무 없음)·재료 */
async function setup(world: World, name: string, workers: number, goods: Record<string, number>) {
  const p = persistence(world);
  const userId = await fakeUser(name);
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  const map = [...world.maps.values()][0];
  if (!map) throw new Error("no map");
  const units = addTestUnits(world, userId, map.mapKey, workers, clock);
  // 땅 규칙(docs/adr/2026-11-14-second-map-build.md): 시험 세계 2차맵에는 NPC 도시가 있어 그 세력에 들어야 짓는다
  await joinCityFaction(test.db, userId, map.mapKey);
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

describe.skipIf(!TEST_DATABASE_URL)("2차맵 건설 땅 규칙(docs/adr/2026-11-14-second-map-build.md)", () => {
  it("다른 세력 도시 2차맵이면 짓기·미리 묻기 모두 막고, 그 세력에 들면 짓는다", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "lander", 0, { pine_log: 60, iron_ore: 40_000 });
    const screen = createFacilityScreenServices(() => facilityScreenSourceOf(world));
    const viewer: Viewer = { id: a.userId, loginId: "lander", roles: ["player"] };
    // 시험 세계 2차맵에는 NPC 도시가 있다: 짓는 2차맵의 도시를 비우면 도시가 없는 2차맵이지만 그 자리는 아직 그 NPC 세력의 1차맵 영토다
    // (영토 배치는 부팅 끝에 셈해 둔 것) → 정부 건물이 없으니 세력이 없어도 짓는다(D-572 알박기 우선, 질문 1983) — 남의 영토라고 알린다
    const npcCity = await rows<{ faction_id: string }>(
      test.db,
      "select faction_id from world_cities where map_key = $1 order by id limit 1",
      [a.map.mapKey],
    );
    await rows(test.db, "delete from world_cities where map_key = $1", [a.map.mapKey]);
    await rows(test.db, "delete from faction_members where user_id = $1", [a.userId]);
    expect(await screen.landRule(viewer, a.map.mapKey)).toEqual({
      status: "ready",
      mapKey: a.map.mapKey,
      allowed: true,
      reason: null,
      cityFaction: null,
      territoryFaction: Number(npcCity[0]?.faction_id),
      // NPC 사회 런타임 없는 세계라 빈 2차맵 알박기의 편은 모른다(질문 2122 — ruins/landClaim.db.test.ts)
      claim: null,
      claimLocked: null,
    });
    // 그 2차맵에 다른 세력 도시(정부 건물)를 둔다
    const nation = await rows<{ id: string }>(
      test.db,
      "insert into factions (kind, code) values ('npc', 'fake_land_nation') returning id",
    );
    const factionId = Number(nation[0]?.id);
    await rows(
      test.db,
      "insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values (950, $1, $2, 200, 200, false, 0)",
      [factionId, a.map.mapKey],
    );
    expect(await screen.landRule(viewer, a.map.mapKey)).toEqual({
      status: "ready",
      mapKey: a.map.mapKey,
      allowed: false,
      reason: "foreign_city",
      cityFaction: factionId,
      territoryFaction: null,
      claim: null,
      claimLocked: null,
    });
    const blocked = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "workshop",
      x: 60,
      y: 60,
      rotation: 0,
    });
    expect(blocked).toEqual({ ok: false, code: "forbidden" });
    // 재료는 그대로
    expect(goodsStock(p.ledger, a.ownerId, "pine_log")).toBe(60n);
    // 운영자 모드(기획 D-564 1663)도 땅 규칙은 본다 — 없애는 것은 재료·건설 시간뿐
    const operatorBlocked = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "workshop",
      x: 80,
      y: 80,
      rotation: 0,
      operator: { pace: 10 },
    });
    expect(operatorBlocked).toEqual({ ok: false, code: "forbidden" });
    expect(goodsStock(p.ledger, a.ownerId, "pine_log")).toBe(60n);
    // 가문 없는 플레이어(무소속)도 사이보그의 나라(소속 도시의 나라)가 그 세력이면 내 도시라 짓는다(D-572 1982, D-565·D-569)
    await rows(
      test.db,
      `insert into cyborgs (user_id, name, name_key, temperament, initial, k_pm, appearance, faction_id, start_city_id, created_at_ms)
         values ($1, '땅시험', '땅시험', 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', $2, 950, 0)`,
      [a.userId, factionId],
    );
    expect(await screen.landRule(viewer, a.map.mapKey)).toMatchObject({ allowed: true });
    const built = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "workshop",
      x: 60,
      y: 60,
      rotation: 0,
    });
    expect(built.ok).toBe(true);
    // 운영자 모드는 재료 없이 바로 다 짓는다(시간 0, D-564 1663)
    const operatorBuilt = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "workshop",
      x: 80,
      y: 80,
      rotation: 0,
      operator: { pace: 10 },
    });
    expect(operatorBuilt).toMatchObject({ ok: true, doneAtMs: clock });
    expect(goodsStock(p.ledger, a.ownerId, "pine_log")).toBe(60n - WORKSHOP_L1_PINE);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("건물 짓기·노화·수리(서버)", () => {
  it("짓기: 재료를 빼고 칸을 놓고, 건설 시간 뒤 레벨 1이 되며 짓는 동안은 일하지 않는다", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "builder", 1, { pine_log: 30, iron_ore: 20_000 });
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

    // 일꾼 하나 = 20% 단축(옛 ConstructionEngine), 재료 = 소나무 10·철광석 6
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
    expect(goodsStock(p.ledger, a.ownerId, "pine_log")).toBe(20n);
    expect(goodsStock(p.ledger, a.ownerId, "iron_ore")).toBe(14_000n);
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
    expect(sinks).toEqual([{ balance: "10" }]);

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
    // 판자 10 × 4 × 1.0 = 40
    expect(goodsStock(p.ledger, a.ownerId, "plank")).toBe(60n);
    clock = up.ok ? (up.doneAtMs ?? clock) : clock;
    service.finishDue(clock);
    expect(service.facilities.get(buildingId)?.level).toBe(2);
  });

  it("노화: 쓰지 않으면 30%에서 멈추고, 일하는 계약이 있으면 더 닳아 30% 아래로 내려가 생산이 멈춘다", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "owner", 2, { pine_log: 30, iron_ore: 20_000 });
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
    fundTestVault(p.ledger, a.ownerId, buildingId, 1_000n, clock);
    expect((await p.labor.create(a.userId, { kind: "wage", buildingId, unitId })).ok).toBe(true);
    p.settlement.settleOwner(a.ownerId, clock);
    // 시설이 일하는 동안(30%)은 계약 유닛이 시험 광석을 낸다(다른 일꾼 하나는 계약이 없어 내지 않는다)
    const started = p.ledger.balanceOf(a.ownerId, ASSET_ORE);
    clock += 10 * 60_000;
    p.settlement.settleOwner(a.ownerId, clock);
    expect(p.ledger.balanceOf(a.ownerId, ASSET_ORE)).toBeGreaterThan(started);
    const oreBefore = p.ledger.balanceOf(a.ownerId, ASSET_ORE);
    clock += DAY - 10 * 60_000;
    service.age(clock);
    expect(record?.conditionPpm).toBe(230_000);
    expect(service.works(buildingId)).toBe(false);
    // 기능 정지: 그 계약 유닛의 산출은 없다(정산하는 때의 상태로 본다)
    p.settlement.settleOwner(a.ownerId, clock);
    expect(p.ledger.balanceOf(a.ownerId, ASSET_ORE)).toBe(oreBefore);
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
    const a = await setup(world, "repairer", 1, { pine_log: 60, iron_ore: 40_000 });
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
    // 65% → 10단계 요청이어도 모자란 35%만: 소나무 ⌈10 × 0.35⌉ = 4, 철광석 ⌈6 × 0.35⌉ = 3, 시간 = 260초 × 0.35 × 0.8
    const fixed = await service.repair(a.userId, { buildingId }, 10, a.units);
    expect(fixed).toEqual({ ok: true, doneAtMs: clock + Math.round(WORKSHOP_L1_MS * 0.35 * 0.8) });
    expect(before - goodsStock(p.ledger, a.ownerId, "pine_log")).toBe(4n);
    expect(await service.repair(a.userId, { buildingId }, 1, a.units)).toEqual({
      ok: false,
      code: "job_running",
    });
    clock = fixed.ok ? (fixed.doneAtMs ?? clock) : clock;
    service.finishDue(clock);
    // 고치는 동안(72.8초)에도 노화는 흐른다: 70만 ppm × 72,800 ÷ 10일 = 58 ppm(내림)
    expect(service.facilities.get(buildingId)?.conditionPpm).toBe(CONDITION_FULL - 58);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("장비 수리: 공방 수리 줄 재료를 시작할 때 빼고, 고치는 동안 입지 못하며, 끝나면 끝까지 고친다(최대 감소 F11)", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "smith", 1, { pine_log: 30, iron_ore: 20_000, iron_ingot: 5, deer_hide: 5 });
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

  it("외주(D-570 1785·D-573 2048): 남의 공방은 그 공방 일꾼이 그 공방 재료로 고치고 요금(주인이 정한 시간당, 없으면 적정가)만 그 공방 사업장 금고로", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const owner = await setup(world, "shopkeeper", 1, { pine_log: 30, iron_ore: 20_000 });
    const buildingId = await workshop(world, owner, 40);
    const guest = await setup(world, "customer", 1, { iron_ingot: 5, deer_hide: 5 });
    const granted = p.holdings.service.acquire({
      ownerId: guest.ownerId,
      item: "hold_vest",
      quantity: 1,
      location: -(guest.units[0] ?? 0),
      source: "dev_grant",
      atMs: clock,
      seed: 7,
    });
    const holdingId = granted.ok ? (granted.holdings[0] ?? 0) : 0;
    const record = p.holdings.service
      .list(guest.ownerId, clock)
      .holdings.find((entry) => entry.id === holdingId);
    if (!record) throw new Error("no vest");
    record.durability = 40;
    // 공방 일꾼이 없으면 받지 않는다
    expect(await service.repairEquipment(guest.userId, buildingId, holdingId, [])).toEqual({
      ok: false,
      code: "no_shop_worker",
    });
    // 주인이 제 유닛을 공방에 직무 배치(공방 = 일터, D-570 1785)
    const worker = owner.units[0] ?? 0;
    expect(await p.labor.assign(owner.userId, buildingId, worker)).toEqual({ ok: true });
    expect(service.shopWorkers(buildingId)).toEqual([worker]);
    // 주인이 시간당 요금 0 = 받지 않음
    expect(
      await p.facilities.businessCommands.run(owner.userId, {
        kind: "price",
        buildingId,
        item: REPAIR_SERVICE_ITEM,
        price: 0n,
      }),
    ).toEqual({ ok: true });
    expect(await service.repairEquipment(guest.userId, buildingId, holdingId, [])).toEqual({
      ok: false,
      code: "service_closed",
    });
    // 시간당 600 → 6분(360,000ms) 수리 요금 = 60
    expect(
      await p.facilities.businessCommands.run(owner.userId, {
        kind: "price",
        buildingId,
        item: REPAIR_SERVICE_ITEM,
        price: 600n,
      }),
    ).toEqual({ ok: true });
    const vault = () => p.ledger.balanceOf(owner.ownerId, ASSET_CREDIT, buildingLocation(buildingId));
    const wallet = () => p.ledger.balanceOf(guest.ownerId, ASSET_CREDIT);
    // 재료는 공방이 낸다(D-573 2048 — 맡기는 사람의 재료는 보지 않는다): 공방 쪽에 재료가 없으면 받지 않는다
    expect(await service.repairEquipment(guest.userId, buildingId, holdingId, [])).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    expect(await service.devFacilityGrant(owner.userId, "iron_ingot", 5)).toEqual({ ok: true });
    expect(await service.devFacilityGrant(owner.userId, "deer_hide", 5)).toEqual({ ok: true });
    const walletBefore = wallet();
    const vaultBefore = vault();
    expect(await service.repairEquipment(guest.userId, buildingId, holdingId, [])).toEqual({
      ok: true,
      doneAtMs: clock + 360_000,
    });
    const fee = 60n;
    expect(goodsStock(p.ledger, guest.ownerId, "iron_ingot")).toBe(5n);
    expect(goodsStock(p.ledger, owner.ownerId, "iron_ingot")).toBe(4n);
    expect(wallet()).toBe(walletBefore - fee);
    const tax = (fee * BigInt(p.facilities.business.taxRateOf(buildingId, owner.ownerId))) / 10_000n;
    expect(vault() - vaultBefore).toBe(fee - tax);
    // 그 공방 일꾼이 작업에 묶인다(맡긴 사람 작업)
    expect(service.unitInJob(worker)).toBe(true);
    clock += 360_000;
    expect(service.finishDue(clock)).toBe(1);
    expect(record.durability).toBe(record.maxDurability);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("다시 켜면: 짓던 작업과 상태가 DB에서 돌아오고, 지난 끝 시각은 그 시각으로 적용된다", async () => {
    const first = await boot();
    const a = await setup(first, "restart", 0, { pine_log: 30, iron_ore: 20_000 });
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

    // 공방: 소나무 10 = 도시 창고 10(창고 시설 10은 그대로), 철광석 6,000g은 도시 창고(받은 것). 일꾼은 짓는 동안 직무 산출이 없고 계약도 못 맺는다
    await service.devFacilityGrant(a.userId, "iron_ore", 6000, { mapKey: a.map.mapKey, x: 40, y: 40 });
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
    expect(p.ledger.balanceOf(a.ownerId, pine, buildingLocation(yardId))).toBe(10n);
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
    // 작업이 끝나면 그 일꾼은 다시 계약을 맺을 수 있다(맺은 계약은 바로 끝낸다 — 아래 화면 자료는 계약과 상관없다)
    fundTestVault(p.ledger, a.ownerId, yardId, 1_000n, clock);
    const freed = await p.labor.create(a.userId, { kind: "wage", buildingId: yardId, unitId });
    expect(freed.ok).toBe(true);
    const freedId = freed.ok ? (freed.contractId ?? 0) : 0;
    expect(await p.labor.terminate(a.userId, freedId)).toEqual({ ok: true });

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
      storedKg: 20,
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
    expect(p.ledger.balanceOf(a.ownerId, pine, cityLocation(cityId))).toBe(10n);
    await p.writer.durable();
    expect(await world.checkInvariants()).toEqual([]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("물가 조건(질문 947 나, 팩 낚시터 needsWaterWithin 5)", () => {
  it("물에서 먼 자리는 needs_water(재료·칸 그대로), 물가 자리는 짓는다. 화면 물 표 = 서버 물 표", async () => {
    const world = await boot();
    const p = persistence(world);
    const service = p.facilities.service;
    const a = await setup(world, "angler", 1, {});
    const fishing = p.facilities.catalog().facility("fishing_spot");
    if (!fishing) throw new Error("no fishing_spot");
    // 놓을 수 있는(빈 땅) 3×3 자리 가운데 물가인 첫 자리·물이 먼 첫 자리(시험 2차맵 S1 임시 지형에는 물이 있다)
    let wet: { x: number; y: number } | undefined;
    let dry: { x: number; y: number } | undefined;
    for (let y = 8; y < 248 && (!wet || !dry); y += 3)
      for (let x = 8; x < 248 && (!wet || !dry); x += 3) {
        if (!a.map.canPlace({ x, y, width: 3, height: 3, rotation: 0 })) continue;
        if (waterOk(a.map, fishing, x, y, 0)) wet ??= { x, y };
        else dry ??= { x, y };
      }
    if (!wet || !dry) throw new Error(`spots not found: ${JSON.stringify({ wet, dry })}`);
    // 재료는 물가 자리가 속한 도시 창고(또는 내 유닛 화물)로 — 짓는 자리의 재료 규칙(D-516 361)
    for (const [item, qty] of [
      ["pine_log", 40],
      ["stone", 20_000],
    ] as const)
      expect(await service.devFacilityGrant(a.userId, item, qty, { mapKey: a.map.mapKey, ...wet })).toEqual({
        ok: true,
      });
    const buildings = () => {
      let count = 0;
      a.map.forEachBuilding(() => {
        count += 1;
      });
      return count;
    };
    const before = buildings();
    expect(
      await service.build(a.userId, { mapKey: a.map.mapKey, facility: "fishing_spot", ...dry, rotation: 0 }),
    ).toEqual({ ok: false, code: "needs_water" });
    expect(goodsStock(p.ledger, a.ownerId, "pine_log")).toBe(40n);
    expect(goodsStock(p.ledger, a.ownerId, "stone")).toBe(20_000n);
    expect(buildings()).toBe(before);
    const built = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "fishing_spot",
      ...wet,
      rotation: 0,
    });
    expect(built).toMatchObject({ ok: true, buildingId: expect.any(Number) });
    expect(buildings()).toBe(before + 1);
    // 화면 조회(facilities.waterMask)는 같은 물 표를 16진수로 준다 — 짓기 폼이 같은 함수로 미리 본다
    const screen = createFacilityScreenServices(() => facilityScreenSourceOf(world));
    const view = screen.waterMask(a.map.mapKey);
    expect(view.status).toBe("ready");
    if (view.status === "ready") {
      const mask = waterMaskFromHex(view.hex, view.size);
      expect(mask).toEqual(a.map.waterMask());
    }
    expect(screen.waterMask(999_999).status).toBe("unknown_map");
    const source = facilityScreenSourceOf(world);
    if (!source) throw new Error("no source");
    const overview = facilitiesOverview(
      source.view,
      { userId: a.userId, ownerId: a.ownerId, nowMs: clock, dev: false },
      [],
    );
    expect(overview.catalog.find((entry) => entry.id === "fishing_spot")?.needsWaterWithin).toBe(5);
    expect(overview.catalog.find((entry) => entry.id === "farm")?.needsWaterWithin).toBeNull();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("건물 채집소 면적 모듈·기를 티어(기획 D-569 1761·1765)", () => {
  it("모듈은 짓기처럼 작업(재료 빼기·끝 시각)으로 붙고, 떼면 바로 빠지며(재료 돌려주지 않음), 기를 티어·모듈·작업이 다시 켜도 돌아온다", async () => {
    const first = await boot();
    const a = await setup(first, "plots", 1, { pine_log: 60 });
    const service = persistence(first).facilities.service;
    const built = await service.build(a.userId, {
      mapKey: a.map.mapKey,
      facility: "farm",
      x: 44,
      y: 44,
      rotation: 0,
    });
    if (!built.ok || built.buildingId === undefined)
      throw new Error(`build failed: ${JSON.stringify(built)}`);
    const buildingId = built.buildingId;
    clock = built.doneAtMs ?? clock;
    expect(service.finishDue(clock)).toBe(1);
    const cityId = service.facilities.get(buildingId)?.cityId ?? null;
    const pine = () =>
      goodsStock(persistence(first).ledger, a.ownerId, "pine_log", [cityLocation(cityId ?? 0)]);
    const before = pine();

    // 기를 티어: Lv1 = 최고 T1 → 0은 되고 2는 tier_locked
    expect(await service.gatherTier(a.userId, buildingId, 2)).toEqual({ ok: false, code: "tier_locked" });
    expect(await service.gatherTier(a.userId, buildingId, 0)).toEqual({ ok: true });

    // 모듈: 일꾼 하나로 붙이기 → 작업(끝나기 전에는 모듈 0, 다른 작업은 job_running)
    const unitId = a.units[0] ?? 0;
    const plot = await service.plot(a.userId, buildingId, [unitId]);
    expect(plot.ok).toBe(true);
    const doneAtMs = plot.ok ? (plot.doneAtMs ?? 0) : 0;
    expect(doneAtMs).toBeGreaterThan(clock);
    expect(pine()).toBeLessThan(before);
    expect(service.facilities.get(buildingId)?.plots ?? 0).toBe(0);
    expect(await service.upgrade(a.userId, buildingId, [])).toEqual({ ok: false, code: "job_running" });
    await persistence(first).writer.durable();
    expect(
      await rows(test.db, `select kind from facility_jobs where building_id = $1`, [buildingId]),
    ).toEqual([{ kind: "plot" }]);
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);

    // 다시 켜면 작업·기를 티어가 돌아오고, 끝 시각에 모듈이 붙는다
    clock = doneAtMs + 1;
    const second = await boot();
    const again = persistence(second).facilities.service;
    expect(again.facilities.get(buildingId)?.gatherTier).toBe(0);
    expect(again.finishDue(clock)).toBe(1);
    expect(again.facilities.get(buildingId)?.plots).toBe(1);
    // Lv1 자리 하나 — 가득
    expect(await again.plot(a.userId, buildingId, [])).toEqual({ ok: false, code: "plot_full" });
    // 떼기: 바로 빠지고 재료는 그대로(돌려주지 않음)
    const kept = goodsStock(persistence(second).ledger, a.ownerId, "pine_log", [cityLocation(cityId ?? 0)]);
    expect(await again.plotRemove(a.userId, buildingId)).toEqual({ ok: true });
    expect(again.facilities.get(buildingId)?.plots ?? 0).toBe(0);
    expect(goodsStock(persistence(second).ledger, a.ownerId, "pine_log", [cityLocation(cityId ?? 0)])).toBe(
      kept,
    );
    expect(await again.plotRemove(a.userId, buildingId)).toEqual({ ok: false, code: "no_plot" });
    // 기본으로 되돌림
    expect(await again.gatherTier(a.userId, buildingId, null)).toEqual({ ok: true });
    await persistence(second).writer.durable();
    expect(
      await rows(test.db, `select plots, gather_tier from world_facilities where building_id = $1`, [
        buildingId,
      ]),
    ).toEqual([{ plots: 0, gather_tier: null }]);
    expect(await second.checkInvariants()).toEqual([]);
  });
});
