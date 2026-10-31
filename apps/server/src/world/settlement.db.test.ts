// 오프라인 정산·원장 DB 통합 시험(S3 ADR 4절) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로 접속 2시간 → 끊김 → 48시간을 돌려, 정산 결과가 packages/sim 해결 함수를 한 번에 부른 값과 같은지,
// 커밋 전에 죽었다 켜도 두 번 내지 않는지, 복귀 요약 생산 칸·확인을 본다.
import {
  JOB_GATHER,
  PHASE_WORK,
  type JobState,
  TEST_JOB_RULES,
  UPKEEP_PERIOD_MS,
  settleJob,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT, ASSET_ORE } from "./settlement.ts";
import { createWorldSummaryBackend } from "./summarySources.ts";
import { silentLog } from "./testSupport.ts";
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
    const units = p.settlement.giveWorkers(userId, [...world.maps.keys()][0] ?? 0, 3, clock);
    expect(units).toHaveLength(3);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;
    p.settlement.grantCredit(ownerId, 10n, clock);

    clock = T0 + 2 * HOUR;
    release();
    expect(p.settlement.offlineSince(userId)).toBe(T0 + 2 * HOUR);
    // 2시간 동안 경계 2번 × 유닛 3개 = 6 → 남은 화폐 4
    expect(p.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(4n);

    clock = T0 + 50 * HOUR;
    p.settlement.settleOwner(ownerId, clock);
    expect(p.ledger.balanceOf(ownerId, ASSET_ORE)).toBe(BigInt(3 * expectedCycles(clock)));
    // 오프라인 24시간이 지난 뒤로는 산출이 늘지 않는다
    expect(expectedCycles(T0 + 26 * HOUR)).toBe(expectedCycles(T0 + 50 * HOUR));
    // 경계 48번 중 1번만 낼 수 있다(남은 4 ≥ 3) → 밀린 47번
    expect(p.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(1n);
    expect(p.owners.get(ownerId)?.upkeepArrears).toBe(47);

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
    p.settlement.giveWorkers(userId, [...first.maps.keys()][0] ?? 0, 2, clock);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;
    p.settlement.grantCredit(ownerId, 100n, clock);
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
    // 경계 30번 × 2 = 60 → 100 − 60 = 40
    expect(q.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(40n);
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
    p.settlement.giveWorkers(userId, [...world.maps.keys()][0] ?? 0, 1, clock);
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
