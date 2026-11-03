// 노동 계약 DB 통합 시험(docs/adr/2026-11-03-labor-contracts.md) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로 임금형(보증금·자동 해고·일시 중지·채우기)·임대형(임대료·유예)을 돌리고, 원장 불변 조건(I1·I2·I14)과
// 다시 켠 뒤의 복구를 본다.
import { UPKEEP_PERIOD_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
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
    clock = T0 + 8 * DAY;
    p.settlement.settleOwner(tenant.ownerId, clock);
    expect(contract?.state).toBe("ended");
    expect(await world.checkInvariants()).toEqual([]);
    // 끝난 지 7일이 지난 계약은 화면에서 빠진다(DB에는 남는다)
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
});
