// 월드 저장·복구 DB 통합 시험(S3 ADR 1·2절) — TEST_DATABASE_URL이 있을 때만. 계정 값은 모두 시험용 가짜 값이다.
// kill -9 흉내: 쓰기 대기열을 정해진 자리(커밋 전·진행 중 커밋 되돌림·진행 중 커밋 끝남)에서 버리고 같은 DB로 새 월드를 띄운다.
import { anchorCenter, arrivalAt, positionAt } from "@terra/sim";
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

/** 줄 시작 칸에서 dx만큼 옆 칸(addUnit 기준 칸) */
const cellOf = (start: { x: number; y: number }, dx: number) => ({ cellX: start.x + dx, cellY: start.y });

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
    // 행성 ID·영역(D-372): 시험 2차맵은 시험 행성, 유닛·건물은 육지
    expect(await rows(test.db, "select distinct planet_id, domain from world_units")).toEqual([
      { planet_id: "s2_test_planet", domain: "land" },
    ]);
    expect(await rows(test.db, "select planet_id, domain from world_buildings")).toEqual([
      { planet_id: "s2_test_planet", domain: "land" },
    ]);
  });

  it("다른 행성의 같은 2차맵 키 유닛은 이 2차맵에 놓지 않고 DB에 그대로 둔다(전체 ID = 행성 + 키)", async () => {
    const first = boot(3);
    await first.ready;
    const map = [...first.maps.values()][0];
    if (!map) throw new Error("no map");
    await first.persistence?.writer.durable();
    const owner = first.persistence?.npcOwnerId ?? 0;
    await first.crashForTest("commit");
    await test.db.$client.query(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, planet_id, domain, path, depart_at_ms)
       values (9999, $1, 2, 1, 437, $2, 'fake_other_planet', 'sea', '{512,512}', 0)`,
      [owner, map.mapKey],
    );
    const second = boot(3);
    await second.ready;
    expect(second.status().issues).toBe(0);
    let found = false;
    for (const m of second.maps.values()) m.forEachUnit((unit) => (found ||= unit.id === 9999));
    expect(found).toBe(false);
    expect(await rows(test.db, "select planet_id, domain from world_units where id = 9999")).toEqual([
      { planet_id: "fake_other_planet", domain: "sea" },
    ]);
  });

  it("걷는 유닛의 구간 걸음 배율(pace)이 DB에서 돌아오고, 길이가 틀린 배율은 버린다(docs/adr/2026-11-14-segment-speed.md 4절)", async () => {
    const first = boot(1);
    await first.ready;
    const map = [...first.maps.values()][0];
    if (!map) throw new Error("no map");
    await first.persistence?.writer.durable();
    const owner = first.persistence?.npcOwnerId ?? 0;
    await first.crashForTest("commit");
    const depart = Date.now() + 600_000;
    // 사람이 아닌 종류(2)라 봇처럼 다시 걷지 않는다. 9998은 배율 길이가 맞고, 9997은 옛 앱이 path만 고친 행처럼 틀렸다
    await test.db.$client.query(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, planet_id, domain, path, pace, depart_at_ms)
       values (9998, $1, 2, 1, 437, $2, 's2_test_planet', 'land', '{512,512,4608,512,4608,8704}', '{1800,1000}', $3),
              (9997, $1, 2, 1, 437, $2, 's2_test_planet', 'land', '{512,512,4608,512}', '{1800,1000}', $3)`,
      [owner, map.mapKey, depart],
    );
    const second = boot(1);
    await second.ready;
    const restored = [...second.maps.values()].find((m) => m.mapKey === map.mapKey);
    expect(restored?.unitInfo(9998)?.motion.paces).toEqual([1800, 1000]);
    expect(restored?.unitInfo(9997)?.motion.paces).toBeUndefined();
    expect(restored?.unitInfo(9997)?.motion.waypoints).toHaveLength(2);
  });

  it("운영자 배율로 걷던 움직임은 다시 켜도 그 속도로 같은 자리·같은 도착 시각, 보통 유닛은 그대로(operatorPace.ts)", async () => {
    const first = boot(0);
    await first.ready;
    const map = [...first.maps.values()][0];
    if (!map) throw new Error("no map");
    const owner = first.persistence?.npcOwnerId ?? 0;
    // 설 수 있는 줄(같은 y에서 x, x + 40)을 찾는다 — 시험 2차맵 지형은 행성 값에서 온다
    let start: { x: number; y: number } | undefined;
    for (let y = 20; y < 200 && !start; y += 7)
      for (let x = 20; x < 150 && !start; x += 5)
        if ([0, 2, 40, 42].every((dx) => map.isStandable(x + dx, y, 1))) start = { x, y };
    if (!start) throw new Error("no standable row");
    // 사람이 아닌 종류(2)라 스스로 다시 걷지 않는다. 9990 = 운영자 배율 10, 9991 = 보통
    expect(map.addUnit({ id: 9990, ownerId: owner, kind: 2, size: 1, speed: 437, ...cellOf(start, 0) })).toBe(
      true,
    );
    expect(map.addUnit({ id: 9991, ownerId: owner, kind: 2, size: 1, speed: 437, ...cellOf(start, 2) })).toBe(
      true,
    );
    const target = anchorCenter(start.x + 40, start.y, 1);
    expect(await map.moveUnit(9990, target, { speedFactor: 10 })).toEqual({ ok: true });
    expect(await map.moveUnit(9991, anchorCenter(start.x + 42, start.y, 1))).toEqual({ ok: true });
    const fast = map.unitInfo(9990)?.motion;
    const slow = map.unitInfo(9991)?.motion;
    if (!fast || !slow) throw new Error("no motion");
    expect(fast.speed).toBe(4370);
    expect(slow.speed).toBe(437);
    await first.persistence?.writer.durable();
    expect(
      await rows(test.db, "select id, speed, motion_speed, motion_depart_at_ms from world_units order by id"),
    ).toEqual([
      { id: "9990", speed: 437, motion_speed: 4370, motion_depart_at_ms: String(fast.departAtMs) },
      { id: "9991", speed: 437, motion_speed: null, motion_depart_at_ms: null },
    ]);
    await first.crashForTest("commit");

    const second = boot(0);
    await second.ready;
    const restored = [...second.maps.values()].find((m) => m.mapKey === map.mapKey);
    const fastAgain = restored?.unitInfo(9990);
    expect(fastAgain?.speed).toBe(437);
    expect(fastAgain?.motion.speed).toBe(4370);
    expect(fastAgain?.motion.waypoints).toEqual(fast.waypoints);
    expect(fastAgain && arrivalAt(fastAgain.motion)).toBe(arrivalAt(fast));
    const probe = fast.departAtMs + 1_234;
    expect(fastAgain && positionAt(fastAgain.motion, probe)).toEqual(positionAt(fast, probe));
    const slowAgain = restored?.unitInfo(9991)?.motion;
    expect(slowAgain?.speed).toBe(437);
    expect(slowAgain?.arrivals).toEqual(slow.arrivals);
    await second.persistence?.writer.durable();
    await second.crashForTest("commit");

    // 직전 판 앱이 움직임만 고쳐 쓴 행(새 칸을 몰라 motion_speed가 남음): 출발 시각 짝이 어긋나 기본 속도로 읽는다
    await test.db.$client.query("update world_units set depart_at_ms = depart_at_ms + 1 where id = 9990");
    const third = boot(0);
    await third.ready;
    const stale = [...third.maps.values()].find((m) => m.mapKey === map.mapKey)?.unitInfo(9990)?.motion;
    expect(stale?.speed).toBe(437);
    expect(stale?.departAtMs).toBe(fast.departAtMs + 1);
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
