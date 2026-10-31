#!/usr/bin/env node
// S3 kill -9 복구 시험 — docs/adr/2026-10-31-s3-server-stage.md 2·7절
// 빌드한 서버를 띄우고 → 무작위 시각에 SIGKILL → 다시 켜서 /health가 world: "ready"가 될 때까지 시간 → 불변 조건
// (`/health` worldIssues, `node apps/server/dist/cli.js check-world`)을 CYCLES번 본다. 계정은 만들지 않는다(가짜 값만 쓴다).
//
// 쓰는 법(저장소 뿌리에서, 먼저 `pnpm build`, 빈 DB에 `DATABASE_URL=… node apps/server/dist/migrate.js`):
//   DATABASE_URL=postgres://… node ops/s3-crash.mjs
// 환경 변수: CYCLES(기본 5), BOTS(기본 1000, S1_TEST_BOTS), PORT(기본 4391), MIN_WAIT_S·MAX_WAIT_S(죽이기 전 기다림, 기본 5·20),
//   PLANET_CACHE_DIR(행성 캐시 폴더, 기본 서버 기본값), SEED(기다림 난수, 기본 1)
// 종료 코드: 0 모두 통과(복구 < 60초, 위반 0), 1 실패
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const RECOVERY_LIMIT_MS = 60_000;
const READY_TIMEOUT_MS = 180_000;

const env = process.env;
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL이 필요합니다(빈 시험 DB, 마이그레이션 적용 뒤).");
  process.exit(1);
}
const cycles = Number(env.CYCLES ?? 5);
const port = Number(env.PORT ?? 4391);
const minWait = Number(env.MIN_WAIT_S ?? 5);
const maxWait = Number(env.MAX_WAIT_S ?? 20);
let seed = Number(env.SEED ?? 1) >>> 0;
const nextRandom = () => {
  seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
  return seed / 2 ** 32;
};

const serverEnv = {
  ...env,
  NODE_ENV: "",
  PORT: String(port),
  HOST: "127.0.0.1",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  S1_TEST_BOTS: String(env.BOTS ?? 1000),
};
const logFile = path.join(tmpdir(), `s3-crash-${process.pid}.log`);
const log = openSync(logFile, "a");

const start = () =>
  spawn(process.execPath, ["apps/server/dist/main.js"], { env: serverEnv, stdio: ["ignore", log, log] });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** /health가 world: "ready"가 될 때까지 기다린다. 그 응답 */
async function waitReady(child) {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}), log ${logFile}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        const health = await response.json();
        if (health.world === "ready") return health;
      }
    } catch {
      // 아직 listen 전
    }
    await sleep(100);
  }
  throw new Error(`server not ready in ${READY_TIMEOUT_MS} ms, log ${logFile}`);
}

const checkWorld = () => {
  const result = spawnSync(process.execPath, ["apps/server/dist/cli.js", "check-world"], {
    env: serverEnv,
    encoding: "utf8",
  });
  return { code: result.status, output: (result.stdout || result.stderr).trim() };
};

const results = [];
let child = start();
let failed = false;
try {
  const first = await waitReady(child);
  console.log(
    JSON.stringify({ event: "first boot", worldBootMs: first.worldBootMs, worldIssues: first.worldIssues }),
  );
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const waitMs = Math.round((minWait + nextRandom() * (maxWait - minWait)) * 1000);
    await sleep(waitMs);
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
    const killedAt = Date.now();
    child = start();
    const health = await waitReady(child);
    const recoveryMs = Date.now() - killedAt;
    const check = checkWorld();
    const ok = recoveryMs < RECOVERY_LIMIT_MS && health.worldIssues === 0 && check.code === 0;
    if (!ok) failed = true;
    const row = {
      cycle,
      ranMs: waitMs,
      recoveryMs,
      worldBootMs: health.worldBootMs,
      worldIssues: health.worldIssues,
      checkWorld: check.output,
      ok,
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
} catch (error) {
  failed = true;
  console.error(String(error));
} finally {
  child.kill("SIGTERM");
}
const recoveries = results.map((row) => row.recoveryMs);
console.log(
  JSON.stringify({
    event: "summary",
    cycles: results.length,
    failed,
    recoveryMsMax: recoveries.length > 0 ? Math.max(...recoveries) : null,
    worldBootMsMax: results.length > 0 ? Math.max(...results.map((row) => row.worldBootMs ?? 0)) : null,
    log: logFile,
  }),
);
process.exit(failed ? 1 : 0);
