import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PROTOCOL_VERSION, decodeServerMessage, encodeMessage } from "@terra/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { IMMUTABLE_CACHE_CONTROL, buildApp } from "./app.ts";
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

describe("정적 파일", () => {
  it("화면 경로는 index.html, 없는 파일·API는 404", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "terra-static-"));
    try {
      writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>");
      app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0, staticDir: dir });
      const page = await app.inject({ method: "GET", url: "/lobby/map?x=1" });
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toContain("text/html");
      expect((await app.inject({ method: "GET", url: "/" })).statusCode).toBe(200);
      // 배포 뒤 옛 화면이 찾는 없는 파일에 HTML을 주면 안 된다
      expect((await app.inject({ method: "GET", url: "/assets/missing-abc.js" })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/sw.js" })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/api/nope" })).statusCode).toBe(404);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("캐시: /assets/(해시 이름)는 1년 immutable, 나머지는 매번 확인(max-age=0)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "terra-static-"));
    try {
      mkdirSync(path.join(dir, "assets", "nested"), { recursive: true });
      writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>");
      writeFileSync(path.join(dir, "sw.js"), "self.x = 1;");
      writeFileSync(path.join(dir, "theme-init.js"), "void 0;");
      writeFileSync(path.join(dir, "favicon.svg"), "<svg/>");
      writeFileSync(path.join(dir, "manifest.webmanifest"), "{}");
      writeFileSync(path.join(dir, "assets", "index-Ab12Cd34.js"), "export {};");
      writeFileSync(path.join(dir, "assets", "Pretendard-Regular.subset-Xy98Zw76.woff2"), "wOF2");
      writeFileSync(path.join(dir, "assets", "nested", "chunk-Qq11Rr22.css"), "a{}");
      // 이름만 비슷한 다른 폴더는 해당하지 않는다
      mkdirSync(path.join(dir, "assets-old"));
      writeFileSync(path.join(dir, "assets-old", "a.js"), "export {};");
      app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0, staticDir: dir });
      const cacheOf = async (url: string) => {
        const res = await app?.inject({ method: "GET", url });
        return { status: res?.statusCode, cache: res?.headers["cache-control"] };
      };
      for (const url of [
        "/assets/index-Ab12Cd34.js",
        "/assets/Pretendard-Regular.subset-Xy98Zw76.woff2",
        "/assets/nested/chunk-Qq11Rr22.css",
      ]) {
        expect(await cacheOf(url), url).toEqual({ status: 200, cache: IMMUTABLE_CACHE_CONTROL });
      }
      for (const url of [
        "/",
        "/index.html",
        "/sw.js",
        "/theme-init.js",
        "/favicon.svg",
        "/manifest.webmanifest",
        "/lobby",
        "/assets-old/a.js",
      ]) {
        expect(await cacheOf(url), url).toEqual({ status: 200, cache: "public, max-age=0" });
      }
      // 없는 /assets/ 파일(404)에는 오래 캐시하라고 하지 않는다
      const missing = await cacheOf("/assets/missing-Zz00.js");
      expect(missing.status).toBe(404);
      expect(missing.cache).not.toBe(IMMUTABLE_CACHE_CONTROL);
      // 다시 확인 요청(304)에도 같은 머리글
      const first = await app.inject({ method: "GET", url: "/assets/index-Ab12Cd34.js" });
      const again = await app.inject({
        method: "GET",
        url: "/assets/index-Ab12Cd34.js",
        headers: { "if-none-match": String(first.headers.etag) },
      });
      expect(again.statusCode).toBe(304);
      expect(again.headers["cache-control"]).toBe(IMMUTABLE_CACHE_CONTROL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// 시험용으로 접속 주소를 그대로 돌려주는 경로를 붙여, 서버가 본 주소를 꺼낸다
async function ipOf(remoteAddress: string, forwarded: string): Promise<string> {
  app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0 });
  app.get("/__ip", (request, reply) => {
    void reply.send({ ip: request.ip });
  });
  const res = await app.inject({
    method: "GET",
    url: "/__ip",
    remoteAddress,
    headers: { "x-forwarded-for": forwarded },
  });
  return res.json<{ ip: string }>().ip;
}

describe("프록시 머리글 (X-Forwarded-For)", () => {
  it("믿는 프록시(사설 주소)를 거치면 프록시가 덧붙인 마지막 주소를 쓴다 (앞쪽 위조 값은 무시)", async () => {
    expect(await ipOf("172.18.0.1", "6.6.6.6, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("모르는 곳에서 직접 온 머리글은 믿지 않는다", async () => {
    expect(await ipOf("198.51.100.9", "6.6.6.6")).toBe("198.51.100.9");
  });
});
