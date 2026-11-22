// 오프라인 정산·원장 DB 통합 시험(S3 ADR 4절) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로 접속 2시간 → 끊김 → 48시간을 돌려, 정산 결과가 packages/sim 해결 함수를 한 번에 부른 값과 같은지,
// 커밋 전에 죽었다 켜도 두 번 내지 않는지, 복귀 요약 생산 칸·확인을 본다.
// 일하는 유닛 = 내 휴먼을 내 건물(채집 시설이 아닌 일반 건물 — 일한 구간 산출은 시험 광석)에 임금형 노동 계약으로 둔 것. 예전에는 개발 시험
// 일꾼(계약 없이 시험 광석을 냈다)을 썼다 — 사용자 지적 2026-11-09 "시험일꾼 다 없애라고"로 없앴다.
import {
  JOB_GATHER,
  PHASE_WORK,
  type JobState,
  TEST_JOB_RULES,
  UPKEEP_PERIOD_MS,
  laborEscrowCode,
  settleJob,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT, ASSET_ORE } from "./settlement.ts";
import { createWorldSummaryBackend } from "./summarySources.ts";
import { addTestUnits, silentLog } from "./testSupport.ts";
import { UNIT_KIND_TEST } from "./unitKinds.ts";
import { type World, startWorld } from "./world.ts";

const HOUR = 3_600_000;
/** 정시 + 1ms에서 시작(유지비 경계를 셀 수 있게) */
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

