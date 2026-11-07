// 세계 새로 시작(reset-world) DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 아이디·비밀번호는 시험용 가짜 값이다.
// 새 DB에 계정·개발 도구 자료와 세계(NPC 국가·봇·원장)를 만든 뒤 관리 명령으로 비우고, 계정·감사 기록은 남고 세계 표는 비며,
// 다시 켜면 세계를 새로 만드는지 본다(docs/adr/2026-11-08-world-reset.md).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../auth/auth.ts";
import { type Database, closeDatabase, createDatabase } from "../db/client.ts";
import { TEST_DATABASE_URL, TEST_SETTINGS, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { executeCommand, parseCliArgs, runCli } from "./commands.ts";
import { RESET_CONFIRM, WORLD_RESET_KEEP } from "./resetWorld.ts";

const PASSWORD = "fake pass phrase 1";
const ACTOR = "test:reset-runner";

async function bootWorld(db: Database): Promise<World> {
  const world = startWorld({
    testBots: 6,
    paths: { kind: "inline" },
    now: () => 1_800_000_000_000,
    log: silentLog,
    pool: db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 3, manual: true },
  });
  await world.ready;
  await world.persistence?.writer.durable();
  return world;
}

async function count(db: Database, table: string): Promise<number> {
  return Number((await rows<{ n: string }>(db, `select count(*)::text as n from "${table}"`))[0]?.n ?? 0);
}

