// 관리자 기능(tRPC)·감사 기록 보호·관리 명령(CLI) DB 통합 시험 — TEST_DATABASE_URL이 있을 때만
// 아이디·비밀번호는 모두 시험용 가짜 값이다.
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CliIo, executeCommand, parseCliArgs, runCli } from "../cli/commands.ts";
import {
  TEST_DATABASE_URL,
  TEST_SETTINGS,
  type TestDatabase,
  buildAuthApp,
  createTestDatabase,
  enter,
  rows,
  sessionCookie,
  trpcMutation,
  trpcQuery,
} from "../testDb.ts";
import { createAuth, type TerraAuth } from "./auth.ts";

const PASSWORD = "fake pass phrase 1";

function memoryIo(): CliIo & { lines: string[] } {
  const lines: string[] = [];
  return { lines, out: (line) => lines.push(line), err: (line) => lines.push(line) };
}

describe.skipIf(!TEST_DATABASE_URL)("관리자 기능·감사 기록·관리 명령 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let auth: TerraAuth;

  /** 관리 명령으로 계정을 만든다(시험 준비) */
  const cli = async (argv: string[], password?: string) => {
    const io = memoryIo();
    await executeCommand(
      parseCliArgs(argv),
      { TIC_ACTOR: "test:runner", ...(password ? { TIC_PASSWORD: password } : {}) },
      { db: test.db, auth },
      io,
    );
    return io.lines;
  };
  const signIn = async (id: string, password = PASSWORD) => sessionCookie(await enter(app, { id, password }));
  const userId = async (key: string) =>
    (await rows<{ id: string }>(test.db, "select id from users where username = $1", [key]))[0]?.id ?? "";

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildAuthApp(test.db);
    auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("관리 명령 create-user --allow-weak: 7자 비밀번호 계정을 만들고, 그 계정은 들어가기로 로그인된다", async () => {
    const lines = await cli(
      ["create-user", "--id", "Fake_Root1", "--roles", "player,admin", "--allow-weak"],
      "seven77",
    );
    expect(lines.join("\n")).toMatch(/경고: .*PASSWORD_TOO_SHORT/);
    expect(lines.join("\n")).toMatch(/계정을 만들었습니다: Fake_Root1/);
    expect(lines.join("\n")).not.toContain("seven77");
    const res = await enter(app, { id: "fake_root1", password: "seven77" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "signed_in",
      user: { loginId: "Fake_Root1", roles: ["player", "admin"] },
    });

    const [audit] = await rows(
      test.db,
      "select actor_kind, actor_id, action, after, meta from audit_log where action = 'cli.create_user'",
    );
    expect(audit).toEqual({
      actor_kind: "cli",
      actor_id: null,
      action: "cli.create_user",
      after: { loginId: "Fake_Root1", roles: ["player", "admin"], weakPassword: true },
      meta: { actor: "test:runner", command: "create-user" },
    });
  });

  it("관리 명령은 --allow-weak가 없으면 약한 비밀번호를 거절하고, 있는 아이디·비밀번호 인자를 거절한다", async () => {
    const io = memoryIo();
    const env = { DATABASE_URL: "unused", TIC_PASSWORD: "seven77" };
    await expect(
      executeCommand(parseCliArgs(["create-user", "--id", "Fake_Weak1"]), env, { db: test.db, auth }, io),
    ).rejects.toThrow(/--allow-weak/);
    await expect(
      executeCommand(
        parseCliArgs(["create-user", "--id", "fake_root1"]),
        { TIC_PASSWORD: PASSWORD },
        { db: test.db, auth },
        io,
      ),
    ).rejects.toThrow(/이미 있는 아이디/);
    expect(() => parseCliArgs(["create-user", "--id", "x", "--password", "nope1234"])).toThrow(
      /TIC_PASSWORD/,
    );
    expect(() => parseCliArgs(["set-roles", "--id", "x", "--roles", "player,root"])).toThrow(/역할/);
    expect(await rows(test.db, "select 1 from users where username = 'fake_weak1'")).toHaveLength(0);
  });

  it("runCli: 종료 코드와 출력(비밀번호 없음), DATABASE_URL로 접속", async () => {
    const io = memoryIo();
    const url = new URL(String(TEST_DATABASE_URL));
    url.pathname = `/${(await rows<{ db: string }>(test.db, "select current_database() as db"))[0]?.db}`;
    const env = { DATABASE_URL: url.toString(), TIC_PASSWORD: PASSWORD, TIC_ACTOR: "test:runCli" };
    expect(await runCli(["create-user", "--id", "Fake_Player1"], env, io)).toBe(0);
    expect(await runCli(["create-user", "--id", "Fake_Player1"], env, io)).toBe(3);
    expect(await runCli(["set-roles", "--id", "fake_nobody1", "--roles", "player"], env, io)).toBe(3);
    expect(await runCli(["create-user"], env, io)).toBe(2);
    expect(await runCli(["set-roles", "--id", "fake_root1", "--roles", "player"], env, io)).toBe(3);
    expect(io.lines.join("\n")).toMatch(/마지막 admin/);
    expect(io.lines.join("\n")).not.toContain(PASSWORD);
  });

  it("admin.users.list: 로그인 안 하면 401, player는 403, admin은 아이디로 찾고 쪽을 나눈다(이메일 없음)", async () => {
    expect((await trpcQuery(app, "admin.users.list", {})).json()).toMatchObject({
      error: { data: { code: "UNAUTHORIZED" } },
    });
    const player = await signIn("fake_player1");
    const denied = await trpcQuery(app, "admin.users.list", {}, player);
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: { data: { code: "FORBIDDEN" } } });

    const admin = await signIn("fake_root1", "seven77");
    const all = await trpcQuery(app, "admin.users.list", { search: "" }, admin);
    expect(all.statusCode).toBe(200);
    const data = all.json().result.data;
    expect(data.total).toBe(2);
    expect(data.users.map((user: { loginId: string }) => user.loginId)).toEqual([
      "Fake_Player1",
      "Fake_Root1",
    ]);
    expect(all.body).not.toMatch(/@|placeholder|token/);

    const found = await trpcQuery(app, "admin.users.list", { search: "PLAY" }, admin);
    expect(found.json().result.data).toMatchObject({
      total: 1,
      users: [{ loginId: "Fake_Player1", roles: ["player"] }],
    });
    const paged = await trpcQuery(app, "admin.users.list", { limit: 1, offset: 1 }, admin);
    expect(paged.json().result.data).toMatchObject({ total: 2, users: [{ loginId: "Fake_Root1" }] });
    // 아이디에 없는 글자로 찾으면 빈 목록
    expect((await trpcQuery(app, "admin.users.list", { search: "a%" }, admin)).json().result.data).toEqual({
      users: [],
      total: 0,
    });
  });

  it("admin.users.setRoles: admin은 바꾸고 감사 기록을 남긴다, player는 403, 쉼표 문자열은 400", async () => {
    const admin = await signIn("fake_root1", "seven77");
    const target = await userId("fake_player1");
    const changed = await trpcMutation(
      app,
      "admin.users.setRoles",
      { userId: target, roles: ["gm", "player", "gm"] },
      admin,
    );
    expect(changed.statusCode).toBe(200);
    expect(changed.json().result.data).toMatchObject({
      id: target,
      loginId: "Fake_Player1",
      roles: ["player", "gm"],
    });
    expect((await rows(test.db, "select role from users where id = $1", [target]))[0]).toEqual({
      role: "player,gm",
    });
    const [audit] = await rows(
      test.db,
      "select actor_kind, actor_id, before, after from audit_log where action = 'account.set_roles'",
    );
    expect(audit).toEqual({
      actor_kind: "admin",
      actor_id: await userId("fake_root1"),
      before: { roles: ["player"] },
      after: { roles: ["player", "gm"] },
    });

    const player = await signIn("fake_player1");
    const denied = await trpcMutation(
      app,
      "admin.users.setRoles",
      { userId: target, roles: ["admin"] },
      player,
    );
    expect(denied.statusCode).toBe(403);
    expect((await rows(test.db, "select role from users where id = $1", [target]))[0]).toEqual({
      role: "player,gm",
    });

    for (const roles of ["player,admin", ["player,admin"], [], ["root"]]) {
      const bad = await trpcMutation(app, "admin.users.setRoles", { userId: target, roles }, admin);
      expect(bad.statusCode, JSON.stringify(roles)).toBe(400);
    }
    const missing = await trpcMutation(
      app,
      "admin.users.setRoles",
      { userId: "00000000-0000-4000-8000-000000000000", roles: ["player"] },
      admin,
    );
    expect(missing.json()).toMatchObject({ error: { data: { code: "NOT_FOUND" } } });
  });

  it("마지막 admin의 admin 역할은 뺄 수 없다. 둘이 동시에 서로를 내려도 한 명은 남는다", async () => {
    const admin = await signIn("fake_root1", "seven77");
    const root = await userId("fake_root1");
    const last = await trpcMutation(app, "admin.users.setRoles", { userId: root, roles: ["player"] }, admin);
    expect(last.statusCode).toBe(412);
    expect(last.json()).toMatchObject({
      error: { message: "LAST_ADMIN", data: { code: "PRECONDITION_FAILED" } },
    });

    await cli(["set-roles", "--id", "fake_player1", "--roles", "player,admin"]);
    const second = await signIn("fake_player1");
    const player = await userId("fake_player1");
    const results = await Promise.all([
      trpcMutation(app, "admin.users.setRoles", { userId: player, roles: ["player"] }, admin),
      trpcMutation(app, "admin.users.setRoles", { userId: root, roles: ["player"] }, second),
    ]);
    expect(results.map((res) => res.statusCode).toSorted((a, b) => a - b)).toEqual([200, 412]);
    const admins = await rows(test.db, "select username from users where role ~ '(^|,)admin(,|$)'");
    expect(admins).toHaveLength(1);
  });

  it("관리 명령 set-password: 비밀번호를 바꾸고 세션을 끊고 감사 기록을 남긴다", async () => {
    const cookie = await signIn("fake_player1");
    const lines = await cli(["set-password", "--id", "fake_player1"], "replaced phrase 3");
    expect(lines.join("\n")).toMatch(/비밀번호를 바꿨습니다: Fake_Player1 \(끊은 세션 \d+개\)/);
    expect(
      (await app.inject({ method: "GET", url: "/api/auth/get-session", headers: { cookie } })).json(),
    ).toBeNull();
    expect((await enter(app, { id: "fake_player1", password: "replaced phrase 3" })).statusCode).toBe(200);
    const [audit] = await rows(
      test.db,
      "select actor_kind, after->>'weakPassword' as weak from audit_log where action = 'cli.set_password'",
    );
    expect(audit).toEqual({ actor_kind: "cli", weak: "false" });
  });

  it("감사 기록은 고치거나 지울 수 없다(UPDATE·DELETE·TRUNCATE 거절)", async () => {
    const before = await rows(test.db, "select count(*)::int as n from audit_log");
    for (const statement of [
      "update audit_log set action = 'tampered'",
      "delete from audit_log",
      "truncate audit_log",
      // 지울 행이 없어도 거절한다(문장 단위 트리거)
      "delete from audit_log where id < 0",
    ]) {
      await expect(test.db.$client.query(statement), statement).rejects.toThrow(/append-only/);
    }
    expect(await rows(test.db, "select count(*)::int as n from audit_log")).toEqual(before);
    expect(await rows(test.db, "select 1 from audit_log where action = 'tampered'")).toHaveLength(0);
  });
});
