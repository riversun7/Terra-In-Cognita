// 노동 계약 DB 통합 시험(docs/adr/2026-11-03-labor-contracts.md) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로 임금형(보증금·자동 해고·일시 중지·채우기)·임대형(임대료·유예, 손 해지 유예 = 기획 341)·구인 게시(남의 유닛 고용)를
// 돌리고, 원장 불변 조건(I1·I2·I14)과 다시 켠 뒤의 복구를 본다.
import { buildingLocation } from "@terra/shared/goodsPlaces";
import { UPKEEP_PERIOD_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT, ASSET_ORE } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { laborEscrowCode } from "@terra/sim";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
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
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
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

/** 사용자 하나: 소유 주체·시험 일꾼 count개·시험 화폐 credit, 원하면 그 사용자 건물 하나 */
async function setup(
  world: World,
  name: string,
  options: { workers: number; credit: bigint; building?: number },
) {
  const p = persistence(world);
  const userId = await fakeUser(name);
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  const map = [...world.maps.values()][0];
  if (!map) throw new Error("no map");
  const units = p.settlement.giveWorkers(userId, map.mapKey, options.workers, clock);
  if (options.credit > 0n) p.settlement.grantCredit(ownerId, options.credit, clock);
  let buildingId = 0;
  if (options.building !== undefined) {
    const placed = map.placeBuilding(
      { x: options.building, y: options.building, width: 2, height: 2, rotation: 0 },
      ownerId,
    );
    if (!placed.ok || placed.buildingId === undefined) throw new Error("no building");
    buildingId = placed.buildingId;
  }
  return { userId, ownerId, units, buildingId, map };
}

