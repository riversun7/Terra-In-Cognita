// 인증 HTTP 경로 시험(DB 없이) — 허용 목록 밖은 404, 출처·JSON 검사, 시도 제한, 응답에서 토큰·이메일 빼기, 표 정의 확인
// DB 주소는 아무도 듣지 않는 포트라서 DB까지 가는 요청은 이 파일에서 보내지 않는다. DB 시험은 *.db.test.ts
import { ACCOUNT_API_PATHS, AUTH_SESSION_PATHS } from "@terra/shared";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth/minimal";
import { pgTable, uuid } from "drizzle-orm/pg-core";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { type AppAuthOptions, buildApp } from "../app.ts";
import { closeDatabase, createDatabase, type Database } from "../db/client.ts";
import { authSchema } from "../db/schema.ts";
import { createAuth, verifyAuth } from "./auth.ts";
import { toSessionResponse } from "./bridge.ts";
import { authHeaders } from "./http.ts";

const ORIGIN = "http://game.example.test:5173";
const SETTINGS = { secret: "a".repeat(64), baseUrl: ORIGIN };
const JSON_HEADERS = { origin: ORIGIN, "content-type": "application/json" };

let app: FastifyInstance | undefined;
let db: Database | undefined;

afterEach(async () => {
  await app?.close();
  if (db) await closeDatabase(db);
  app = undefined;
  db = undefined;
});

async function makeApp(options: { now?: () => number; auth?: Partial<AppAuthOptions> } = {}) {
  db = createDatabase("postgres://terra@127.0.0.1:1/none", () => {});
  app = await buildApp({
    contentVersion: "test",
    logger: false,
    metricsIntervalMs: 0,
    db,
    ...(options.now ? { now: options.now } : {}),
    auth: { settings: SETTINGS, openSignup: true, ...options.auth },
  });
  return app;
}

describe("Better Auth 표 정의 확인", () => {
  it("우리 Drizzle 표 정의(src/db/schema.ts)가 Better Auth 기대값과 맞는다", async () => {
    const database = createDatabase("postgres://terra@127.0.0.1:1/none", () => {});
    try {
      await expect(verifyAuth(createAuth({ db: database, settings: SETTINGS }))).resolves.toBeUndefined();
    } finally {
      await closeDatabase(database);
    }
  });

  it("대조군: 열이 빠진 표 정의는 확인에서 실패한다", async () => {
    const database = createDatabase("postgres://terra@127.0.0.1:1/none", () => {});
    try {
      const broken = { ...authSchema, users: pgTable("users", { id: uuid("id").primaryKey() }) };
      const auth = betterAuth({
        baseURL: ORIGIN,
        secret: SETTINGS.secret,
        database: drizzleAdapter(database, { provider: "pg", schema: broken, usePlural: true }),
        emailAndPassword: { enabled: true },
        advanced: { database: { generateId: "uuid" } },
        logger: { disabled: true },
        telemetry: { enabled: false },
      });
      const context = await auth.$context;
      await expect(context.explicitSchemaCheck?.()).rejects.toThrow(/Missing columns[\s\S]*users\.name/);
    } finally {
      await closeDatabase(database);
    }
  });

  it("인증을 켜려면 DB가 있어야 한다", async () => {
    await expect(
      buildApp({
        contentVersion: "test",
        logger: false,
        metricsIntervalMs: 0,
        auth: { settings: SETTINGS, openSignup: true },
      }),
    ).rejects.toThrow(/database/);
  });
});

