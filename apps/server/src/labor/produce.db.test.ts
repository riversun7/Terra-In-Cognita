// 플레이어 생산 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산") — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로: 채집 시설(벌목장·농장)을 짓고 → 내 휴먼 유닛을 직무 배치(돈 없음)하면 그 건물 창고(사업장 창고, D-569 1784)에 진짜 물건이 쌓이고,
// 남의 채집 시설 임금형 계약도 고용주의 그 건물 창고로 물건을 낸다. 플레이어 유닛은 계약·배치 밖에서 시험 광석을 내지 않는다. 다시 켜도 배치·진행이 이어진다.
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { JOB_GATHER, JOB_NONE, PHASE_REST, UPKEEP_PERIOD_MS, WALK_SPEED } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { facilityScreenSourceOf } from "../facilities/appSource.ts";
import { goodsAsset } from "../facilities/materials.ts";
import { TEST_FACILITY_SOURCE } from "../facilities/testFacilities.ts";
import { facilitiesOverview } from "../facilities/views.ts";
import { unitLifeOf } from "../life/store.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import {
  TEST_DATABASE_URL,
  type TestDatabase,
  createTestDatabase,
  joinCityFaction,
  rows,
} from "../testDb.ts";
import { ASSET_ORE } from "../world/settlement.ts";
import { silentLog, fundTestVault } from "../world/testSupport.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type World, startWorld } from "../world/world.ts";

const HOUR = 3_600_000;
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

