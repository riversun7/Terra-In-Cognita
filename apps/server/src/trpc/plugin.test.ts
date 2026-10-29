// tRPC 붙이기 시험 — 모든 응답 cache-control: no-store(없는 경로 404 포함), 쓰기 본문은 JSON만(그 밖은 본문을 읽기 전 415),
// 묶음 상한, 출처 확인(쓰기는 같은 출처만, 조회도 다른 사이트는 막는다)(ADR 38 9절, 계정 경로와 같은 규칙).
// DB 없이 앱 라우터를 그대로 붙인다: 출처가 맞으면 로그인 확인(UNAUTHORIZED)까지 가고, 틀리면 그 전에 FORBIDDEN이다.
import { request as httpRequest } from "node:http";
import { TRPC_MAX_BATCH_SIZE, TRPC_PATH } from "@terra/protocol";
import { TRPC_ERROR_CODES_BY_KEY } from "@trpc/server/rpc";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createContextFactory } from "./createContext.ts";
import { publicProcedure, router } from "./init.ts";
import { TRPC_CACHE_CONTROL, TRPC_UNSUPPORTED_MEDIA_TYPE, registerTrpc } from "./plugin.ts";
import { appRouter } from "./router.ts";

const ORIGIN = "https://game.example.test";
const SAME_ORIGIN = { origin: ORIGIN, "sec-fetch-site": "same-origin" };
const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** appOrigin null = 앱 출처를 모르는 서버(인증 꺼짐) */
async function makeApp(appOrigin: string | null = ORIGIN): Promise<FastifyInstance> {
  app = Fastify({ logger: false, routerOptions: { maxParamLength: 5_000 } });
  await registerTrpc(app, {
    router: appRouter,
    createContext: createContextFactory({
      contentVersion: "test",
      now: () => 1_000,
      appOrigin: appOrigin ?? undefined,
    }),
  });
  await app.ready();
  return app;
}

function post(server: FastifyInstance, path: string, headers: Record<string, string>, payload: unknown = {}) {
  return server.inject({
    method: "POST",
    url: `${TRPC_PATH}/${path}`,
    headers: { "content-type": "application/json", ...headers },
    payload: JSON.stringify(payload),
  });
}

/** 프로시저 이름 n개를 쉼표로 이은 묶음 경로 */
const batchPath = (name: string, count: number): string =>
  Array.from({ length: count }, () => name).join(",");