describe("/api/auth/* 허용 목록", () => {
  const closed: Array<["GET" | "POST" | "HEAD" | "PUT" | "DELETE", string]> = [
    ["GET", "/api/auth/ok"],
    ["POST", "/api/auth/sign-in/username"],
    ["POST", "/api/auth/sign-in/email"],
    ["POST", "/api/auth/sign-up/email"],
    ["POST", "/api/auth/is-username-available"],
    ["POST", "/api/auth/request-password-reset"],
    ["POST", "/api/auth/reset-password"],
    ["POST", "/api/auth/change-password"],
    ["POST", "/api/auth/update-user"],
    ["POST", "/api/auth/change-email"],
    ["POST", "/api/auth/delete-user"],
    ["GET", "/api/auth/list-sessions"],
    ["POST", "/api/auth/revoke-sessions"],
    ["POST", "/api/auth/admin/set-role"],
    ["POST", "/api/auth/admin/create-user"],
    ["GET", "/api/auth/admin/list-users"],
    ["POST", "/api/auth/admin/impersonate-user"],
    ["POST", "/api/auth/admin/set-user-password"],
    ["POST", "/api/auth/get-session"],
    ["HEAD", "/api/auth/get-session"],
    ["GET", "/api/auth/sign-out"],
    ["DELETE", "/api/auth/sign-out"],
    ["GET", "/api/auth/get-session/extra"],
  ];

  it("허용 목록 밖은 모두 404", async () => {
    const server = await makeApp();
    for (const [method, url] of closed) {
      const res =
        method === "POST"
          ? await server.inject({ method, url, headers: JSON_HEADERS, payload: "{}" })
          : await server.inject({ method, url, headers: { origin: ORIGIN } });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it("세션 확인: 쿠키가 없으면 200 null, 캐시하지 않는다", async () => {
    const server = await makeApp();
    const res = await server.inject({ method: "GET", url: AUTH_SESSION_PATHS.getSession });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("로그아웃: 빈 JSON 본문도 Better Auth까지 가고(Fastify 400 아님), 쿠키 지우기 머리글이 각각 온다", async () => {
    const server = await makeApp();
    const empty = await server.inject({
      method: "POST",
      url: AUTH_SESSION_PATHS.signOut,
      headers: JSON_HEADERS,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ success: true });
    const cookies = [empty.headers["set-cookie"]].flat();
    expect(cookies.length).toBeGreaterThanOrEqual(2);
    expect(cookies.some((cookie) => cookie?.startsWith("tic.session_token=;"))).toBe(true);
  });

  it("로그아웃도 같은 출처만", async () => {
    const server = await makeApp();
    const res = await server.inject({ method: "POST", url: AUTH_SESSION_PATHS.signOut, payload: "{}" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "FORBIDDEN_ORIGIN" });
  });

  it("세션 응답에서 토큰·이메일을 빼고 아이디·역할·만료만 준다", () => {
    const body = {
      session: {
        token: "secret-token",
        expiresAt: "2026-11-04T00:00:00.000Z",
        userId: "u1",
        ipAddress: "1.2.3.4",
      },
      user: {
        id: "u1",
        name: "Tester",
        email: "x@id.placeholder.invalid",
        role: "player,admin",
        banned: false,
      },
    };
    const result = toSessionResponse(body);
    expect(result).toEqual({
      user: { id: "u1", loginId: "Tester", roles: ["player", "admin"] },
      expiresAt: "2026-11-04T00:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toMatch(/secret-token|placeholder|1\.2\.3\.4/);
    expect(toSessionResponse({ ...body, user: { ...body.user, banned: true } })).toBeNull();
    expect(toSessionResponse(null)).toBeNull();
  });
});

function enter(
  server: FastifyInstance,
  headers: Record<string, string>,
  payload: string,
  remoteAddress?: string,
) {
  return server.inject({
    method: "POST",
    url: ACCOUNT_API_PATHS.enter,
    headers,
    payload,
    ...(remoteAddress ? { remoteAddress } : {}),
  });
}

describe("들어가기·비밀번호 찾기 요청 검사", () => {
  it("Origin이 없거나 다르면 403 FORBIDDEN_ORIGIN (본문을 읽기 전에)", async () => {
    const server = await makeApp();
    for (const headers of [
      { "content-type": "application/json" },
      { "content-type": "application/json", origin: "https://evil.example.test" },
      { "content-type": "application/json", origin: ORIGIN, "sec-fetch-site": "cross-site" },
    ]) {
      const res = await enter(server, headers, '{"id":"tester","password":"x"}');
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: "FORBIDDEN_ORIGIN" });
    }
  });

  it("JSON이 아니면 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const server = await makeApp();
    for (const type of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      const res = await enter(server, { origin: ORIGIN, "content-type": type }, "id=tester&password=x");
      expect(res.statusCode).toBe(415);
      expect(res.json()).toEqual({ error: "UNSUPPORTED_MEDIA_TYPE" });
    }
  });

  it("빈 본문·깨진 JSON·모르는 필드·틀린 형식은 400 INVALID_REQUEST", async () => {
    const server = await makeApp();
    for (const payload of [
      "",
      "{",
      "[]",
      '{"id":"tester"}',
      '{"id":"tester","password":"x","role":"admin"}',
      '{"id":1,"password":"x"}',
    ]) {
      const res = await enter(server, JSON_HEADERS, payload);
      expect(res.statusCode, payload).toBe(400);
      expect(res.json()).toEqual({ error: "INVALID_REQUEST" });
    }
  });

  it("아이디 규칙에 맞지 않으면 400 INVALID_ID", async () => {
    const server = await makeApp();
    for (const id of ["ab", "te.st", "테스터", "a".repeat(21)]) {
      const res = await enter(server, JSON_HEADERS, JSON.stringify({ id, password: "x" }));
      expect(res.json()).toEqual({ error: "INVALID_ID" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("주소별 시도 제한: 분당 10회를 넘으면 429와 Retry-After, 시간이 지나면 다시 된다", async () => {
    let time = 1_000_000;
    const server = await makeApp({ now: () => time });
    const send = (ip: string) => enter(server, JSON_HEADERS, '{"id":"x","password":"y"}', ip);
    for (let i = 0; i < 10; i += 1) expect((await send("203.0.113.10")).statusCode).toBe(400);
    const blocked = await send("203.0.113.10");
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("6");
    expect(blocked.json()).toEqual({ error: "TOO_MANY_REQUESTS", retryAfterSec: 6 });
    // 다른 주소는 따로 센다
    expect((await send("203.0.113.11")).statusCode).toBe(400);
    time += 6_000;
    expect((await send("203.0.113.10")).statusCode).toBe(400);
  });

  it("비밀번호 찾기: 확인 칸이 다르면 400 PASSWORD_MISMATCH, 약하면 규칙 코드", async () => {
    const server = await makeApp();
    const reset = (body: object) =>
      server.inject({
        method: "POST",
        url: ACCOUNT_API_PATHS.resetPassword,
        headers: JSON_HEADERS,
        payload: JSON.stringify(body),
      });
    const base = { id: "tester", email: "someone@example.test" };
    expect(
      (await reset({ ...base, newPassword: "long enough 1", newPasswordConfirm: "other" })).json(),
    ).toEqual({
      error: "PASSWORD_MISMATCH",
    });
    expect((await reset({ ...base, newPassword: "short", newPasswordConfirm: "short" })).json()).toEqual({
      error: "PASSWORD_TOO_SHORT",
    });
    expect(
      (
        await reset({
          ...base,
          email: "not-an-email",
          newPassword: "long enough 1",
          newPasswordConfirm: "long enough 1",
        })
      ).json(),
    ).toEqual({ error: "INVALID_EMAIL" });
  });
});

describe("Better Auth에 넘기는 접속 주소", () => {
  it("기기가 보낸 X-Forwarded-For 대신 Fastify가 믿는 프록시로 계산한 주소를 쓴다", async () => {
    app = Fastify({ logger: false, trustProxy: "loopback, uniquelocal" });
    app.get("/__xff", (request, reply) => {
      void reply.send({ xff: authHeaders(request).get("x-forwarded-for") });
    });
    const direct = await app.inject({
      method: "GET",
      url: "/__xff",
      remoteAddress: "198.51.100.9",
      headers: { "x-forwarded-for": "6.6.6.6" },
    });
    expect(direct.json()).toEqual({ xff: "198.51.100.9" });
    const proxied = await app.inject({
      method: "GET",
      url: "/__xff",
      remoteAddress: "172.18.0.1",
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" },
    });
    expect(proxied.json()).toEqual({ xff: "203.0.113.7" });
  });
});
