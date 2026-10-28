// 들어가기·비밀번호 찾기·세션 DB 통합 시험 — TEST_DATABASE_URL이 있을 때만(CI는 PostgreSQL 18.6)
// 아이디·비밀번호는 모두 시험용 가짜 값이다.
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  JSON_HEADERS,
  TEST_DATABASE_URL,
  type TestDatabase,
  buildAuthApp,
  createTestDatabase,
  enter,
  freshIp,
  rows,
  sessionCookie,
  trpcQuery,
} from "../testDb.ts";

const PASSWORD = "fake pass phrase 1";

describe.skipIf(!TEST_DATABASE_URL)("들어가기·비밀번호 찾기 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildAuthApp(test.db);
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  const count = async (table: string) =>
    Number((await rows<{ n: string }>(test.db, `select count(*) as n from ${table}`))[0]?.n);

  it("없는 아이디: new_id만 돌려주고 아무 행도 만들지 않는다", async () => {
    const res = await enter(app, { id: "Fake_New1", password: PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "new_id", loginId: "Fake_New1" });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await count("users")).toBe(0);
    expect(await count("audit_log")).toBe(0);
  });

  it("만들기: 계정·비밀번호·세션·복구 이메일·감사 기록, 쿠키, 응답에 토큰·이메일 없음", async () => {
    const ip = freshIp();
    const res = await enter(
      app,
      {
        id: "Fake_Maker1",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
        email: " Fake@Example.Test ",
      },
      ip,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ status: "created", user: { loginId: "Fake_Maker1", roles: ["player"] } });
    expect(Object.keys(body.user).toSorted()).toEqual(["id", "loginId", "roles"]);
    expect(res.body).not.toMatch(/token|@|placeholder/i);
    expect(sessionCookie(res)).toMatch(/^tic\.session_token=/);

    const [user] = await rows<{ id: string; name: string; username: string; email: string; role: string }>(
      test.db,
      "select id, name, username, email, role from users where username = 'fake_maker1'",
    );
    expect(user).toMatchObject({ name: "Fake_Maker1", username: "fake_maker1", role: "player" });
    expect(user?.email).toMatch(/^[0-9a-f-]{36}@id\.placeholder\.invalid$/);
    expect(await rows(test.db, "select provider_id from accounts where user_id = $1", [user?.id])).toEqual([
      { provider_id: "credential" },
    ]);
    expect(
      (await rows(test.db, "select ip_address from sessions where user_id = $1", [user?.id]))[0],
    ).toEqual({
      ip_address: ip,
    });
    expect(await rows(test.db, "select email from account_recovery where user_id = $1", [user?.id])).toEqual([
      { email: "fake@example.test" },
    ]);
    const audit = await rows(
      test.db,
      "select actor_kind, actor_id, action, target_id, after, ip from audit_log",
    );
    expect(audit).toEqual([
      {
        actor_kind: "user",
        actor_id: user?.id,
        action: "account.create",
        target_id: user?.id,
        after: { loginId: "Fake_Maker1", roles: ["player"], recoveryEmail: true },
        ip,
      },
    ]);
  });

  it("로그인: 대소문자가 달라도 같은 계정, 틀린 비밀번호는 401, 만들기로 보내면 409", async () => {
    const ok = await enter(app, { id: "FAKE_maker1", password: PASSWORD });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: "signed_in", user: { loginId: "Fake_Maker1" } });
    expect(sessionCookie(ok)).toBeTruthy();

    const wrong = await enter(app, { id: "fake_maker1", password: "wrong pass phrase" });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: "INVALID_PASSWORD" });

    const taken = await enter(app, {
      id: "fake_maker1",
      password: "another pass 22",
      create: true,
      passwordConfirm: "another pass 22",
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: "ID_TAKEN" });
    expect(await count("users")).toBe(1);
  });

  it("만들기 규칙: 확인 불일치, 짧음, 아이디와 같음, 흔함, 이메일 형식", async () => {
    const create = (password: string, extra: object = {}) =>
      enter(app, { id: "Fake_Rules1", password, create: true, passwordConfirm: password, ...extra });
    expect(
      (
        await enter(app, { id: "Fake_Rules1", password: PASSWORD, create: true, passwordConfirm: "x" })
      ).json(),
    ).toEqual({ error: "PASSWORD_MISMATCH" });
    expect((await create("short7x")).json()).toEqual({ error: "PASSWORD_TOO_SHORT" });
    expect((await create("FAKE_RULES1")).json()).toEqual({ error: "PASSWORD_SAME_AS_ID" });
    expect((await create("password123")).json()).toEqual({ error: "PASSWORD_TOO_COMMON" });
    expect((await create(PASSWORD, { email: "not an email" })).json()).toEqual({ error: "INVALID_EMAIL" });
    expect(await count("users")).toBe(1);
  });

  it("동시에 같은 아이디를 만들면 계정은 하나만 생긴다(같은 비밀번호는 로그인, 다른 비밀번호는 409)", async () => {
    const same = { id: "Fake_Race1", password: PASSWORD, create: true, passwordConfirm: PASSWORD };
    const results = await Promise.all([enter(app, same), enter(app, same), enter(app, same)]);
    expect(results.map((res) => res.statusCode)).toEqual([200, 200, 200]);
    const statuses: string[] = results.map((res) => res.json().status);
    expect(statuses.filter((status) => status === "created")).toHaveLength(1);
    expect(await rows(test.db, "select username from users where username = 'fake_race1'")).toHaveLength(1);

    const other = "different pass 9";
    const mixed = await Promise.all([
      enter(app, { id: "Fake_Race2", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
      enter(app, { id: "Fake_Race2", password: other, create: true, passwordConfirm: other }),
    ]);
    expect(mixed.map((res) => res.statusCode).toSorted((a, b) => a - b)).toEqual([200, 409]);
    expect(await rows(test.db, "select username from users where username = 'fake_race2'")).toHaveLength(1);
    expect(await rows(test.db, "select 1 from audit_log where action = 'account.create'")).toHaveLength(3);
  });

  it("세션 확인은 토큰·이메일 없이 내 정보를 주고, tRPC account.me도 같다", async () => {
    const signIn = await enter(app, { id: "fake_maker1", password: PASSWORD });
    const cookie = sessionCookie(signIn);
    const session = await app.inject({ method: "GET", url: "/api/auth/get-session", headers: { cookie } });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ user: { loginId: "Fake_Maker1", roles: ["player"] } });
    expect(session.body).not.toMatch(/token|@/);

    const me = await trpcQuery(app, "account.me", undefined, cookie);
    expect(me.json()).toEqual({ result: { data: signIn.json().user } });
    expect((await trpcQuery(app, "account.me", undefined)).json()).toEqual({ result: { data: null } });
  });

  it("세션 연장: 하루 넘게 쓴 세션은 get-session이 쿠키를 새로 주고 만료를 늘린다", async () => {
    const cookie = sessionCookie(await enter(app, { id: "fake_maker1", password: PASSWORD }));
    const token = decodeURIComponent(cookie.split("=")[1] ?? "").split(".")[0];
    // 7일짜리 세션을 2일 전에 만든 것처럼(남은 5일)
    await rows(test.db, "update sessions set expires_at = now() + interval '5 days' where token = $1", [
      token,
    ]);
    const res = await app.inject({ method: "GET", url: "/api/auth/get-session", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(sessionCookie(res)).toMatch(/^tic\.session_token=/);
    const [row] = await rows<{ days: number }>(
      test.db,
      "select extract(epoch from expires_at - now()) / 86400 as days from sessions where token = $1",
      [token],
    );
    expect(Number(row?.days)).toBeGreaterThan(6.9);
  });

  it("로그아웃하면 세션이 지워진다", async () => {
    const cookie = sessionCookie(await enter(app, { id: "fake_maker1", password: PASSWORD }));
    const before = await count("sessions");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { ...JSON_HEADERS, cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await count("sessions")).toBe(before - 1);
    expect(
      (await app.inject({ method: "GET", url: "/api/auth/get-session", headers: { cookie } })).json(),
    ).toBeNull();
  });

  it("비밀번호 찾기: 이메일이 맞으면 바꾸고 모든 세션을 끊는다, 틀리면 같은 실패 코드", async () => {
    const reset = (body: object) =>
      app.inject({
        method: "POST",
        url: "/api/account/reset-password",
        headers: JSON_HEADERS,
        payload: JSON.stringify(body),
        remoteAddress: freshIp(),
      });
    const next = "brand new phrase 7";
    const cookie = sessionCookie(await enter(app, { id: "fake_maker1", password: PASSWORD }));
    const [user] = await rows<{ id: string }>(test.db, "select id from users where username = 'fake_maker1'");
    expect(
      Number(
        (
          await rows<{ n: string }>(test.db, "select count(*) as n from sessions where user_id = $1", [
            user?.id,
          ])
        )[0]?.n,
      ),
    ).toBeGreaterThan(0);

    for (const body of [
      { id: "fake_maker1", email: "wrong@example.test" },
      { id: "fake_nobody", email: "fake@example.test" },
      // 복구 이메일이 없는 계정
      { id: "fake_race1", email: "fake@example.test" },
    ]) {
      const res = await reset({ ...body, newPassword: next, newPasswordConfirm: next });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "RESET_FAILED" });
    }

    const ok = await reset({
      id: "Fake_Maker1",
      email: "FAKE@example.test",
      newPassword: next,
      newPasswordConfirm: next,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ status: "password_reset" });
    expect(await rows(test.db, "select 1 from sessions where user_id = $1", [user?.id])).toHaveLength(0);
    expect(
      (await app.inject({ method: "GET", url: "/api/auth/get-session", headers: { cookie } })).json(),
    ).toBeNull();
    expect((await enter(app, { id: "fake_maker1", password: PASSWORD })).statusCode).toBe(401);
    expect((await enter(app, { id: "fake_maker1", password: next })).json()).toMatchObject({
      status: "signed_in",
    });

    const audit = await rows(
      test.db,
      "select actor_kind, action, after from audit_log where action = 'account.password_reset'",
    );
    expect(audit).toEqual([
      {
        actor_kind: "user",
        action: "account.password_reset",
        after: { method: "recovery_email", revokedSessions: expect.any(Number) },
      },
    ]);
  });

  it("비밀번호 찾기는 아이디별 시간당 3회로 제한한다", async () => {
    const body = {
      id: "fake_limit9",
      email: "a@example.test",
      newPassword: "limit phrase 99",
      newPasswordConfirm: "limit phrase 99",
    };
    const send = () =>
      app.inject({
        method: "POST",
        url: "/api/account/reset-password",
        headers: JSON_HEADERS,
        payload: JSON.stringify(body),
        remoteAddress: freshIp(),
      });
    for (let i = 0; i < 3; i += 1) expect((await send()).json()).toEqual({ error: "RESET_FAILED" });
    const blocked = await send();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: "TOO_MANY_REQUESTS" });
  });

  it("정지된 계정은 403 BANNED", async () => {
    await rows(test.db, "update users set banned = true where username = 'fake_race1'");
    const res = await enter(app, { id: "fake_race1", password: PASSWORD });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "BANNED" });
    await rows(test.db, "update users set banned = false where username = 'fake_race1'");
  });

  it("가입 닫기(AUTH_OPEN_SIGNUP=false): 새 아이디는 403 SIGNUP_CLOSED, 있는 계정은 들어간다", async () => {
    const closed = await buildAuthApp(test.db, { openSignup: false });
    try {
      const res = await enter(closed, {
        id: "Fake_Closed1",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "SIGNUP_CLOSED" });
      expect((await enter(closed, { id: "fake_race1", password: PASSWORD })).statusCode).toBe(200);
    } finally {
      await closed.close();
    }
  });

  it("계정 만들기 상한: 주소별로 넘으면 429 SIGNUP_LIMIT", async () => {
    const limited = await buildAuthApp(test.db, { limits: { createPerIp: { capacity: 1, perHour: 1 } } });
    try {
      const ip = freshIp();
      const make = (id: string) =>
        enter(limited, { id, password: PASSWORD, create: true, passwordConfirm: PASSWORD }, ip);
      expect((await make("Fake_Cap1")).json()).toMatchObject({ status: "created" });
      const blocked = await make("Fake_Cap2");
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toEqual({ error: "SIGNUP_LIMIT", retryAfterSec: 3_600 });
      expect(await rows(test.db, "select 1 from users where username = 'fake_cap2'")).toHaveLength(0);
    } finally {
      await limited.close();
    }
  });
});
