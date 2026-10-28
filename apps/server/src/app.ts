// Fastify 앱 구성 — 테스트에서도 같은 함수로 만든다
import path from "node:path";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from "@terra/protocol";
import Fastify, { type FastifyInstance } from "fastify";
import { SIM_VERSION } from "./config.ts";
import { type Database, pingDatabase } from "./db/client.ts";
import { startServerMetrics } from "./metrics.ts";
import { handleSession } from "./session.ts";
import { registerTelemetry } from "./telemetry.ts";

export interface AppOptions {
  contentVersion: string;
  staticDir?: string | undefined;
  logger?: boolean;
  now?: () => number;
  /** 없으면 DB 없이 뜬다(헬스체크의 db는 "off") */
  db?: Database | undefined;
  /** 서버 지표 기록 간격(ms). 0이면 기록하지 않는다 */
  metricsIntervalMs?: number;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const now = options.now ?? Date.now;
  const app = Fastify({
    logger: options.logger ?? true,
    // DSM 역방향 프록시 뒤에서 실제 접속 주소를 읽기 위해
    trustProxy: true,
  });

  await app.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  // DB가 응답하지 않으면 503 → 배포 헬스체크가 실패해 직전 버전으로 되돌린다
  app.get("/health", async (_request, reply) => {
    const db = options.db ? ((await pingDatabase(options.db)) ? "ok" : "error") : "off";
    if (db === "error") reply.code(503);
    return {
      status: db === "error" ? "degraded" : "ok",
      db,
      protocolVersion: PROTOCOL_VERSION,
      simVersion: SIM_VERSION,
      contentVersion: options.contentVersion,
      uptimeSec: Math.floor(process.uptime()),
    };
  });

  registerTelemetry(app, { db: options.db, now });

  let wsConnections = 0;
  await app.register(async (scope) => {
    scope.get("/ws", { websocket: true }, (socket) => {
      wsConnections += 1;
      socket.on("close", () => {
        wsConnections -= 1;
      });
      handleSession(socket, { simVersion: SIM_VERSION, contentVersion: options.contentVersion, now });
    });
  });

  const metricsIntervalMs = options.metricsIntervalMs ?? 60_000;
  if (metricsIntervalMs > 0) {
    const stopMetrics = startServerMetrics(app.log, () => wsConnections, metricsIntervalMs);
    app.addHook("onClose", async () => stopMetrics());
  }

  if (options.staticDir) {
    const root = path.resolve(options.staticDir);
    await app.register(fastifyStatic, { root, wildcard: false });
    // 화면 이동(SPA) 경로는 index.html로 보낸다. API 경로는 404 유지.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api") && !request.url.startsWith("/ws")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }

  return app;
}
