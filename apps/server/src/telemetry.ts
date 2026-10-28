// 텔레메트리 수신 — 기기 오류와 성능 요약을 받아 DB에 남긴다 (PLAN 9.5).
// 기기는 화면을 닫을 때도 보낼 수 있게 sendBeacon(POST)으로 보낸다. 그래서 tRPC가 아니라 일반 HTTP 경로다.
// 인증 없이 열린 경로라서 본문 크기 상한, 주소별·전체 속도 제한, 형식 검사를 거친다.
// 응답은 기기가 읽지 않는다: 받으면 204, 거절은 400·413·429, DB 문제는 503.
import {
  TELEMETRY_MAX_BODY_BYTES,
  TELEMETRY_PATHS,
  clientErrorReportSchema,
  perfReportSchema,
} from "@terra/protocol";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "./db/client.ts";
import { clientErrors, clientPerfSamples } from "./db/schema.ts";
import { createRateLimiter } from "./rateLimit.ts";

const USER_AGENT_MAX = 512;

export interface TelemetryOptions {
  /** 없으면 형식만 검사하고 버린다(DB 없이 뜬 서버) */
  db?: Database | undefined;
  now?: () => number;
}

function userAgent(request: FastifyRequest): string | null {
  const value = request.headers["user-agent"];
  return value ? value.slice(0, USER_AGENT_MAX) : null;
}

export function registerTelemetry(app: FastifyInstance, options: TelemetryOptions): void {
  const now = options.now ?? Date.now;
  // 주소별: 분당 오류 30건, 성능 요약 6건(정상은 1분에 1건). 전체: 분당 600건
  const errorsPerIp = createRateLimiter({ capacity: 30, refillPerMinute: 30, now });
  const perfPerIp = createRateLimiter({ capacity: 6, refillPerMinute: 6, now });
  const overall = createRateLimiter({ capacity: 600, refillPerMinute: 600, now });

  // 저장 실패는 기기에 알릴 방법이 없으니 서버 로그에만 남긴다
  const store = async (
    request: FastifyRequest,
    write: (db: Database) => Promise<unknown>,
  ): Promise<number> => {
    const db = options.db;
    if (!db) return 204;
    try {
      await write(db);
      return 204;
    } catch (error) {
      request.log.warn({ err: error }, "telemetry store failed");
      return 503;
    }
  };

  app.post(TELEMETRY_PATHS.errors, { bodyLimit: TELEMETRY_MAX_BODY_BYTES }, async (request, reply) => {
    if (!errorsPerIp.take(request.ip) || !overall.take("all")) return reply.code(429).send();
    const report = clientErrorReportSchema.safeParse(request.body);
    if (!report.success) return reply.code(400).send();
    const status = await store(request, (db) =>
      db.insert(clientErrors).values({ ...report.data, userAgent: userAgent(request) }),
    );
    return reply.code(status).send();
  });

  app.post(TELEMETRY_PATHS.perf, { bodyLimit: TELEMETRY_MAX_BODY_BYTES }, async (request, reply) => {
    if (!perfPerIp.take(request.ip) || !overall.take("all")) return reply.code(429).send();
    const report = perfReportSchema.safeParse(request.body);
    if (!report.success) return reply.code(400).send();
    const status = await store(request, (db) =>
      db.insert(clientPerfSamples).values({ ...report.data, userAgent: userAgent(request) }),
    );
    return reply.code(status).send();
  });
}
