// Fastify 앱 구성 — 테스트에서도 같은 함수로 만든다
import path from "node:path";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from "@terra/protocol";
import Fastify, { type FastifyInstance } from "fastify";
import { DEFAULT_TRUST_PROXY, SIM_VERSION } from "./config.ts";
import { type Database, pingDatabase } from "./db/client.ts";
import { startServerMetrics } from "./metrics.ts";
import { handleSession } from "./session.ts";
import { registerTelemetry } from "./telemetry.ts";
import { createContextFactory } from "./trpc/context.ts";
import { registerTrpc } from "./trpc/plugin.ts";
import { appRouter } from "./trpc/router.ts";

export interface AppOptions {
  contentVersion: string;
  staticDir?: string | undefined;
  logger?: boolean;
  now?: () => number;
  /** 없으면 DB 없이 뜬다(헬스체크의 db는 "off") */
  db?: Database | undefined;
  /** 서버 지표 기록 간격(ms). 0이면 기록하지 않는다 */
  metricsIntervalMs?: number;
  /** 믿는 프록시 주소 (기본: 루프백·사설 주소) */
  trustProxy?: string;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const now = options.now ?? Date.now;
  const app = Fastify({
    logger: options.logger ?? true,
    // DSM 역방향 프록시 뒤에서 실제 접속 주소를 읽는다. 모두 믿으면(true) 맨 앞의 위조 값이 접속 주소가 된다.
    trustProxy: options.trustProxy ?? DEFAULT_TRUST_PROXY,
    // tRPC 묶음 요청은 경로에 프로시저 이름을 쉼표로 잇는다(/api/trpc/a,b,c). 기본 100자는 짧다.
    routerOptions: { maxParamLength: 5_000 },
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
  await registerTrpc(app, {
    router: appRouter,
    createContext: createContextFactory({ contentVersion: options.contentVersion, now }),
  });

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
    // 화면 이동(SPA) 경로만 index.html로 보낸다. API·WebSocket과 파일처럼 보이는 경로(확장자 있음)는 404.
    // 없는 /assets/*.js에 HTML을 주면 브라우저가 형식 오류를 내고, 나중에 서비스 워커를 걷어낼 수도 없다.
    // 그래서 화면 경로 이름에는 점(.)을 쓰지 않는다.
    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split("?", 1)[0] ?? "";
      const isPage =
        request.method === "GET" &&
        !pathname.startsWith("/api") &&
        !pathname.startsWith("/ws") &&
        !/\.[^/]*$/.test(pathname);
      if (isPage) return reply.sendFile("index.html");
      return reply.code(404).send({ error: "not_found" });
    });
  }

  return app;
}