describe("tRPC 응답 캐시", () => {
  it("성공·오류·없는 프로시저·형식 오류·없는 경로(404)·415 모두 cache-control: no-store", async () => {
    const server = await makeApp();
    const responses = [
      await server.inject({ method: "GET", url: `${TRPC_PATH}/system.info` }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/account.me` }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/settings.get` }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/system.nope` }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/planetEditor.definitions` }),
      await post(server, "settings.set", SAME_ORIGIN, { theme: "dark" }),
      await post(server, "settings.set", CROSS_SITE, { theme: "dark" }),
      // 조회 프로시저에 POST(405), 로그인 확인이 형식 오류보다 먼저(401)
      await post(server, "system.info", SAME_ORIGIN),
      await server.inject({
        method: "POST",
        url: `${TRPC_PATH}/settings.set`,
        headers: { "content-type": "application/json", ...SAME_ORIGIN },
        payload: "{not json",
      }),
      // 프로시저 경로 모양이 아닌 주소(어댑터 경로 밖)
      await server.inject({ method: "GET", url: TRPC_PATH }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/a/b` }),
      await post(server, "a/b", SAME_ORIGIN),
      // JSON이 아닌 쓰기 본문
      await server.inject({
        method: "POST",
        url: `${TRPC_PATH}/settings.set`,
        headers: { "content-type": "text/plain", ...SAME_ORIGIN },
        payload: "{}",
      }),
    ];
    expect(responses.map((res) => res.statusCode)).toEqual([
      200, 200, 401, 404, 401, 401, 403, 405, 401, 404, 404, 404, 415,
    ]);
    for (const res of responses) expect(res.headers["cache-control"]).toBe(TRPC_CACHE_CONTROL);
    expect(responses[10]?.json()).toEqual({ error: "not_found" });
  });
});

describe("tRPC 쓰기 본문은 JSON만", () => {
  it.each<[string, Record<string, string>]>([
    ["multipart/form-data", { "content-type": "multipart/form-data; boundary=x" }],
    ["text/plain", { "content-type": "text/plain" }],
    ["application/x-www-form-urlencoded", { "content-type": "application/x-www-form-urlencoded" }],
    ["application/octet-stream", { "content-type": "application/octet-stream" }],
    ["형식 없음", {}],
  ])("%s → 415(본문을 읽기 전, 연결 닫음), 프로시저·로그인 확인 전", async (_name, type) => {
    const server = await makeApp();
    for (const path of ["settings.set", "planetEditor.drafts.save", "admin.users.setRoles", "system.nope"]) {
      const res = await server.inject({
        method: "POST",
        url: `${TRPC_PATH}/${path}`,
        headers: { ...SAME_ORIGIN, ...type },
        payload: '--x\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--x--\r\n',
      });
      expect(res.statusCode, path).toBe(415);
      expect(res.json(), path).toEqual({ error: TRPC_UNSUPPORTED_MEDIA_TYPE });
      expect(res.headers.connection, path).toBe("close");
      expect(res.headers["cache-control"], path).toBe(TRPC_CACHE_CONTROL);
    }
  });

  it("application/json(매개변수 charset 포함)은 그대로 지난다", async () => {
    const server = await makeApp();
    for (const type of ["application/json", "application/json; charset=utf-8"]) {
      const res = await server.inject({
        method: "POST",
        url: `${TRPC_PATH}/settings.set`,
        headers: { ...SAME_ORIGIN, "content-type": type },
        payload: JSON.stringify({ theme: "dark" }),
      });
      expect(res.statusCode, type).toBe(401);
    }
  });

  it("진짜 소켓: 끝나지 않는 multipart 본문에도 415가 바로 온다(본문을 모으지 않는다)", async () => {
    // 입력을 받는 공개 쓰기(로그인 확인이 없어 고치기 전에는 tRPC가 본문 끝까지 formData로 모았다)
    const echoRouter = router({ echo: publicProcedure.input(z.unknown()).mutation(({ input }) => input) });
    app = Fastify({ logger: false });
    await registerTrpc(app, {
      router: echoRouter,
      createContext: createContextFactory({ contentVersion: "test", now: () => 0 }),
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === "string") throw new Error("no TCP address");
    const status = await new Promise<{ status: number | undefined; ended: boolean }>((resolve, reject) => {
      const req = httpRequest({
        host: "127.0.0.1",
        port: address.port,
        method: "POST",
        path: `${TRPC_PATH}/echo`,
        headers: { "content-type": "multipart/form-data; boundary=x", "transfer-encoding": "chunked" },
      });
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error("no response while the body was still open"));
      }, 5_000);
      req.on("response", (res) => {
        clearTimeout(timer);
        res.resume();
        resolve({ status: res.statusCode, ended: req.writableEnded });
        req.destroy();
      });
      req.on("error", () => {
        // 서버가 연결을 닫으면(connection: close) 보내던 쪽에 오류가 날 수 있다. 응답을 이미 받았으면 무시한다
      });
      // 첫 조각만 보내고 끝내지 않는다(큰 본문을 보내는 중인 것처럼)
      req.write(`--x\r\nContent-Disposition: form-data; name="a"\r\n\r\n${"a".repeat(64 * 1024)}`);
    });
    expect(status).toEqual({ status: 415, ended: false });
  });
});

describe("tRPC 묶음 상한", () => {
  it(`프로시저 ${TRPC_MAX_BATCH_SIZE}개까지 받고, 넘으면 400(맥락·프로시저 전)`, async () => {
    const server = await makeApp();
    const atLimit = await server.inject({
      method: "GET",
      url: `${TRPC_PATH}/${batchPath("system.info", TRPC_MAX_BATCH_SIZE)}?batch=1`,
    });
    expect(atLimit.statusCode).toBe(200);
    expect(atLimit.json()).toHaveLength(TRPC_MAX_BATCH_SIZE);
    for (const res of [
      await server.inject({
        method: "GET",
        url: `${TRPC_PATH}/${batchPath("planetEditor.definitions", TRPC_MAX_BATCH_SIZE + 1)}?batch=1`,
      }),
      await server.inject({
        method: "POST",
        url: `${TRPC_PATH}/${batchPath("settings.set", TRPC_MAX_BATCH_SIZE + 1)}?batch=1`,
        headers: { "content-type": "application/json", ...SAME_ORIGIN },
        payload: JSON.stringify({}),
      }),
    ]) {
      expect(res.statusCode).toBe(400);
      expect(res.headers["cache-control"]).toBe(TRPC_CACHE_CONTROL);
    }
  });
});

describe("tRPC 출처 확인", () => {
  it.each<[string, Record<string, string>]>([
    ["다른 사이트(Sec-Fetch-Site cross-site)", CROSS_SITE],
    [
      "같은 사이트의 다른 출처(same-site)",
      { origin: "https://other.example.test", "sec-fetch-site": "same-site" },
    ],
    ["Origin만 다름", { origin: "https://evil.example" }],
    [
      "Sec-Fetch-Site는 same-origin인데 Origin이 다름",
      { origin: "http://game.example.test", "sec-fetch-site": "same-origin" },
    ],
    ["머리글 없음(브라우저가 아님)", {}],
    ["Sec-Fetch-Site none(주소창 등)", { "sec-fetch-site": "none" }],
  ])("쓰기 %s → 403 FORBIDDEN(data.reason cross_origin), 로그인 확인 전에 막는다", async (_name, headers) => {
    const server = await makeApp();
    for (const path of [
      "settings.set",
      "admin.users.setRoles",
      "planetEditor.drafts.save",
      "planetEditor.drafts.remove",
    ]) {
      const res = await post(server, path, headers);
      expect(res.statusCode, path).toBe(403);
      expect(res.json(), path).toEqual({
        error: {
          message: "CROSS_ORIGIN_REQUEST",
          code: TRPC_ERROR_CODES_BY_KEY.FORBIDDEN,
          data: { code: "FORBIDDEN", httpStatus: 403, path, reason: "cross_origin" },
        },
      });
    }
  });

  it.each<[string, Record<string, string>]>([
    ["Origin + Sec-Fetch-Site same-origin(요즘 브라우저)", SAME_ORIGIN],
    ["Origin만 같음(Sec-Fetch-Site가 없는 브라우저)", { origin: ORIGIN }],
    ["Sec-Fetch-Site same-origin만(Origin이 없는 경우)", { "sec-fetch-site": "same-origin" }],
  ])("쓰기 %s → 출처 확인을 지나 로그인 확인(401)까지 간다", async (_name, headers) => {
    const server = await makeApp();
    const res = await post(server, "settings.set", headers, { theme: "dark" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      error: { message: "SIGN_IN_REQUIRED", data: { code: "UNAUTHORIZED" } },
    });
    expect(res.json().error.data).not.toHaveProperty("reason");
  });

  it("묶음 요청(httpBatchLink)은 프로시저마다 같은 오류를 받는다", async () => {
    const server = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: `${TRPC_PATH}/settings.set,planetEditor.drafts.save?batch=1`,
      headers: { "content-type": "application/json", ...CROSS_SITE },
      payload: JSON.stringify({ 0: { theme: "dark" }, 1: {} }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(
      ["settings.set", "planetEditor.drafts.save"].map((path) => ({
        error: {
          message: "CROSS_ORIGIN_REQUEST",
          code: TRPC_ERROR_CODES_BY_KEY.FORBIDDEN,
          data: { code: "FORBIDDEN", httpStatus: 403, path, reason: "cross_origin" },
        },
      })),
    );
  });

  it.each<[string, Record<string, string>]>([
    [
      "다른 사이트에서 연 주소(cross-site navigate)",
      { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
    ],
    ["같은 사이트의 다른 앱(same-site)", { "sec-fetch-site": "same-site" }],
    ["모르는 Sec-Fetch-Site 값", { "sec-fetch-site": "bogus" }],
    ["다른 출처의 fetch(Origin 다름)", { origin: "https://evil.example" }],
  ])("조회 %s → 403 cross_origin(프로시저 전)", async (_name, headers) => {
    const server = await makeApp();
    for (const path of ["system.info", "planetEditor.definitions"]) {
      const res = await server.inject({ method: "GET", url: `${TRPC_PATH}/${path}`, headers });
      expect(res.statusCode, path).toBe(403);
      expect(res.json(), path).toMatchObject({
        error: { message: "CROSS_ORIGIN_REQUEST", data: { code: "FORBIDDEN", path, reason: "cross_origin" } },
      });
    }
  });

  it.each<[string, Record<string, string>]>([
    ["같은 출처", { "sec-fetch-site": "same-origin" }],
    ["주소창·북마크(none)", { "sec-fetch-site": "none" }],
    ["머리글 없음(브라우저가 아닌 도구)", {}],
    ["Origin이 앱 출처", { origin: ORIGIN, "sec-fetch-site": "same-origin" }],
  ])("조회 %s → 받는다", async (_name, headers) => {
    const server = await makeApp();
    const res = await server.inject({ method: "GET", url: `${TRPC_PATH}/system.info`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: { data: { contentVersion: "test" } } });
  });

  it("앱 출처를 모르는 서버(인증 꺼짐)는 출처를 보지 않는다: 세션이 없어 쓰기는 모두 401", async () => {
    const server = await makeApp(null);
    const res = await post(server, "settings.set", CROSS_SITE, { theme: "dark" });
    expect(res.statusCode).toBe(401);
    const read = await server.inject({ method: "GET", url: `${TRPC_PATH}/system.info`, headers: CROSS_SITE });
    expect(read.statusCode).toBe(200);
  });
});