async function fakeUser(): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ('Fake_Worker', 'fake-worker@id.placeholder.invalid', 'fake_worker')
     returning id`,
  );
  return String(found[0]?.id);
}

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

/** 계약 하나의 보증금(임금 20 × 30일, 첫 임금은 바로 — 일꾼 지갑 = 나라서 돌아온다) */
const DEPOSIT = 600n;
const WAGE = 20n;

/**
 * 내 휴먼 count개를 세우고 내 건물 하나에 임금형 계약으로 둔다. 맺은 뒤 지갑에 spare(유지비 몫, 마지막 계약의 첫 임금이 돌아오므로
 * 임금 20 이상)가 남게 시험 화폐를 준다. 계약 ID들
 */
async function hireSelf(world: World, userId: string, count: number, spare: bigint): Promise<number[]> {
  const p = persistence(world);
  const map = [...world.maps.values()][0];
  if (!map) throw new Error("no map");
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  // 재산이 없는 유닛(D-127 — 노동 보상은 소유자가 받는다): 임금이 내 지갑으로 돌아오는 셈을 본다(휴먼이면 유닛 지갑, D-564 1631)
  const units = addTestUnits(world, userId, map.mapKey, count, clock, { kind: UNIT_KIND_TEST });
  expect(units).toHaveLength(count);
  // 유닛(96~110, 96) 바로 곁 건물 — 일터로 걸어가지 않고 바로 일한다(labor/walkToWork.ts, D-591: 먼 유닛은 걸어가는 동안 일하지 않는다)
  const placed = map.placeBuilding({ x: 96, y: 92, width: 16, height: 2, rotation: 0 }, ownerId);
  if (!placed.ok || placed.buildingId === undefined) throw new Error("no building");
  // 보증금은 사업장 금고에서 나간다(D-555 1504) → 미리 금고에 넣는다. 첫 임금은 내 지갑으로 돌아오니 그만큼 다시 금고에 넣어 지갑 = spare
  if (spare < WAGE) throw new Error("spare < wage");
  p.settlement.grantCredit(ownerId, BigInt(count) * DEPOSIT + spare, clock);
  expect(
    p.facilities.business.invest(placed.buildingId, ownerId, ASSET_CREDIT, BigInt(count) * DEPOSIT, clock),
  ).toBe(true);
  const contracts: number[] = [];
  for (const unitId of units) {
    const made = await p.labor.create(userId, { kind: "wage", buildingId: placed.buildingId, unitId });
    if (!made.ok || made.contractId === undefined) throw new Error(`no contract: ${JSON.stringify(made)}`);
    contracts.push(made.contractId);
  }
  expect(
    p.facilities.business.invest(placed.buildingId, ownerId, ASSET_CREDIT, BigInt(count) * WAGE, clock),
  ).toBe(true);
  expect(p.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(spare);
  return contracts;
}

/** 해결 함수를 한 번에 부른 기댓값: 접속 [T0, T0+2h], 끊김 T0+2h부터 */
function expectedCycles(endMs: number): number {
  const start: JobState = { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 };
  const online = settleJob(start, T0, T0 + 2 * HOUR, null, TEST_JOB_RULES);
  const offline = settleJob(online.state, T0 + 2 * HOUR, endMs, T0 + 2 * HOUR, TEST_JOB_RULES);
  return online.cycles + offline.cycles;
}

describe.skipIf(!TEST_DATABASE_URL)("오프라인 정산", () => {
  it("접속 2시간 → 끊김 48시간: 산출은 해결 함수와 같고, 24시간 뒤에는 늘지 않으며, 유지비는 계속 나간다", async () => {
    const world = await boot();
    const p = persistence(world);
    const userId = await fakeUser();
    const release = p.settlement.connect(userId, () => clock);
    const contracts = await hireSelf(world, userId, 3, 25n);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;

    clock = T0 + 2 * HOUR;
    release();
    expect(p.settlement.offlineSince(userId)).toBe(T0 + 2 * HOUR);
    // 2시간 동안 경계 2번 × 유닛 3개 = 6 → 남은 화폐 19
    expect(p.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(19n);

    clock = T0 + 50 * HOUR;
    p.settlement.settleOwner(ownerId, clock);
    expect(p.ledger.balanceOf(ownerId, ASSET_ORE)).toBe(BigInt(3 * expectedCycles(clock)));
    // 오프라인 24시간이 지난 뒤로는 산출이 늘지 않는다
    expect(expectedCycles(T0 + 26 * HOUR)).toBe(expectedCycles(T0 + 50 * HOUR));
    // 임금(20 × 3)은 24·48시간에 일꾼 지갑(= 나)으로 들어온다. 정산은 노동 계약(임금)을 먼저 한 뒤 유지비를 낸다
    // → 19 + 120 = 139: 경계 48번 중 46번 냄(138), 밀린 2번, 남은 1
    for (const id of contracts)
      expect(p.labor.contracts.get(id)).toMatchObject({ state: "active", paidTotal: 3n * WAGE });
    expect(p.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(1n);
    expect(p.owners.get(ownerId)?.upkeepArrears).toBe(2);

    expect(await world.checkInvariants()).toEqual([]);
    const ore = await rows<{ balance: string }>(
      test.db,
      "select balance from ledger_accounts where asset = $1 and owner_id = $2",
      [ASSET_ORE, ownerId],
    );
    expect(ore).toEqual([{ balance: String(3 * expectedCycles(clock)) }]);
  });

  it("정산을 커밋하기 전에 죽었다 켜면 같은 입력으로 다시 계산해 같은 결과(두 번 내지 않음)", async () => {
    const first = await boot();
    const p = persistence(first);
    const userId = await fakeUser();
    const release = p.settlement.connect(userId, () => clock);
    await hireSelf(first, userId, 2, 100n);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;
    clock = T0 + 2 * HOUR;
    release();
    await p.writer.durable();

    clock = T0 + 30 * HOUR;
    p.settlement.settleOwner(ownerId, clock);
    // 이 정산은 커밋되지 않는다
    await first.crashForTest("rollback");

    const second = await boot();
    const q = persistence(second);
    q.settlement.settleOwner(ownerId, clock);
    q.settlement.settleOwner(ownerId, clock);
    await q.writer.durable();
    expect(q.ledger.balanceOf(ownerId, ASSET_ORE)).toBe(BigInt(2 * expectedCycles(clock)));
    // 임금 24시간에 20 × 2가 들어오고(계약 2개 — 에스크로 = 보증금 − 낸 임금) 경계 30번 × 2 = 60 → 100 + 40 − 60 = 80
    expect(q.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(80n);
    for (const id of [1, 2])
      expect(q.ledger.balance(q.ledger.systemAccount(laborEscrowCode(id), ASSET_CREDIT))).toBe(
        DEPOSIT - 2n * WAGE,
      );
    expect(await second.checkInvariants()).toEqual([]);
    const upkeepTx = await rows<{ n: string }>(
      test.db,
      "select count(*) as n from ledger_transactions where kind = 'upkeep'",
    );
    expect(upkeepTx).toEqual([{ n: "30" }]);
  });

  it("복귀 요약: 마지막 확인 뒤 생산을 세고, 확인하면 그 뒤만 센다", async () => {
    const world = await boot();
    const p = persistence(world);
    const userId = await fakeUser();
    const backend = createWorldSummaryBackend(world);
    const account = { userId, roles: ["player" as const] };
    const release = p.settlement.connect(userId, () => clock);
    await hireSelf(world, userId, 1, 20n);
    clock = T0 + 10 * 60_000;
    release();
    const source = backend.sources[0];
    if (!source) throw new Error("no source");
    expect(await backend.lastAck(userId)).toBeNull();
    expect((await source.collect(account, null, clock)).count).toBe(10);
    await backend.ack(userId, clock, clock);
    expect(await backend.lastAck(userId)).toBe(clock);
    // 끊긴 뒤에도 24시간까지는 일한다 → 5분 뒤 5개 더
    clock += 5 * 60_000;
    expect((await source.collect(account, await backend.lastAck(userId), clock)).count).toBe(5);
    // 확인 시각은 앞으로만 간다
    await backend.ack(userId, T0, clock);
    expect(await backend.lastAck(userId)).toBe(T0 + 10 * 60_000);
  });
});
