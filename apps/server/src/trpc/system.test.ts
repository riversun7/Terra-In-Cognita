// tRPC 앱 라우터 시험 — 실제 앱(buildApp)에 붙은 /api/trpc 경로와, 게임 앱이 쓰는 것과 같은 클라이언트로 부른다
import { PROTOCOL_VERSION, TRPC_PATH } from "@terra/protocol";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { buildApp } from "../app.ts";
import { SIM_VERSION } from "../config.ts";
import type { AppRouter } from "./router.ts";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function makeApp(): Promise<FastifyInstance> {
  app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0, now: () => 1_000 });
  await app.ready();
  return app;
}

const expectedInfo = {
  protocolVersion: PROTOCOL_VERSION,
  simVersion: SIM_VERSION,
  contentVersion: "test",
  serverTime: 1_000,
};

describe("tRPC system.info", () => {
  it("GET /api/trpc/system.info는 버전과 서버 시각을 돌려준다", async () => {
    const server = await makeApp();
    const res = await server.inject({ method: "GET", url: `${TRPC_PATH}/system.info` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: { data: expectedInfo } });
  });

  it("없는 프로시저는 404 NOT_FOUND", async () => {
    const server = await makeApp();
    const res = await server.inject({ method: "GET", url: `${TRPC_PATH}/system.nope` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { data: { code: "NOT_FOUND", httpStatus: 404 } } });
  });

  it("게임 앱과 같은 클라이언트(httpBatchLink)로 묶음 요청을 보내면 각각 답한다", async () => {
    app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0, now: () => 1_000 });
    const urls: string[] = [];
    app.addHook("onRequest", async (request) => {
      urls.push(request.url);
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("listen address missing");

    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `http://127.0.0.1:${address.port}${TRPC_PATH}` })],
    });
    // 같은 틱에 부른 요청은 HTTP 요청 하나(/system.info,system.info,…)로 묶인다.
    // 12개면 경로 조각이 100자를 넘는다 → Fastify 기본 maxParamLength(100)였다면 실패한다.
    const results = await Promise.all(Array.from({ length: 12 }, () => client.system.info.query()));
    expect(results).toEqual(Array.from({ length: 12 }, () => expectedInfo));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(`${TRPC_PATH}/system.info,system.info,`);

    // 클라이언트 쪽 출력 타입이 서버 프로시저에서 추론된다
    expectTypeOf(await client.system.info.query()).toEqualTypeOf<{
      protocolVersion: number;
      simVersion: number;
      contentVersion: string;
      serverTime: number;
    }>();
  });
});
