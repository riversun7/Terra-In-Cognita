// 멈춘 노동 계약 [기다림] DB 시험(기획 대조 2237) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// [기다림]은 그 멈춤 회차를 계약 줄에 남기고(같은 계정의 모든 기기에서 처리할 일이 접힘), 다시 돌다 또 멈추면(next_due_ms 바뀜) 다시 보인다.
// 월드 쓰기 대기열 upsert는 그 열을 덮지 않는다. 남의 계약·없는 계약·다른 회차는 막는다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createWorldWriter } from "../world/persist/writer.ts";
import { WORLD_TABLES } from "../world/persist/tables.ts";
import { silentLog } from "../world/testSupport.ts";
import { createLaborPausedInboxProvider } from "./pausedInbox.ts";
import { waitPausedContract } from "./pauseWait.ts";

const T0 = 1_800_000_000_000;
let test: TestDatabase;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  await test.drop();
});

/** 시험 계정 하나 + 그 소유 주체 */
async function account(name: string, ownerId: number): Promise<string> {
  const user = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  const id = user[0]?.id ?? "";
  await test.db.$client.query(`insert into world_owners (id, user_id, settled_at_ms) values ($1, $2, $3)`, [
    ownerId,
    id,
    T0,
  ]);
  return id;
}

/** 쓰기 대기열이 쓰는 계약 줄(열 목록 = WORLD_TABLES.laborContracts) */
function contractRow(id: number, state: "active" | "paused", nextDueMs: number): Record<string, unknown> {
  return {
    id,
    kind: "wage",
    owner_id: 1,
    worker_owner_id: 2,
    unit_id: 500 + id,
    building_id: 900,
    asset: "s3_test_credit",
    rate: "20",
    deposit: "0",
    started_at_ms: T0,
    ends_at_ms: null,
    settled_at_ms: T0,
    next_due_ms: nextDueMs,
    state,
    grace_until_ms: null,
    ended_at_ms: null,
    end_reason: null,
    paid_total: "0",
    leftovers_moved_at_ms: null,
  };
}

describe.skipIf(!TEST_DATABASE_URL)("멈춘 노동 계약 [기다림] (2237)", () => {
  it("기다림은 그 회차를 계정에 남겨 처리할 일에서 빼고, 또 멈추면 다시 보인다. 대기열 upsert는 표시를 덮지 않는다", async () => {
    const pool = test.db.$client;
    await account("boss", 1);
    const worker = await account("worker", 2);
    const stranger = await account("stranger", 3);
    const writer = createWorldWriter({ pool, log: silentLog, onFatal: () => {}, intervalMs: 10 });
    writer.upsert("laborContracts", contractRow(1, "paused", T0 + 1000));
    writer.upsert("laborContracts", contractRow(2, "paused", T0 + 2000));
    await writer.durable();
    const inbox = createLaborPausedInboxProvider(pool);
    const keys = async () =>
      (await inbox.collect({ userId: worker, roles: [] }, T0)).map((entry) => entry.key);
    expect(await keys()).toEqual(["c1", "c2"]);

    // 남의 계약·없는 계약·다른 회차는 막는다
    expect(await waitPausedContract(pool, { userId: stranger, contractId: 1, dueAt: T0 + 1000 })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await waitPausedContract(pool, { userId: worker, contractId: 9, dueAt: T0 })).toEqual({
      ok: false,
      code: "unknown_contract",
    });
    expect(await waitPausedContract(pool, { userId: worker, contractId: 1, dueAt: T0 })).toEqual({
      ok: false,
      code: "not_open",
    });

    // 기다림: 그 계정의 처리할 일에서 빠진다(기기와 상관없이 — 서버가 뺀다)
    expect(await waitPausedContract(pool, { userId: worker, contractId: 1, dueAt: T0 + 1000 })).toEqual({
      ok: true,
    });
    expect(await keys()).toEqual(["c2"]);

    // 대기열이 같은 줄을 다시 써도(정산 등) 표시는 남는다
    expect(WORLD_TABLES.laborContracts.columns).not.toContain("paused_waited_due_ms");
    writer.upsert("laborContracts", contractRow(1, "paused", T0 + 1000));
    await writer.durable();
    expect(await keys()).toEqual(["c2"]);

    // 다시 돌다(active) 또 멈추면(밀린 지급 시각이 바뀜) 다시 보인다
    writer.upsert("laborContracts", contractRow(1, "active", T0 + 3000));
    await writer.durable();
    expect(await waitPausedContract(pool, { userId: worker, contractId: 1, dueAt: T0 + 3000 })).toEqual({
      ok: false,
      code: "not_open",
    });
    writer.upsert("laborContracts", contractRow(1, "paused", T0 + 3000));
    await writer.durable();
    expect(await keys()).toEqual(["c1", "c2"]);
    await writer.drain();
  });
});
