// 서버 시작점 — 설정을 읽고 앱을 띄운다. 종료 신호를 받으면 새 연결을 막고 정리한 뒤 끝낸다.
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { closeDatabase, createDatabase } from "./db/client.ts";

const config = readConfig();
let app: FastifyInstance | undefined;
const db = config.databaseUrl
  ? createDatabase(config.databaseUrl, (error) => app?.log.warn({ err: error }, "db pool error"))
  : undefined;
app = await buildApp({
  contentVersion: config.contentVersion,
  staticDir: config.staticDir,
  db,
  trustProxy: config.trustProxy,
});
if (!db) app.log.warn("DATABASE_URL이 없어 DB 없이 시작합니다");

const shutdown = async (signal: string): Promise<void> => {
  app?.log.info({ signal }, "shutting down");
  await app?.close();
  // 진행 중인 요청이 끝난 뒤(app.close) DB 연결을 닫는다
  if (db) await closeDatabase(db);
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.host, port: config.port });
