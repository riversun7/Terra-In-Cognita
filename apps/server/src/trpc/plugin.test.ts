// tRPC 붙이기 시험 — 모든 응답 cache-control: no-store, 쓰기(POST)는 같은 출처만(ADR 38 9절, 계정 경로와 같은 규칙).
// DB 없이 앱 라우터를 그대로 붙인다: 출처가 맞으면 로그인 확인(UNAUTHORIZED)까지 가고, 틀리면 그 전에 FORBIDDEN이다.
import { TRPC_PATH } from "@terra/protocol";
import { TRPC_ERROR_CODES_BY_KEY } from "@trpc/server/rpc";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createContextFactory } from "./createContext.ts";
import { TRPC_CACHE_CONTROL, registerTrpc } from "./plugin.ts";
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

describe("tRPC 응답 캐시", () => {
  it("성공·오류·없는 프로시저·형식 오류 모두 cache-control: no-store", async () => {
    const server = await makeApp();
    const responses = [
      await server.inject({ method: "GET", url: `${TRPC_PATH}/system.info` }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/account.me` }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/settings.get` }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/system.nope` }),
      await server.inject({ method: "GET", url: `${TRPC_PATH}/admin.users.list` }),
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
    ];
    expect(responses.map((res) => res.statusCode)).toEqual([200, 200, 401, 404, 401, 401, 403, 405, 401]);
    for (const res of responses) expect(res.headers["cache-control"]).toBe(TRPC_CACHE_CONTROL);
  });
});

describe("tRPC 쓰기 같은 출처 확인", () => {
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
  ])("%s → 403 FORBIDDEN(data.reason cross_origin), 로그인 확인 전에 막는다", async (_name, headers) => {
    const server = await makeApp();
    for (const path of ["settings.set", "admin.users.setRoles"]) {
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
  ])("%s → 출처 확인을 지나 로그인 확인(401)까지 간다", async (_name, headers) => {
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
      url: `${TRPC_PATH}/settings.set,admin.users.setRoles?batch=1`,
      headers: { "content-type": "application/json", ...CROSS_SITE },
      payload: JSON.stringify({ 0: { theme: "dark" }, 1: {} }),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(
      ["settings.set", "admin.users.setRoles"].map((path) => ({
        error: {
          message: "CROSS_ORIGIN_REQUEST",
          code: TRPC_ERROR_CODES_BY_KEY.FORBIDDEN,
          data: { code: "FORBIDDEN", httpStatus: 403, path, reason: "cross_origin" },
        },
      })),
    );
  });

  it("조회(GET)는 출처를 보지 않는다(읽기만 한다)", async () => {
    const server = await makeApp();
    const res = await server.inject({ method: "GET", url: `${TRPC_PATH}/system.info`, headers: CROSS_SITE });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: { data: { contentVersion: "test" } } });
  });

  it("앱 출처를 모르는 서버(인증 꺼짐)는 출처를 보지 않는다: 세션이 없어 쓰기는 모두 401", async () => {
    const server = await makeApp(null);
    const res = await post(server, "settings.set", CROSS_SITE, { theme: "dark" });
    expect(res.statusCode).toBe(401);
  });
});