async function cli(argv: string[], env: NodeJS.ProcessEnv) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, env, { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

describe.skipIf(!TEST_DATABASE_URL)("reset-world (DB)", () => {
  let test: TestDatabase;
  let after: Database | undefined;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    test = await createTestDatabase();
    env = { DATABASE_URL: test.url, TIC_ACTOR: ACTOR };
    // 계정(감사 기록 cli.create_user가 함께 남는다)·계정 설정·개발 도구 자료(설정 칸 판)
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_Reset1", "--roles", "player,admin"]),
      { TIC_ACTOR: ACTOR, TIC_PASSWORD: PASSWORD },
      { db: test.db, auth: createAuth({ db: test.db, settings: TEST_SETTINGS }) },
      { out: () => {}, err: () => {} },
    );
    await test.db.$client.query(
      `insert into user_settings (user_id, theme) select id, 'pastel' from users where username = 'fake_reset1'`,
    );
    await test.db.$client.query(`insert into tuning_revision (id, revision) values (1, 7)`);
    // 세계: NPC 국가 셋·시작 도시·봇·원장
    const world = await bootWorld(test.db);
    await world.stop();
  });

  afterAll(async () => {
    if (after) await closeDatabase(after);
    await test?.drop();
  });

  it("세계가 만들어져 있다(시험 준비)", async () => {
    expect(await count(test.db, "factions")).toBeGreaterThanOrEqual(3);
    expect(await count(test.db, "world_units")).toBeGreaterThan(0);
    expect(await count(test.db, "ledger_entries")).toBeGreaterThan(0);
  });

  it("확인 글이 없거나 틀리면 종료 코드 2, 아무것도 지우지 않는다", async () => {
    expect((await cli(["reset-world"], env)).code).toBe(2);
    expect((await cli(["reset-world", "--confirm", "yes"], env)).code).toBe(2);
    expect(await count(test.db, "factions")).toBeGreaterThanOrEqual(3);
  });

  it("미리 보기는 표·행 수만 보이고 바꾸지 않는다(다른 연결이 있어도)", async () => {
    const before = await count(test.db, "world_units");
    const result = await cli(["reset-world", "--dry-run"], env);
    expect(result.code).toBe(0);
    expect(result.out[0]).toMatch(/^미리 보기/);
    expect(result.out).toContain(`  - world_units ${before}`);
    expect(await count(test.db, "world_units")).toBe(before);
    expect(result.out.join("\n")).not.toContain(test.url);
  });

  it("같은 DB에 다른 연결이 있으면(앱이 떠 있으면) 종료 코드 3으로 거절한다", async () => {
    const held = await test.db.$client.connect();
    try {
      const result = await cli(["reset-world", "--confirm", RESET_CONFIRM, "--wait", "0"], env);
      expect(result.code).toBe(3);
      expect(result.err.join("\n")).toMatch(/다른 연결/);
    } finally {
      held.release();
    }
    expect(await count(test.db, "factions")).toBeGreaterThanOrEqual(3);
  });

  it("다른 연결이 없으면 세계 표를 모두 비우고 계정·감사 기록·개발 도구 자료는 남긴다", async () => {
    const factionsBefore = await count(test.db, "factions");
    // 앱이 멈춘 상태를 흉내: 시험 연결을 닫는다. 닫은 연결이 서버의 연결 목록(pg_stat_activity)에서 빠지는 데 잠깐 걸리므로
    // 운영 워크플로처럼 기다린다(--wait 0이면 그 틈에 "다른 연결 있음"으로 거절된다 — CI PostgreSQL 18에서 봄)
    await closeDatabase(test.db);
    const result = await cli(["reset-world", "--confirm", RESET_CONFIRM, "--wait", "10"], env);
    expect(result.code, result.err.join("\n")).toBe(0);
    expect(result.out[0]).toMatch(/^세계를 비웠습니다/);

    after = createDatabase(test.url, () => {});
    const db = after;
    expect(await count(db, "users")).toBe(1);
    expect(await count(db, "accounts")).toBe(1);
    expect(await count(db, "user_settings")).toBe(1);
    expect((await rows<{ revision: string }>(db, "select revision from tuning_revision"))[0]?.revision).toBe(
      "7",
    );
    // 남길 표 밖의 public 표는 모두 비었다(나중에 생긴 표도 같은 규칙)
    const tables = await rows<{ name: string }>(
      db,
      `select relname as name from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')`,
    );
    const nonEmpty: string[] = [];
    for (const { name } of tables) {
      if (!Object.hasOwn(WORLD_RESET_KEEP, name) && (await count(db, name)) > 0) nonEmpty.push(name);
    }
    expect(nonEmpty).toEqual([]);
    // 감사 기록: 계정 만들기 + 세계 새로 시작(실행자·지운 행 수)
    const audit = await rows<{ action: string; actor_kind: string; before: unknown; meta: unknown }>(
      db,
      "select action, actor_kind, before, meta from audit_log order by id",
    );
    expect(audit.map((a) => a.action)).toEqual(["cli.create_user", "world.reset"]);
    expect(audit[1]?.actor_kind).toBe("cli");
    expect(audit[1]?.meta).toEqual({ actor: ACTOR, command: "reset-world" });
    expect(audit[1]?.before).toMatchObject({ rows: { factions: factionsBefore } });
    // 원장 추가만 트리거는 다시 켜져 있다
    const triggers = await rows<{ tgname: string; tgenabled: string }>(
      db,
      "select tgname, tgenabled from pg_trigger where not tgisinternal order by tgname",
    );
    expect(triggers.length).toBeGreaterThanOrEqual(3);
    expect(triggers.every((t) => t.tgenabled === "O")).toBe(true);
    await expect(db.$client.query("delete from ledger_entries")).rejects.toThrow(/append-only/);
  });

  it("다시 켜면 빈 세계에서 NPC 국가·도시를 새로 만들고 불변 조건을 지킨다", async () => {
    if (!after) throw new Error("reset did not run");
    const db = after;
    const world = await bootWorld(db);
    try {
      const nations = await rows<{ id: string; code: string }>(
        db,
        "select id, code from factions where kind = 'npc' and fixed order by id",
      );
      expect(nations).toHaveLength(3);
      // RESTART IDENTITY: 세력 번호가 1부터 다시
      expect(nations[0]?.id).toBe("1");
      expect(await count(db, "world_cities")).toBeGreaterThanOrEqual(3);
      expect(await count(db, "world_units")).toBeGreaterThan(0);
      expect(await world.checkInvariants()).toEqual([]);
    } finally {
      await world.stop();
    }
    expect(await count(db, "users")).toBe(1);
  });
});
