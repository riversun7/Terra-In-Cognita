// 월드 저장·복구 DB 통합 시험(S3 ADR 1·2절) — TEST_DATABASE_URL이 있을 때만. 계정 값은 모두 시험용 가짜 값이다.
// kill -9 흉내: 쓰기 대기열을 정해진 자리(커밋 전·진행 중 커밋 되돌림·진행 중 커밋 끝남)에서 버리고 같은 DB로 새 월드를 띄운다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createWorldWriter } from "./persist/writer.ts";
import { silentLog } from "./testSupport.ts";
import { type World, startWorld } from "./world.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let test: TestDatabase;
const worlds: World[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

function boot(testBots: number): World {
  const world = startWorld({
    testBots,
    paths: { kind: "inline" },
    now: () => Date.now(),
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 20,
    onFatal: (error) => {
      throw error;
    },
  });
  worlds.push(world);
  return world;
}

/** DB의 유닛 ID 목록(정렬) */
async function unitIds(): Promise<number[]> {
  const found = await rows<{ id: string }>(test.db, "select id from world_units order by id");
  return found.map((row) => Number(row.id));
}

describe.skipIf(!TEST_DATABASE_URL)("월드 쓰기 대기열", () => {
  it("같은 행은 마지막 것만, 넣고 지우면 지우기만, 추가 행은 차례대로 쓴다", async () => {
    const writer = createWorldWriter({
      pool: test.db.$client,
      log: silentLog,
      onFatal: () => {},
      intervalMs: 10,
    });
    await test.db.$client.query("insert into factions (kind, code) values ('npc', 'fake_faction')");
    writer.upsert("owners", { id: 1, user_id: null, faction_id: 1, settled_at_ms: 1, upkeep_arrears: 0 });
    writer.upsert("owners", { id: 1, user_id: null, faction_id: 1, settled_at_ms: 5, upkeep_arrears: 2 });
    writer.upsert("buildings", {
      id: 7,
      map_key: 9,
      owner_id: 1,
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      rotation: 0,
    });
    writer.remove("buildings", { id: 7 });
    writer.append("transactions", { id: 1, kind: "fake", at_ms: 1, idempotency_key: null });
    writer.upsert("accounts", {
      id: 1,
      owner_id: null,
      system_code: "fake_a",
      asset: "fake_coin",
      balance: -3n,
    });
    writer.upsert("accounts", { id: 2, owner_id: 1, system_code: null, asset: "fake_coin", balance: 3n });
    writer.append("entries", { tx_id: 1, account_id: 1, amount: -3n });
    writer.append("entries", { tx_id: 1, account_id: 2, amount: 3n });
    expect(writer.pendingCount).toBe(7);
    await writer.durable();
    expect(await rows(test.db, "select settled_at_ms, upkeep_arrears from world_owners")).toEqual([
      { settled_at_ms: "5", upkeep_arrears: 2 },
    ]);
    expect(await rows(test.db, "select * from world_buildings")).toEqual([]);
    expect(await rows(test.db, "select amount from ledger_entries order by id")).toEqual([
      { amount: "-3" },
      { amount: "3" },
    ]);
    expect(writer.takeMetrics()).toMatchObject({ dbBatches: 1, dbRows: 7, dbFailures: 0, dbPending: 0 });
  });

  it("커밋이 실패하면 다시 해 보고, 오래 실패하면 onFatal", async () => {
    let fatal: unknown;
    const writer = createWorldWriter({
      pool: test.db.$client,
      log: silentLog,
      onFatal: (error) => {
        fatal = error;
      },
      intervalMs: 5,
      fatalAfterMs: 300,
    });
    // 없는 소유 주체를 가리키는 유닛 → 외래 키 오류로 계속 실패한다
    writer.upsert("units", {
      id: 1,
      owner_id: 999,
      kind: 0,
      size: 1,
      speed: 437,
      map_key: 9,
      path: [0, 0],
      depart_at_ms: 0,
      wake_at_ms: null,
      ai_step: 0,
      job: 0,
      job_phase: 0,
      job_progress_ms: 0,
      fatigue: 0,
    });
    for (let i = 0; i < 40; i++) {
      if (fatal !== undefined) break;
      await sleep(50);
    }
    expect(fatal).toBeDefined();
    expect(writer.takeMetrics().dbFailures).toBeGreaterThan(0);
  });

  it("원장 거래·항목은 고치거나 지울 수 없다(DB 트리거)", async () => {
    await test.db.$client.query("insert into ledger_transactions (id, kind, at_ms) values (1, 'fake', 1)");
    await expect(test.db.$client.query("delete from ledger_transactions")).rejects.toThrow(/append-only/);
    await expect(test.db.$client.query("update ledger_transactions set kind = 'x'")).rejects.toThrow(
      /append-only/,
    );
  });
});

describe.skipIf(!TEST_DATABASE_URL)("월드 부팅 복구(kill -9 흉내)", () => {
  it("봇·건물이 DB에서 돌아오고, 다시 켜도 봇 수는 그대로, 불변 조건 위반 0", async () => {
    const first = boot(12);
    await first.ready;
    const map = [...first.maps.values()][0];
    if (!map) throw new Error("no map");
    expect(map.placeBuilding({ x: 200, y: 200, width: 3, height: 2, rotation: 0 })).toMatchObject({
      ok: true,
    });
    await sleep(300);
    await first.persistence?.writer.durable();
    const before = await unitIds();
    expect(before).toHaveLength(12);
    await first.crashForTest("commit");

    const second = boot(12);
    await second.ready;
    expect(second.status()).toMatchObject({ state: "ready", issues: 0 });
    expect(await unitIds()).toEqual(before);
    expect(await rows(test.db, "select x, y, width, height from world_buildings")).toEqual([
      { x: 200, y: 200, width: 3, height: 2 },
    ]);
    let units = 0;
    for (const m of second.maps.values()) m.forEachUnit(() => (units += 1));
    expect(units).toBe(12);
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("접속 중으로 남은 사용자는 지난 생존 시각에 끊긴 것으로 고친다(I8)", async () => {
    const user = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('Fake_User', 'fake@id.placeholder.invalid', 'fake_user')
       returning id`,
    );
    const userId = user[0]?.id;
    await test.db.$client.query(
      "insert into world_presence (user_id, offline_since_ms, updated_at_ms) values ($1, null, 1)",
      [userId],
    );
    const first = boot(0);
    await first.ready;
    await first.persistence?.writer.durable();
    const alive = await rows<{ alive_at_ms: string }>(test.db, "select alive_at_ms from world_heartbeat");
    // 첫 부팅이 이미 고쳤다(그 전 생존 기록이 없어 그때 시각으로)
    await test.db.$client.query("update world_presence set offline_since_ms = null");
    await first.crashForTest("commit");
    const second = boot(0);
    await second.ready;
    expect(await rows(test.db, "select offline_since_ms from world_presence")).toEqual([
      { offline_since_ms: alive[0]?.alive_at_ms },
    ]);
  });

  it("무작위 자리에서 여러 번 죽였다 켜도 봇 수·불변 조건이 그대로", async () => {
    for (let round = 0; round < 6; round++) {
      const world = boot(10);
      await world.ready;
      expect(world.status().issues).toBe(0);
      await sleep(20 + ((round * 37) % 90));
      await world.crashForTest(round % 2 === 0 ? "rollback" : "commit");
    }
    const last = boot(10);
    await last.ready;
    expect(last.status().issues).toBe(0);
    expect(await unitIds()).toHaveLength(10);
    expect(await last.checkInvariants()).toEqual([]);
  });
});