async function boot(testMaps = 1): Promise<World> {
  const world = startWorld({
    testBots: 0,
    testMaps,
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

function firstMap(world: World) {
  const map = [...world.maps.values()][0];
  if (!map) throw new Error("no map");
  return map;
}

/** 사용자 하나: 소유 주체·시험 화폐·휴먼 유닛 하나(구인 카드로 고용한 것과 같은 종류) */
async function setup(world: World, name: string, cell: number) {
  const p = persistence(world);
  const userId = await fakeUser(name);
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  p.settlement.grantCredit(ownerId, 100_000n, clock);
  const map = firstMap(world);
  // 땅 규칙(docs/adr/2026-11-14-second-map-build.md): 시험 세계 2차맵에는 NPC 도시가 있어 그 세력에 들어야 짓는다
  await joinCityFaction(test.db, userId, map.mapKey);
  const unitId = p.nextId.unit();
  expect(
    map.addUnit({
      id: unitId,
      size: 1,
      speed: WALK_SPEED,
      cellX: cell,
      cellY: cell,
      ownerId,
      kind: UNIT_KIND_HUMAN,
    }),
  ).toBe(true);
  return { userId, ownerId, unitId, map };
}

/** 그 칸에 시설을 짓고 끝낸다(재료는 그 칸의 도시 창고로 개발 받기) */
async function buildAt(
  world: World,
  userId: string,
  facility: string,
  x: number,
  materials: Record<string, number>,
) {
  const service = persistence(world).facilities.service;
  const mapKey = firstMap(world).mapKey;
  for (const [item, qty] of Object.entries(materials))
    expect(await service.devFacilityGrant(userId, item, qty, { mapKey, x, y: x })).toEqual({ ok: true });
  const built = await service.build(userId, { mapKey, facility, x, y: x, rotation: 0 });
  if (!built.ok || built.buildingId === undefined) throw new Error(`build failed: ${JSON.stringify(built)}`);
  clock += 6 * HOUR;
  service.finishDue(clock);
  expect(service.facilities.get(built.buildingId)?.level).toBe(1);
  return built.buildingId;
}

/** 유닛의 직무 상태(직무·단계·피로) */
function jobStateOf(world: World, unitId: number) {
  let found: { job: number; phase: number; fatigue: number } | undefined;
  for (const map of world.maps.values())
    map.forEachUnit((unit) => {
      if (unit.id === unitId) found = { job: unit.job.job, phase: unit.job.phase, fatigue: unit.job.fatigue };
    });
  return found;
}

function jobOf(world: World, unitId: number): number | undefined {
  let job: number | undefined;
  firstMap(world).forEachUnit((unit) => {
    if (unit.id === unitId) job = unit.job.job;
  });
  return job;
}

/** 그 주체가 그 위치에 가진 그 중분류 물건 합(기본 단위) */
function stockAt(world: World, ownerId: number, location: number, prefix: readonly string[]): bigint {
  let total = 0n;
  for (const account of persistence(world).ledger.accounts())
    if (account.ownerId === ownerId && account.location === location && prefix.includes(account.asset))
      total += account.balance;
  return total;
}

const woodAssets = TEST_HOLDING_CONTENT.items
  .filter((item) => item.subcategory?.id === "wood")
  .map((item) => goodsAsset(item.id));
const cropAssets = TEST_HOLDING_CONTENT.items
  .filter((item) => item.subcategory?.id === "crop")
  .map((item) => goodsAsset(item.id));

/** 원장 자산 한 기본 단위의 무게(g, 시험 아이템) */
const weightOf = (asset: string): bigint => {
  const item = TEST_HOLDING_CONTENT.items.find((entry) => goodsAsset(entry.id) === asset);
  return BigInt(item?.weight ?? 0);
};

describe.skipIf(!TEST_DATABASE_URL)("플레이어 생산(서버)", () => {
  it("직무 배치: 내 휴먼을 내 벌목장에 두면 그 도시 창고에 원목이 쌓이고, 풀면 멈춘다. 배치 밖에서는 시험 광석이 없다", async () => {
    const world = await boot();
    const p = persistence(world);
    const a = await setup(world, "lumber", 30);
    const camp = await buildAt(world, a.userId, "lumber_camp", 50, { pine_log: 30, stone: 20_000 });
    const yard = await buildAt(world, a.userId, "stockpile", 70, { pine_log: 5 });
    const cityId = p.facilities.service.facilities.get(camp)?.cityId ?? null;
    expect(cityId).not.toBeNull();
    // 산출은 그 건물 창고(사업장 창고, 기획 D-569 1784 — 예전에는 도시 창고)
    const city = buildingLocation(camp);
    const before = stockAt(world, a.ownerId, city, woodAssets);

    // 창고 시설은 일터가 아니다, 남의 유닛은 둘 수 없다
    expect(await p.labor.assign(a.userId, yard, a.unitId)).toEqual({ ok: false, code: "not_workplace" });
    const b = await setup(world, "other", 34);
    expect(await p.labor.assign(a.userId, camp, b.unitId)).toEqual({ ok: false, code: "forbidden" });
    expect(await p.labor.unassign(a.userId, a.unitId)).toEqual({ ok: false, code: "not_assigned" });

    expect(await p.labor.assign(a.userId, camp, a.unitId)).toEqual({ ok: true });
    expect(jobOf(world, a.unitId)).toBe(JOB_GATHER);
    expect(await p.labor.assign(a.userId, camp, a.unitId)).toEqual({ ok: false, code: "unit_busy" });
    expect(p.labor.workersAt(camp)).toEqual([
      { unitId: a.unitId, via: "assign", workerOwnerId: a.ownerId, forOwnerId: a.ownerId },
    ]);
    // 배치된 유닛은 계약을 맺지 못한다
    expect(await p.labor.create(a.userId, { kind: "wage", buildingId: camp, unitId: a.unitId })).toEqual({
      ok: false,
      code: "unit_busy",
    });

    // 2시간(진행 1 → T0 묶음 30분, 일 120주기 뒤 쉼): 원목이 벌목장 창고로, 시험 광석은 없다
    clock += 2 * HOUR;
    p.settlement.settleOwner(a.ownerId, clock);
    const after = stockAt(world, a.ownerId, city, woodAssets);
    expect(after).toBeGreaterThan(before);
    expect(p.ledger.balanceOf(a.ownerId, ASSET_ORE)).toBe(0n);
    expect(await world.checkInvariants()).toEqual([]);
    await p.writer.durable();
    const saved = await rows<{ building_id: string; gather_seq: string }>(
      test.db,
      "select building_id, gather_seq from unit_work where unit_id = $1",
      [a.unitId],
    );
    expect(saved[0]?.building_id).toBe(String(camp));
    expect(Number(saved[0]?.gather_seq)).toBeGreaterThan(0);

    // 건물 화면: 일꾼 자리·배치 목록, 유닛 목록의 배치 시설
    const source = facilityScreenSourceOf(world);
    if (!source) throw new Error("no screen source");
    const view = facilitiesOverview(
      source.view,
      { userId: a.userId, ownerId: a.ownerId, nowMs: clock, dev: true },
      [],
    );
    const card = view.facilities.find((facility) => facility.buildingId === camp);
    expect(card?.gather).toMatchObject({
      primary: "dex",
      secondary: "str",
      subcategory: "wood",
      mode: "roll",
    });
    expect(card?.slots).toBe(10);
    expect(card?.workers).toEqual([{ unitId: a.unitId, via: "assign", mine: true, cyborg: false }]);
    expect(view.units.find((unit) => unit.id === a.unitId)).toMatchObject({ busy: true, assignedTo: camp });

    // 풀기: 그때까지 정산하고 직무를 끈다 → 더 흐르면 물건도 광석도 없다
    expect(await p.labor.unassign(a.userId, a.unitId)).toEqual({ ok: true });
    expect(jobOf(world, a.unitId)).toBe(JOB_NONE);
    const stopped = stockAt(world, a.ownerId, city, woodAssets);
    clock += 3 * HOUR;
    p.settlement.settleOwner(a.ownerId, clock);
    expect(stockAt(world, a.ownerId, city, woodAssets)).toBe(stopped);
    expect(p.ledger.balanceOf(a.ownerId, ASSET_ORE)).toBe(0n);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("다시 켜도 배치와 쌓인 진행이 이어지고, 시설이 사라지면 다음 정산에서 배치가 풀린다", async () => {
    const first = await boot();
    const a = await setup(first, "farmer", 30);
    const farm = await buildAt(first, a.userId, "farm", 50, { pine_log: 20 });
    const cityId = persistence(first).facilities.service.facilities.get(farm)?.cityId ?? 0;
    expect(await persistence(first).labor.assign(a.userId, farm, a.unitId)).toEqual({ ok: true });
    clock += 30 * 60_000;
    persistence(first).settlement.settleOwner(a.ownerId, clock);
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);

    const second = await boot();
    const p = persistence(second);
    expect(p.labor.workersAt(farm)).toEqual([
      { unitId: a.unitId, via: "assign", workerOwnerId: a.ownerId, forOwnerId: a.ownerId },
    ]);
    expect(jobOf(second, a.unitId)).toBe(JOB_GATHER);
    // 농장(선택 방식): 스탯 10·10 → 해금 T1(감자·배추·당근), 필요 진행 60 = 1시간에 하나
    clock += 3 * HOUR;
    p.settlement.settleOwner(a.ownerId, clock);
    expect(stockAt(second, a.ownerId, buildingLocation(farm), cropAssets)).toBeGreaterThan(0n);
    expect(stockAt(second, a.ownerId, cityLocation(cityId), cropAssets)).toBe(0n);

    // 시설이 사라지면(관리자 지우기 등) 다음 정산에서 풀리고 직무가 꺼진다
    expect(firstMap(second).removeBuilding(farm)).toEqual({ ok: true });
    clock += HOUR;
    p.settlement.settleOwner(a.ownerId, clock);
    expect(p.labor.workersAt(farm)).toEqual([]);
    expect(jobOf(second, a.unitId)).toBe(JOB_NONE);
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("WP8: 다른 2차맵의 유닛은 배치·계약 못 함(wrong_map), 풀면 피로가 시간만큼 풀리고 다시 배치해도 지워지지 않는다", async () => {
    const world = await boot(2);
    const p = persistence(world);
    const a = await setup(world, "walker", 30);
    const camp = await buildAt(world, a.userId, "lumber_camp", 50, { pine_log: 30, stone: 20_000 });
    // 같은 주인의 유닛 하나를 다른 2차맵에 둔다
    const other = [...world.maps.values()][1];
    if (!other) throw new Error("no second map");
    const away = p.nextId.unit();
    expect(
      other.addUnit({
        id: away,
        size: 1,
        speed: WALK_SPEED,
        cellX: 40,
        cellY: 40,
        ownerId: a.ownerId,
        kind: UNIT_KIND_HUMAN,
      }),
    ).toBe(true);
    expect(await p.labor.assign(a.userId, camp, away)).toEqual({ ok: false, code: "wrong_map" });
    expect(await p.labor.create(a.userId, { kind: "wage", buildingId: camp, unitId: away })).toEqual({
      ok: false,
      code: "wrong_map",
    });
    // 건물 화면 자료: 유닛마다 2차맵(화면이 같은 2차맵 유닛만 고른다)
    const source = facilityScreenSourceOf(world);
    if (!source) throw new Error("no screen source");
    const view = facilitiesOverview(
      source.view,
      { userId: a.userId, ownerId: a.ownerId, nowMs: clock, dev: true },
      [],
    );
    expect(view.units.find((unit) => unit.id === away)?.mapKey).toBe(other.mapKey);
    expect(view.units.find((unit) => unit.id === a.unitId)?.mapKey).toBe(firstMap(world).mapKey);

    // 같은 2차맵 유닛: 90분 일하면 쉬러 가는 피로(기본 생활 규칙 90)에 닿아 쉬고, 30분 쉬면 75(2분에 1점). 풀면 직무 없음에서 2분에 1점씩 풀린다
    expect(await p.labor.assign(a.userId, camp, a.unitId)).toEqual({ ok: true });
    clock += 2 * HOUR;
    expect(await p.labor.unassign(a.userId, a.unitId)).toEqual({ ok: true });
    expect(jobStateOf(world, a.unitId)).toEqual({ job: JOB_NONE, phase: PHASE_REST, fatigue: 75 });
    clock += HOUR;
    p.settlement.settleOwner(a.ownerId, clock);
    expect(jobStateOf(world, a.unitId)).toEqual({ job: JOB_NONE, phase: PHASE_REST, fatigue: 45 });
    // 다시 배치해도 피로는 그대로(쉼 단계를 마저 한다)
    expect(await p.labor.assign(a.userId, camp, a.unitId)).toEqual({ ok: true });
    expect(jobStateOf(world, a.unitId)).toEqual({ job: JOB_GATHER, phase: PHASE_REST, fatigue: 45 });
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("WP8: 임대형 임차인 몫은 그 건물 창고 상한(벌목장 200kg)까지만 쌓인다", async () => {
    const world = await boot();
    const p = persistence(world);
    const boss = await setup(world, "landlord", 30);
    const tenant = await setup(world, "tenant", 34);
    const camp = await buildAt(world, boss.userId, "lumber_camp", 50, { pine_log: 30, stone: 20_000 });
    expect(await p.labor.setRent(boss.userId, camp, 1n)).toEqual({ ok: true });
    const made = await p.labor.create(tenant.userId, {
      kind: "lease",
      buildingId: camp,
      unitId: tenant.unitId,
    });
    expect(made.ok).toBe(true);
    // 건물 창고를 거의 채운다: 주인 몫 소나무 98개(2kg씩 196kg) → 남은 자리 4kg
    const here = buildingLocation(camp);
    const pine = goodsAsset("pine_log");
    p.ledger.post({
      kind: "dev_grant",
      atMs: clock,
      entries: [
        { account: p.ledger.systemAccount(`source:${pine}`, pine), amount: -98n },
        { account: p.ledger.ownerAccount(boss.ownerId, pine, here), amount: 98n },
      ],
    });
    // 8시간: 90주기 일하고 쉬고(기본 생활 규칙 — 피로 90에서 쉰다) 다시 일해 묶음이 둘 넘게 끝난다
    clock += 8 * HOUR;
    p.settlement.settleOwner(tenant.ownerId, clock);
    let tenantGrams = 0n;
    let totalGrams = 0n;
    for (const account of p.ledger.accounts()) {
      if (account.location !== here || account.ownerId === null || account.balance <= 0n) continue;
      const grams = account.balance * weightOf(account.asset);
      totalGrams += grams;
      if (account.ownerId === tenant.ownerId) tenantGrams += grams;
    }
    expect(tenantGrams).toBeLessThanOrEqual(4_000n);
    expect(totalGrams).toBeLessThanOrEqual(200_000n);
    // 묶음은 둘 이상 끝났다(원목은 모두 2kg, 수확량 2 → 묶음 둘이면 8kg — 상한이 없으면 4kg보다 많다): 넘친 몫은 나오지 않았다
    await p.writer.durable();
    const lots = await rows<{ gather_seq: string }>(
      test.db,
      "select gather_seq from unit_work where unit_id = $1",
      [tenant.unitId],
    );
    expect(Number(lots[0]?.gather_seq)).toBeGreaterThanOrEqual(2);
    const source = facilityScreenSourceOf(world);
    if (!source) throw new Error("no screen source");
    const view = facilitiesOverview(
      source.view,
      { userId: boss.userId, ownerId: boss.ownerId, nowMs: clock, dev: true },
      [],
    );
    expect(view.facilities.find((facility) => facility.buildingId === camp)).toMatchObject({
      storageKg: 200,
      storage: false,
    });
    expect(view.facilities.find((facility) => facility.buildingId === camp)?.storedKg).toBeLessThanOrEqual(
      200,
    );
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("남의 채집 시설 임금형 계약(구인 받기 = 임금형과 같은 길): 산출은 고용주의 그 건물 창고, 해지하면 직무가 꺼진다", async () => {
    const world = await boot();
    const p = persistence(world);
    const boss = await setup(world, "boss", 30);
    const camp = await buildAt(world, boss.userId, "lumber_camp", 50, { pine_log: 30, stone: 20_000 });
    fundTestVault(p.ledger, boss.ownerId, camp, 1_000n, clock);
    const made = await p.labor.create(boss.userId, { kind: "wage", buildingId: camp, unitId: boss.unitId });
    expect(made.ok).toBe(true);
    expect(jobOf(world, boss.unitId)).toBe(JOB_GATHER);
    clock += 2 * HOUR;
    p.settlement.settleOwner(boss.ownerId, clock);
    expect(stockAt(world, boss.ownerId, buildingLocation(camp), woodAssets)).toBeGreaterThan(0n);
    expect(p.ledger.balanceOf(boss.ownerId, ASSET_ORE)).toBe(0n);
    // 임금형 = 고용주 몫(forOwnerId), 계약 ID
    expect(p.labor.workersAt(camp)).toMatchObject([
      { unitId: boss.unitId, via: "wage", workerOwnerId: boss.ownerId },
    ]);
    const contractId = made.ok ? (made.contractId ?? 0) : 0;
    expect(await p.labor.terminate(boss.userId, contractId)).toEqual({ ok: true });
    expect(jobOf(world, boss.unitId)).toBe(JOB_NONE);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("유닛 생활 규칙(사용자 결정 2026-11-26): 정하지 않으면 첫 불이익 구간(90)에서 쉬고, 주인이 정하면 그 피로에서 쉬고 돌아온다. 다시 켜도 남는다", async () => {
    const first = await boot();
    const p = persistence(first);
    const a = await setup(first, "ruler", 30);
    const farm = await buildAt(first, a.userId, "farm", 50, { pine_log: 20 });
    const life = unitLifeOf(p);
    if (!life) throw new Error("no life store");
    // 성향 없는 유닛의 기본값 = 첫 불이익 구간 시작, 다 풀고 돌아온다
    expect(life.of(a.unitId)).toEqual({ restAt: 90, resumeAt: 0, saved: false });
    expect(await p.labor.assign(a.userId, farm, a.unitId)).toEqual({ ok: true });
    // 3시간(90주기 = 90분 뒤 쉼): 상한 120까지 가지 않는다
    let peak = 0;
    for (let i = 0; i < 36; i++) {
      clock += 5 * 60_000;
      p.settlement.settleOwner(a.ownerId, clock);
      peak = Math.max(peak, jobStateOf(first, a.unitId)?.fatigue ?? 0);
    }
    expect(peak).toBeGreaterThan(60);
    expect(peak).toBeLessThanOrEqual(90);
    expect(jobStateOf(first, a.unitId)?.phase).toBe(PHASE_REST);
    // 남의 유닛은 못 정한다. 내 유닛은 정하고, 그 뒤로는 30에서 쉬고 10까지 풀리면 다시 일한다
    const other = await setup(first, "stranger", 34);
    expect(life.set(other.userId, a.unitId, { restAt: 30, resumeAt: 10 })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(life.set(a.userId, a.unitId, { restAt: 30, resumeAt: 10 })).toEqual({ ok: true });
    expect(life.of(a.unitId)).toEqual({ restAt: 30, resumeAt: 10, saved: true });
    // 하루 쉬고 일하기를 되풀이: 처음 쉼(90 → 10) 뒤로는 피로가 30을 넘지 않고, 일도 쉼도 한다
    clock += 12 * HOUR;
    p.settlement.settleOwner(a.ownerId, clock);
    let high = 0;
    const phases = new Set<number>();
    for (let i = 0; i < 60; i++) {
      clock += 5 * 60_000;
      p.settlement.settleOwner(a.ownerId, clock);
      const state = jobStateOf(first, a.unitId);
      high = Math.max(high, state?.fatigue ?? 0);
      if (state) phases.add(state.phase);
    }
    expect(high).toBeLessThanOrEqual(30);
    expect(high).toBeGreaterThan(10);
    expect(phases.size).toBe(2);
    await p.writer.durable();
    await first.stop();
    worlds.splice(worlds.indexOf(first), 1);

    const second = await boot();
    const again = unitLifeOf(persistence(second));
    await again?.loaded;
    expect(again?.of(a.unitId)).toEqual({ restAt: 30, resumeAt: 10, saved: true });
    expect(await second.checkInvariants()).toEqual([]);
  });
});