describe.skipIf(!TEST_DATABASE_URL)("노동 계약(서버)", () => {
  it("임금형: 보증금 30일분 → 30번 낸 뒤 자동 해고, 에스크로는 비고 불변 조건이 맞다", async () => {
    const world = await boot();
    const p = persistence(world);
    const a = await setup(world, "employer", { workers: 1, credit: 100_000n, building: 40 });
    const unitId = a.units[0] ?? 0;
    const made = await p.labor.create(a.userId, { kind: "wage", buildingId: a.buildingId, unitId });
    expect(made).toEqual({ ok: true, contractId: 1 });
    // 임금 = 효율 10 × 단가 2.0 = 20, 보증금 600, 첫 임금은 바로(일꾼 지갑 = 유닛 소유 주체 = 나)
    const contract = p.labor.contracts.get(1);
    expect(contract?.rate).toBe(20n);
    expect(contract?.deposit).toBe(580n);
    expect(p.ledger.balance(p.ledger.systemAccount(laborEscrowCode(1), ASSET_CREDIT))).toBe(580n);
    expect(await world.checkInvariants()).toEqual([]);

    clock = T0 + 31 * DAY;
    p.settlement.settleOwner(a.ownerId, clock);
    expect(contract?.state).toBe("ended");
    expect(contract?.endReason).toBe("deposit_used_up");
    expect(contract?.paidTotal).toBe(600n);
    expect(await world.checkInvariants()).toEqual([]);
    const saved = await rows<{ state: string; deposit: string; paid_total: string }>(
      test.db,
      "select state, deposit, paid_total from labor_contracts where id = 1",
    );
    expect(saved).toEqual([{ state: "ended", deposit: "0", paid_total: "600" }]);
    const wages = await rows<{ n: string }>(
      test.db,
      "select count(*) as n from ledger_transactions where kind = 'labor_wage'",
    );
    expect(wages).toEqual([{ n: "30" }]);
  });

  it("임금형: 모자라게 남으면 일시 중지(산출 없음), 채우면 다시 일한다. 해고하면 남은 보증금이 돌아온다", async () => {
    const world = await boot();
    const p = persistence(world);
    const a = await setup(world, "pauser", { workers: 1, credit: 100_000n, building: 40 });
    const unitId = a.units[0] ?? 0;
    await p.labor.create(a.userId, { kind: "wage", buildingId: a.buildingId, unitId });
    expect(await p.labor.topUp(a.userId, 1, 15n)).toEqual({ ok: true });
    clock = T0 + 30 * DAY + HOUR;
    p.settlement.settleOwner(a.ownerId, clock);
    const contract = p.labor.contracts.get(1);
    expect(contract?.state).toBe("paused");
    expect(contract?.deposit).toBe(15n);
    expect(await p.labor.topUp(a.userId, 1, 100n)).toEqual({ ok: true });
    expect(contract?.state).toBe("active");
    expect(contract?.deposit).toBe(95n);
    const before = p.ledger.balanceOf(a.ownerId, ASSET_CREDIT);
    expect(await p.labor.terminate(a.userId, 1)).toEqual({ ok: true });
    expect(contract?.endReason).toBe("owner");
    expect(p.ledger.balanceOf(a.ownerId, ASSET_CREDIT)).toBe(before + 95n);
    expect(await p.labor.terminate(a.userId, 1)).toEqual({ ok: false, code: "not_open" });
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("임대형: 남의 시설을 시간당 임대료로 빌리고, 못 내면 해지 + 7일 유예 뒤 끝", async () => {
    const world = await boot();
    const p = persistence(world);
    const owner = await setup(world, "landlord", { workers: 0, credit: 0n, building: 40 });
    const tenant = await setup(world, "tenant", { workers: 1, credit: 100n });
    const unitId = tenant.units[0] ?? 0;
    // 임대료가 걸리기 전에는 빌릴 수 없다. 남의 건물 임대료는 못 정한다
    expect(
      await p.labor.create(tenant.userId, { kind: "lease", buildingId: owner.buildingId, unitId }),
    ).toEqual({
      ok: false,
      code: "not_for_lease",
    });
    expect(await p.labor.setRent(tenant.userId, owner.buildingId, 30n)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await p.labor.setRent(owner.userId, owner.buildingId, 30n)).toEqual({ ok: true });
    expect(
      await p.labor.create(tenant.userId, { kind: "lease", buildingId: owner.buildingId, unitId }),
    ).toEqual({
      ok: true,
      contractId: 1,
    });
    // 같은 유닛으로 또 맺지 않는다. 남의 유닛으로 맺지 않는다
    expect(
      await p.labor.create(tenant.userId, { kind: "lease", buildingId: owner.buildingId, unitId }),
    ).toEqual({
      ok: false,
      code: "unit_busy",
    });
    expect(
      await p.labor.create(owner.userId, { kind: "wage", buildingId: owner.buildingId, unitId }),
    ).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(p.ledger.balanceOf(owner.ownerId, ASSET_CREDIT)).toBe(30n);
    // 임차인 100: 맺을 때 30, 1시간 뒤 30, 2시간 뒤 30(남은 10), 3시간 뒤에는 못 낸다(계약 정산이 유지비보다 먼저)
    clock = T0 + 5 * HOUR;
    p.settlement.settleOwner(tenant.ownerId, clock);
    const contract = p.labor.contracts.get(1);
    expect(contract?.state).toBe("grace");
    expect(contract?.endReason).toBe("rent_unpaid");
    expect(contract?.paidTotal).toBe(90n);
    expect(p.ledger.balanceOf(owner.ownerId, ASSET_CREDIT)).toBe(90n);
    const view = p.labor.overview(tenant.userId);
    expect(view.contracts.map((c) => [c.id, c.kind, c.role, c.state])).toEqual([
      [1, "lease", "worker", "grace"],
    ]);
    expect(view.contracts[0]?.graceUntil).toBe(T0 + 3 * HOUR + 7 * DAY);
    expect(view.buildings).toEqual([{ id: owner.buildingId, own: false, rent: "30" }]);
    expect(p.labor.overview(owner.userId).contracts.map((c) => c.role)).toEqual(["owner"]);
    // 임차인 몫 산출은 그 건물 창고(위치 = 건물)에 쌓였다(D-516 382). 유예 동안 하나를 꺼내 간다(그 도시의 내 도시 창고로)
    const here = buildingLocation(owner.buildingId);
    const share = p.ledger.balanceOf(tenant.ownerId, ASSET_ORE, here);
    expect(share).toBeGreaterThan(1n);
    expect(
      await p.facilities.service.storageMove(tenant.userId, {
        buildingId: owner.buildingId,
        asset: ASSET_ORE,
        qty: 1,
        direction: "out",
      }),
    ).toEqual({ ok: true });
    clock = T0 + 8 * DAY;
    p.settlement.settleOwner(tenant.ownerId, clock);
    expect(contract?.state).toBe("ended");
    // 유예가 끝나 남은 몫은 시설 주인 것이 됐다(같은 건물 창고, 옛 StorageUtils)
    expect(p.ledger.balanceOf(tenant.ownerId, ASSET_ORE, here)).toBe(0n);
    expect(p.ledger.balanceOf(owner.ownerId, ASSET_ORE, here)).toBe(share - 1n);
    expect(await world.checkInvariants()).toEqual([]);
    // 끝난 계약은 유예 끝(남은 물건이 넘어간 시각)부터 7일 화면에 남고, 그 뒤 빠진다(DB에는 남는다)
    expect(p.labor.overview(tenant.userId).contracts[0]?.leftoversMovedAt).toBe(T0 + 3 * HOUR + 7 * DAY);
    clock = T0 + 15 * DAY;
    expect(p.labor.overview(tenant.userId).contracts).toEqual([]);
  });

  it("시설이 사라지면 끝내고 남은 보증금을 돌려준다. 다시 켜도 계약·에스크로가 그대로다", async () => {
    const first = await boot();
    const p = persistence(first);
    const a = await setup(first, "keeper", { workers: 2, credit: 100_000n, building: 40 });
    await p.labor.create(a.userId, { kind: "wage", buildingId: a.buildingId, unitId: a.units[0] ?? 0 });
    await p.labor.create(a.userId, {
      kind: "wage",
      buildingId: a.buildingId,
      unitId: a.units[1] ?? 0,
      termHours: 72,
    });
    await p.writer.durable();
    await first.crashForTest("commit");

    clock = T0 + DAY + HOUR;
    const second = await boot();
    const q = persistence(second);
    expect(q.labor.contracts.size).toBe(2);
    expect(await second.checkInvariants()).toEqual([]);
    q.settlement.settleOwner(a.ownerId, clock);
    expect(q.labor.contracts.get(1)?.paidTotal).toBe(40n);
    expect(a.map.mapKey).toBeGreaterThan(0);
    const map = second.maps.get(a.map.mapKey);
    expect(map?.removeBuilding(a.buildingId)).toEqual({ ok: true });
    const before = q.ledger.balanceOf(a.ownerId, ASSET_CREDIT);
    clock += HOUR;
    q.settlement.settleOwner(a.ownerId, clock);
    expect(q.labor.contracts.get(1)?.endReason).toBe("building_gone");
    expect(q.labor.contracts.get(2)?.endReason).toBe("building_gone");
    // 두 계약의 남은 보증금(560씩)이 돌아온다(유지비 2를 빼고)
    expect(q.ledger.balanceOf(a.ownerId, ASSET_CREDIT)).toBe(before + 1120n - 2n);
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("구인 게시: 시설 주인이 일자리를 내고 남의 유닛 주인이 받으면 임금형(고용주 = 시설 주인, 산출은 고용주 몫)", async () => {
    const world = await boot();
    const p = persistence(world);
    const boss = await setup(world, "boss", { workers: 0, credit: 100_000n, building: 40 });
    const hand = await setup(world, "hand", { workers: 2, credit: 1_000n });
    const [unitA = 0, unitB = 0] = hand.units;
    // 남의 시설에는 내지 못한다. 조정이 N28 범위(800~1500‰) 밖이면 내지 못한다
    expect(
      await p.labor.postJob(hand.userId, { buildingId: boss.buildingId, adjustPm: 1200, slots: 1 }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await p.labor.postJob(boss.userId, { buildingId: boss.buildingId, adjustPm: 2000, slots: 1 }),
    ).toEqual({ ok: false, code: "invalid_terms" });
    expect(
      await p.labor.postJob(boss.userId, {
        buildingId: boss.buildingId,
        adjustPm: 1200,
        slots: 2,
        termHours: 72,
      }),
    ).toEqual({ ok: true, jobId: 1 });
    // 게시판: 남에게 보인다(임금 = 효율 10 × 단가 2.0 × 1.2 = 24, 한 명에 보증금 720). 낸 사람은 "내 구인"에서 본다
    const seen = p.labor.jobs(hand.userId, {});
    expect(seen.jobs.map((j) => [j.id, j.buildingId, j.wage, j.deposit, j.slots, j.filled, j.own])).toEqual([
      [1, boss.buildingId, "24", "720", 2, 0, false],
    ]);
    const cityId = seen.jobs[0]?.cityId ?? null;
    expect(cityId).not.toBeNull();
    expect(seen.cities).toEqual([{ id: cityId, jobs: 1 }]);
    expect(p.labor.jobs(hand.userId, { cityId: (cityId ?? 0) + 1000 }).jobs).toEqual([]);
    expect(p.labor.jobs(hand.userId, { buildingId: boss.buildingId }).total).toBe(1);
    expect(p.labor.jobs(boss.userId, {}).jobs).toEqual([]);
    expect(p.labor.overview(boss.userId).jobs.map((j) => [j.id, j.own, j.filled])).toEqual([[1, true, 0]]);

    const bossBefore = p.ledger.balanceOf(boss.ownerId, ASSET_CREDIT);
    expect(await p.labor.acceptJob(hand.userId, 1, unitA)).toEqual({ ok: true, contractId: 1 });
    const first = p.labor.contracts.get(1);
    expect([
      first?.kind,
      first?.ownerId,
      first?.workerOwnerId,
      first?.rate,
      first?.deposit,
      first?.endsAtMs,
    ]).toEqual(["wage", boss.ownerId, hand.ownerId, 24n, 696n, clock + 72 * HOUR]);
    expect(p.ledger.balanceOf(boss.ownerId, ASSET_CREDIT)).toBe(bossBefore - 720n);
    expect(await p.labor.acceptJob(hand.userId, 1, unitA)).toEqual({ ok: false, code: "unit_busy" });
    expect(p.labor.overview(hand.userId).contracts.map((c) => [c.id, c.kind, c.role])).toEqual([
      [1, "wage", "worker"],
    ]);
    expect(p.labor.overview(boss.userId).contracts.map((c) => [c.id, c.role])).toEqual([[1, "owner"]]);
    // 두 번째로 받으면 자리가 다 차서 닫힌다
    expect(await p.labor.acceptJob(hand.userId, 1, unitB)).toEqual({ ok: true, contractId: 2 });
    expect(p.labor.overview(boss.userId).jobs).toEqual([]);
    expect(p.labor.jobs(hand.userId, {}).jobs).toEqual([]);
    expect(await p.labor.acceptJob(hand.userId, 1, unitB)).toEqual({ ok: false, code: "job_not_open" });
    expect(await rows(test.db, "select state, filled from labor_postings where id = 1")).toEqual([
      { state: "filled", filled: 2 },
    ]);

    // 일한 산출은 고용주 몫(일꾼 주인 창고에는 들어오지 않는다)
    const handOre = p.ledger.balanceOf(hand.ownerId, ASSET_ORE);
    const bossOre = p.ledger.balanceOf(boss.ownerId, ASSET_ORE);
    clock += 6 * HOUR;
    p.settlement.settleOwner(hand.ownerId, clock);
    expect(p.ledger.balanceOf(boss.ownerId, ASSET_ORE)).toBeGreaterThan(bossOre);
    expect(p.ledger.balanceOf(hand.ownerId, ASSET_ORE)).toBe(handOre);

    // 어느 쪽이든 해지한다: 남은 보증금은 고용주에게(임금형은 유예 없이 끝)
    const bossNow = p.ledger.balanceOf(boss.ownerId, ASSET_CREDIT);
    expect(await p.labor.terminate(hand.userId, 1)).toEqual({ ok: true });
    expect([first?.state, first?.endReason]).toEqual(["ended", "worker"]);
    expect(await p.labor.terminate(boss.userId, 2)).toEqual({ ok: true });
    expect(p.labor.contracts.get(2)?.endReason).toBe("owner");
    expect(p.ledger.balanceOf(boss.ownerId, ASSET_CREDIT)).toBe(bossNow + 696n + 696n);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("구인: 다시 내면 바꾸고, 거두면 더 받지 않으며(맺은 계약은 그대로), 시설이 사라지면 받을 때 닫는다", async () => {
    const first = await boot();
    const p = persistence(first);
    const boss = await setup(first, "chief", { workers: 1, credit: 900n, building: 40 });
    const hand = await setup(first, "helper", { workers: 2, credit: 1_000n });
    const [unitA = 0, unitB = 0] = hand.units;
    const bossUnit = boss.units[0] ?? 0;
    expect(
      await p.labor.postJob(boss.userId, { buildingId: boss.buildingId, adjustPm: 1000, slots: 3 }),
    ).toEqual({ ok: true, jobId: 1 });
    // 같은 시설에 다시 내면 바꾼다(앞 게시는 거둠)
    expect(
      await p.labor.postJob(boss.userId, { buildingId: boss.buildingId, adjustPm: 800, slots: 3 }),
    ).toEqual({ ok: true, jobId: 2 });
    expect(p.labor.jobs(hand.userId, {}).jobs.map((j) => [j.id, j.wage, j.deposit])).toEqual([
      [2, "16", "480"],
    ]);
    expect(await p.labor.acceptJob(hand.userId, 1, unitA)).toEqual({ ok: false, code: "job_not_open" });
    // 자기 게시·없는 유닛·남의 유닛으로는 받지 않는다
    expect(await p.labor.acceptJob(boss.userId, 2, bossUnit)).toEqual({ ok: false, code: "invalid_terms" });
    expect(await p.labor.acceptJob(hand.userId, 2, 999_999)).toEqual({ ok: false, code: "unknown_unit" });
    expect(await p.labor.acceptJob(hand.userId, 2, bossUnit)).toEqual({ ok: false, code: "forbidden" });
    // 고용주 900 → 첫 사람 보증금 480, 남은 420으로는 두 번째를 받지 못한다
    expect(await p.labor.acceptJob(hand.userId, 2, unitA)).toEqual({ ok: true, contractId: 1 });
    expect(await p.labor.acceptJob(hand.userId, 2, unitB)).toEqual({
      ok: false,
      code: "employer_insufficient_funds",
    });
    // 거두기는 낸 사람만. 거둬도 맺은 계약은 그대로
    expect(await p.labor.withdrawJob(hand.userId, 2)).toEqual({ ok: false, code: "forbidden" });
    expect(await p.labor.withdrawJob(boss.userId, 2)).toEqual({ ok: true });
    expect(await p.labor.withdrawJob(boss.userId, 2)).toEqual({ ok: false, code: "job_not_open" });
    expect(await p.labor.acceptJob(hand.userId, 2, unitB)).toEqual({ ok: false, code: "job_not_open" });
    expect(p.labor.contracts.get(1)?.state).toBe("active");
    await p.writer.durable();
    expect(await rows(test.db, "select id, state, filled from labor_postings order by id")).toEqual([
      { id: "1", state: "withdrawn", filled: 0 },
      { id: "2", state: "withdrawn", filled: 1 },
    ]);

    // 열린 게시는 다시 켜도 이어진다
    expect(
      await p.labor.postJob(boss.userId, { buildingId: boss.buildingId, adjustPm: 900, slots: 1 }),
    ).toEqual({ ok: true, jobId: 3 });
    await p.writer.durable();
    await first.crashForTest("commit");
    const second = await boot();
    const q = persistence(second);
    expect([...q.labor.contracts.keys()]).toEqual([1]);
    expect(q.labor.jobs(hand.userId, {}).jobs.map((j) => j.id)).toEqual([3]);
    // 시설이 사라지면 게시판에서 빠지고, 받으려 하면 닫는다(gone)
    expect(second.maps.get(boss.map.mapKey)?.removeBuilding(boss.buildingId)).toEqual({ ok: true });
    expect(q.labor.jobs(hand.userId, {}).jobs).toEqual([]);
    expect(await q.labor.acceptJob(hand.userId, 3, unitB)).toEqual({ ok: false, code: "job_not_open" });
    await q.writer.durable();
    expect(await rows(test.db, "select state from labor_postings where id = 3")).toEqual([{ state: "gone" }]);
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("임대형 손 해지(기획 341): 어느 쪽이든 7일 유예, 유예 중에는 손으로 끝내지 않고, 끝나면 넘어간 시각을 적는다", async () => {
    const first = await boot();
    const p = persistence(first);
    const owner = await setup(first, "lessor", { workers: 0, credit: 0n, building: 40 });
    const tenant = await setup(first, "lessee", { workers: 1, credit: 1_000n });
    const unitId = tenant.units[0] ?? 0;
    expect(await p.labor.setRent(owner.userId, owner.buildingId, 10n)).toEqual({ ok: true });
    expect(
      await p.labor.create(tenant.userId, { kind: "lease", buildingId: owner.buildingId, unitId }),
    ).toEqual({ ok: true, contractId: 1 });
    clock += HOUR / 2;
    const stoppedAt = clock;
    // 시설 주인이 해지해도 바로 끝나지 않는다(임차인 물건을 가져가지 못하게, D-161)
    expect(await p.labor.terminate(owner.userId, 1)).toEqual({ ok: true });
    const contract = p.labor.contracts.get(1);
    expect([contract?.state, contract?.endReason, contract?.graceUntilMs]).toEqual([
      "grace",
      "owner",
      stoppedAt + 7 * DAY,
    ]);
    expect(await p.labor.terminate(owner.userId, 1)).toEqual({ ok: false, code: "not_open" });
    expect(await p.labor.terminate(tenant.userId, 1)).toEqual({ ok: false, code: "not_open" });
    const view = p.labor.overview(tenant.userId);
    expect(view.contracts.map((c) => [c.state, c.graceUntil, c.leftoversMovedAt])).toEqual([
      ["grace", stoppedAt + 7 * DAY, null],
    ]);
    // 유예 동안 유닛은 계약에 묶이지 않는다
    expect(view.units.find((u) => u.id === unitId)?.busy).toBe(false);
    expect(p.ledger.balanceOf(owner.ownerId, ASSET_CREDIT)).toBe(10n);

    // 다시 켜도 유예가 이어지고, 유예가 끝나면 남은 물건이 넘어간 시각(= 유예 끝)을 적는다
    await p.writer.durable();
    await first.crashForTest("commit");
    const second = await boot();
    const q = persistence(second);
    expect(q.labor.contracts.get(1)?.state).toBe("grace");
    clock = stoppedAt + 8 * DAY;
    q.settlement.settleOwner(tenant.ownerId, clock);
    await q.writer.durable();
    expect(
      await rows(
        test.db,
        "select state, end_reason, grace_until_ms, leftovers_moved_at_ms from labor_contracts",
      ),
    ).toEqual([
      {
        state: "ended",
        end_reason: "owner",
        grace_until_ms: null,
        leftovers_moved_at_ms: String(stoppedAt + 7 * DAY),
      },
    ]);
    expect(q.labor.overview(tenant.userId).contracts[0]?.leftoversMovedAt).toBe(stoppedAt + 7 * DAY);
    expect(q.ledger.balanceOf(owner.ownerId, ASSET_CREDIT)).toBe(10n);
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("임대형: 시설이 사라지면 유예 없이 끝나고, 유예 중이면 유예만 끝난다(넘어간 물건 없음)", async () => {
    const world = await boot();
    const p = persistence(world);
    const owner = await setup(world, "landowner", { workers: 0, credit: 0n, building: 40 });
    const tenant = await setup(world, "renter", { workers: 2, credit: 1_000n });
    const [unitA = 0, unitB = 0] = tenant.units;
    await p.labor.setRent(owner.userId, owner.buildingId, 5n);
    await p.labor.create(tenant.userId, { kind: "lease", buildingId: owner.buildingId, unitId: unitA });
    await p.labor.create(tenant.userId, { kind: "lease", buildingId: owner.buildingId, unitId: unitB });
    expect(await p.labor.terminate(tenant.userId, 1)).toEqual({ ok: true });
    expect(p.labor.contracts.get(1)?.state).toBe("grace");
    expect(owner.map.removeBuilding(owner.buildingId)).toEqual({ ok: true });
    clock += HOUR;
    p.settlement.settleOwner(tenant.ownerId, clock);
    expect([p.labor.contracts.get(1)?.state, p.labor.contracts.get(1)?.endReason]).toEqual([
      "ended",
      "worker",
    ]);
    expect(p.labor.contracts.get(1)?.leftoversMovedAtMs).toBeNull();
    expect([p.labor.contracts.get(2)?.state, p.labor.contracts.get(2)?.endReason]).toEqual([
      "ended",
      "building_gone",
    ]);
    expect(p.labor.contracts.get(2)?.graceUntilMs).toBeNull();
    expect(await world.checkInvariants()).toEqual([]);
  });
});
