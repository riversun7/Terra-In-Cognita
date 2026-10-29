// 서버 시작점 — 설정을 읽고 콘텐츠 팩을 검사한 뒤 앱을 띄운다. 종료 신호를 받으면 새 연결을 막고 정리한 뒤 끝낸다.
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { loadServerContent } from "./content.ts";
import { closeDatabase, createDatabase } from "./db/client.ts";
import { createWorkerBaker } from "./planet/baker.ts";
import { type PlanetSourceSpec, createPlanetSource, planetSpecsFromPack } from "./planet/sources.ts";

const config = readConfig();

/**
 * 경로 워커 진입 파일. 이 파일(시작점)을 기준으로 찾는다:
 * 개발(tsx)은 src/main.ts → src/world/pathWorker.ts, 빌드는 dist/main.js → dist/pathWorker.js(vite.config.ts 입력).
 * 시작점은 늘 자기 조각에 있어서(공용 조각 dist/assets/로 빠지지 않는다) 상대 경로가 어긋나지 않는다.
 */
const pathWorkerUrl = import.meta.url.endsWith(".ts")
  ? new URL("./world/pathWorker.ts", import.meta.url)
  : new URL("./pathWorker.js", import.meta.url);
/** 행성 굽기 워커 진입 파일 (경로 워커와 같은 규칙: 개발 src/planet/bakeWorker.ts, 빌드 dist/planetBakeWorker.js) */
const planetBakeWorkerUrl = import.meta.url.endsWith(".ts")
  ? new URL("./planet/bakeWorker.ts", import.meta.url)
  : new URL("./planetBakeWorker.js", import.meta.url);

// 팩이 틀리면 DB에 붙기 전에 끝낸다(코드 1). 앱 로거가 아직 없어 표준 오류로 쓴다
const loaded = loadServerContent(config.contentDir);
if (!loaded.ok) {
  for (const line of loaded.lines) console.error(line);
  process.exit(1);
}
const { content } = loaded;
// 1차맵 행성 = 팩의 planets 분류(ADR 36). 생성기가 받지 않는 정의면 팩이 틀린 것과 같이 시작하지 않는다
let planetSpecs: PlanetSourceSpec[];
try {
  planetSpecs = planetSpecsFromPack(loaded.pack);
} catch (error) {
  console.error(`콘텐츠 팩 행성 정의를 생성기가 받지 않습니다(${config.contentDir}): ${String(error)}`);
  process.exit(1);
}

let app: FastifyInstance | undefined;
const db = config.databaseUrl
  ? createDatabase(config.databaseUrl, (error) => app?.log.warn({ err: error }, "db pool error"))
  : undefined;
// 인증은 DB가 있을 때만 켠다(config.auth). 비밀값·표 정의가 틀리면 buildApp이 실패해 서버가 뜨지 않는다
app = await buildApp({
  contentVersion: content.version,
  contentHash: content.hash,
  staticDir: config.staticDir,
  db,
  trustProxy: config.trustProxy,
  auth: config.auth
    ? {
        settings: { secret: config.auth.secret, baseUrl: config.auth.baseUrl },
        openSignup: config.auth.openSignup,
      }
    : undefined,
  // S1 시험 2차맵은 늘 켠다(봇 수는 S1_TEST_BOTS, 기본 0). 경로는 워커 스레드에서 푼다
  world: {
    testBots: config.s1.testBots,
    paths: { kind: "workers", workerUrl: pathWorkerUrl, workers: config.s1.pathWorkers },
  },
  // 1차맵 행성(ADR 36): 콘텐츠 팩 행성마다 원본 하나(생성기 1판). 캐시에 없으면 워커에서 굽는다
  planets: {
    sources: planetSpecs.map((spec) => createPlanetSource(spec)),
    baker: createWorkerBaker({ workerUrl: planetBakeWorkerUrl }),
    cacheDir: config.planetCacheDir,
  },
});
if (config.auth) {
  app.log.info(
    { authUrl: config.auth.baseUrl, openSignup: config.auth.openSignup, devSecret: !config.auth.secret },
    "auth enabled",
  );
}
app.log.info(
  { contentVersion: content.version, contentHash: content.hash, dir: config.contentDir },
  "content pack",
);
for (const warning of loaded.warnings) app.log.warn(warning);
if (content.placeholder) app.log.warn("임시 콘텐츠 팩(placeholder)입니다 — 기획 확정 전 형식 확인용");
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
