// 서버 시작점 — 설정을 읽고 앱을 띄운다. 종료 신호를 받으면 새 연결을 막고 정리한 뒤 끝낸다.
import { buildApp } from "./app.ts";
import { readConfig } from "./config.ts";

const config = readConfig();
const app = await buildApp({ contentVersion: config.contentVersion, staticDir: config.staticDir });

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.host, port: config.port });
