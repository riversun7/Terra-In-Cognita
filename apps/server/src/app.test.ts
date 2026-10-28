import { PROTOCOL_VERSION, decodeServerMessage, encodeMessage } from "@terra/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { closeDatabase, createDatabase } from "./db/client.ts";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function makeApp(): Promise<FastifyInstance> {
  app = await buildApp({ contentVersion: "test", logger: false, now: () => 1_000 });
  await app.ready();
  return app;
}

// 다음 서버 메시지 1개를 기다린다
function nextMessage(ws: { once: (event: "message", cb: (data: Buffer) => void) => void }) {
  return new Promise<ReturnType<typeof decodeServerMessage>>((resolve) => {
    ws.once("message", (data) => resolve(decodeServerMessage(data.toString())));
  });
}

describe("GET /health", () => {
  it("상태와 버전을 돌려준다", async () => {
    const server = await makeApp();
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "ok",
      db: "off",
      protocolVersion: PROTOCOL_VERSION,
      contentVersion: "test",
    });
  });

  it("DB가 응답하지 않으면 503을 돌려준다", async () => {
    // 아무도 듣지 않는 포트 → 연결이 바로 거부된다
    const db = createDatabase("postgres://terra@127.0.0.1:1/terra", () => {});
    app = await buildApp({ contentVersion: "test", logger: false, db });
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ status: "degraded", db: "error" });
    } finally {
      await closeDatabase(db);
    }
  });
});

describe("WebSocket 세션", () => {
  it("hello에 welcome으로 답하고 ping에 pong으로 답한다", async () => {
    const server = await makeApp();
    const ws = await server.injectWS("/ws");
    const welcome = nextMessage(ws);
    ws.send(encodeMessage({ t: "hello", protocolVersion: PROTOCOL_VERSION, clientBuild: "test" }));
    expect(await welcome).toMatchObject({
      t: "welcome",
      protocolVersion: PROTOCOL_VERSION,
      serverTime: 1_000,
    });

    const pong = nextMessage(ws);
    ws.send(encodeMessage({ t: "ping", id: 7, clientSendTime: 900 }));
    expect(await pong).toEqual({ t: "pong", id: 7, clientSendTime: 900, serverTime: 1_000 });
    ws.terminate();
  });

  it("지원하지 않는 버전은 거절한다", async () => {
    const server = await makeApp();
    const ws = await server.injectWS("/ws");
    const reply = nextMessage(ws);
    ws.send(encodeMessage({ t: "hello", protocolVersion: PROTOCOL_VERSION + 1, clientBuild: "test" }));
    expect(await reply).toMatchObject({ t: "reject", code: "protocol_unsupported" });
    ws.terminate();
  });

  it("hello 전에 다른 메시지가 오면 거절한다", async () => {
    const server = await makeApp();
    const ws = await server.injectWS("/ws");
    const reply = nextMessage(ws);
    ws.send(encodeMessage({ t: "ping", id: 1, clientSendTime: 0 }));
    expect(await reply).toMatchObject({ t: "reject", code: "hello_required" });
    ws.terminate();
  });

  it("형식이 틀린 메시지는 거절한다", async () => {
    const server = await makeApp();
    const ws = await server.injectWS("/ws");
    const reply = nextMessage(ws);
    ws.send("not json");
    expect(await reply).toMatchObject({ t: "reject", code: "invalid_message" });
    ws.terminate();
  });
});
