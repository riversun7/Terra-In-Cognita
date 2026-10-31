// 화면 시험 전역 준비 — ADR 2026-10-29-app-shell 13절·[결정 3](CI에서 돌리지 않는다. 화면을 고친 에이전트가 돌려 작업 기록에 남긴다)
// 1. 브라우저: 개발 환경에 이미 있는 Chromium(PLAYWRIGHT_BROWSERS_PATH, @playwright/test 1.63.0 = chromium-1243). 내려받지 않는다.
// 2. 빌드: 결과가 없거나 소스보다 오래되었으면 pnpm build.
// 3. 새 DB(TEST_DATABASE_URL 계정에 CREATEDB 필요) → 마이그레이션(apps/server/dist/migrate.js).
// 4. 가짜 계정 player·dev·admin(dist/cli.js create-user, 이번 실행에서 만든 무작위 비밀번호).
// 5. 빌드한 서버(dist/main.js): NODE_ENV 비움(운영 모드는 https 주소를 요구한다), STATIC_DIR=apps/game/dist,
//    127.0.0.1의 빈 포트(4400~4599, E2E_PORT로 정할 수 있다).
// 6. 계정마다 한 번 들어가 세션(쿠키)을 파일로 남긴다 → 시험이 test.use({ account })로 쓴다(helpers/test.ts).
//    들어가기 응답의 계정 ID(user.id)도 적는다(시안 자료 표시처럼 기기 저장소에 계정 ID를 넣는 시험용).
//    차례로 들어간다: 들어가기는 주소마다 분당 10번이다(apps/server/src/auth/limits.ts). 계정을 늘리면 시험의 login()과 함께 센다.
// 7. 콘텐츠 팩 행성이 준비될 때까지 기다린다. 타일 캐시는 서버 기본 폴더(apps/server/.planet-cache)라 첫 실행만 굽는다.
// 돌려주는 함수가 전역 정리다: 서버를 끄고 DB를 지운다. 서버 기록은 e2e/test-results/server.log에 남는다.
// 같은 작업 트리에서는 한 번에 하나만 돈다: 설정 파일을 읽을 때 잠금을 잡는다(helpers/runLock.ts).
// 끊긴 실행(2026-10-29 확인): SIGINT(Ctrl+C)는 Playwright가 받아 전역 정리를 끝까지 돌린다. SIGTERM·SIGHUP은 Node 기본
// 동작이 정리 없이 끝나는 것이라 여기서 받아 서버를 바로 끄고 같은 신호로 끝난다. SIGKILL은 받을 수 없다.
// 남은 서버(SIGKILL)·DB·임시 폴더는 다음 실행이 처음에 정리한다(실행 기록 파일).
import { type ChildProcess, execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { type FullConfig, chromium, request } from "@playwright/test";
import { type AccountName, HARNESS_ENV, type Harness, type HarnessAccount } from "./helpers/harness.ts";
import {
  type ProcessRef,
  ROOT,
  RUN_STATE_FILE,
  isAlive,
  parseProcessRef,
  processRef,
} from "./helpers/runLock.ts";

const run = promisify(execFile);

/** 가짜 계정(버리는 DB에만 있다). 아이디 규칙: 영문·숫자·_ 3~20자 */
const ACCOUNTS = {
  player: { id: "e2e_player", roles: "player" },
  dev: { id: "e2e_dev", roles: "player,dev" },
  admin: { id: "e2e_admin", roles: "player,admin" },
} as const satisfies Record<AccountName, { id: string; roles: string }>;

/** 만든 계정(아직 들어가지 않아 계정 ID를 모른다) */
type CreatedAccount = Omit<HarnessAccount, "userId">;

/** 빌드 결과 — 가장 오래된 것보다 새 소스가 있으면 다시 빌드한다 */
const BUILD_OUTPUTS = [
  "apps/game/dist/index.html",
  "apps/server/dist/main.js",
  "apps/server/dist/migrate.js",
  "apps/server/dist/cli.js",
];
const BUILD_INPUTS = ["apps/game", "apps/server", "packages", "pnpm-lock.yaml"];
/** 빌드에 들어가지 않는 파일: 시험·문서, 마이그레이션 SQL(dist/migrate.js가 실행 중에 ../drizzle을 읽는다) */
const NOT_BUILT = /\.test\.[cm]?[jt]sx?$|\.md$|^apps\/server\/drizzle\//;
const PORT_RANGE = { from: 4400, to: 4600 };
const SERVER_START_MS = 90_000;
const SERVER_STOP_MS = 10_000;
/**
 * 행성 굽기를 기다리는 상한. 빈 캐시면 행성마다 약 20초를 차례로 굽는다(행성 2개면 약 40초, 기계 부하에 따라 더).
 * 캐시가 있으면 몇 초(AGENTS.md 7장 PLANET_CACHE_DIR 줄)
 */
const PLANET_READY_MS = 180_000;
const DB_NAME = /^terra_e2e_[0-9a-f]{8}$/;
/** 이번 실행의 임시 폴더: tmpdir() 바로 아래 mkdtemp("terra-e2e-") = 앞머리 + 6글자 */
const RUN_DIR_PREFIX = "terra-e2e-";
const RUN_DIR_NAME = /^terra-e2e-[A-Za-z0-9]{6}$/;
/** 서버를 남기지 않으려고 받는 신호. SIGINT는 Playwright가 받아 전역 정리를 돌리므로 넣지 않는다 */
const STOP_SIGNALS = ["SIGTERM", "SIGHUP"] as const;

/** 실행 기록(RUN_STATE_FILE): 이번 실행이 만든 것. 정리를 마치면 지운다 */
interface RunState {
  runner: ProcessRef | null;
  runDir: string | null;
  dbName: string | null;
  server: ProcessRef | null;
}

const log = (line: string): void => console.log(`[e2e] ${line}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 브라우저가 있는지(실제로 띄워 본다). 없으면 내려받지 말고 개발 환경 설정을 보라고 알린다 */
async function checkBrowser(): Promise<void> {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch (error) {
    throw new Error(
      `Chromium을 띄우지 못했습니다. 개발 환경에 미리 설치한 브라우저를 씁니다(내려받지 않는다): ` +
        `PLAYWRIGHT_BROWSERS_PATH(지금 ${process.env.PLAYWRIGHT_BROWSERS_PATH ?? "없음"})가 chromium-1243이 있는 폴더(/opt/pw-browsers)인지 보세요. ` +
        `@playwright/test 판을 바꿨다면 그 판의 브라우저가 있어야 합니다.`,
      { cause: error },
    );
  }
}

/** 다시 빌드해야 하는 까닭. 최신이면 null */
function staleBuild(): string | null {
  const missing = BUILD_OUTPUTS.filter((file) => !existsSync(path.join(ROOT, file)));
  if (missing.length > 0) return `빌드 결과가 없습니다(${missing.join(", ")})`;
  const builtAt = Math.min(...BUILD_OUTPUTS.map((file) => statSync(path.join(ROOT, file)).mtimeMs));
  let files: string[];
  try {
    files = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...BUILD_INPUTS],
      {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    )
      .split("\n")
      .filter(Boolean);
  } catch {
    log("git으로 소스 목록을 읽지 못해 빌드 결과가 있는지만 봤습니다");
    return null;
  }
  for (const file of files) {
    if (NOT_BUILT.test(file)) continue;
    const full = path.join(ROOT, file);
    if (existsSync(full) && statSync(full).mtimeMs > builtAt) return `빌드보다 새 소스가 있습니다(${file})`;
  }
  return null;
}

function buildIfStale(): void {
  const reason = staleBuild();
  if (!reason) {
    log("빌드 결과가 최신입니다");
    return;
  }
  log(`${reason} → pnpm build`);
  const result = spawnSync("pnpm", ["build"], { cwd: ROOT, stdio: "inherit" });
  if (result.error) throw new Error(`pnpm을 실행하지 못했습니다: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`pnpm build가 실패했습니다(코드 ${String(result.status)})`);
  // 빌드가 도중에 다시 쓰는 입력이 있다: 작업 트리의 첫 빌드에서 Paraglide(inlang)가 apps/game/project.inlang/settings.json을
  // 같은 내용으로 다시 쓴다(서버 결과를 쓴 뒤, 2026-10-29 확인). 그대로 두면 다음 실행이 그 파일을 "새 소스"로 보고 또 빌드한다.
  // 그래서 결과 시각을 빌드가 끝난 때로 맞춘다. 빌드하는 동안 손으로 고친 소스는 다음 실행이 보지 못한다(감수)
  const builtAt = new Date();
  for (const file of BUILD_OUTPUTS) utimesSync(path.join(ROOT, file), builtAt, builtAt);
}

/** 127.0.0.1의 그 포트를 쓸 수 있는지 */
function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** 서버 포트: E2E_PORT, 없으면 4400~4599에서 빈 포트(다른 작업 트리의 시험·서버와 겹치지 않게) */
async function choosePort(): Promise<number> {
  const fixed = process.env.E2E_PORT;
  if (fixed) {
    const port = Number(fixed);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535)
      throw new Error(`E2E_PORT가 틀렸습니다: ${fixed}`);
    if (!(await canListen(port))) throw new Error(`E2E_PORT ${port}를 이미 쓰고 있습니다`);
    return port;
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const port = PORT_RANGE.from + Math.floor(Math.random() * (PORT_RANGE.to - PORT_RANGE.from));
    if (await canListen(port)) return port;
  }
  throw new Error(`빈 포트를 찾지 못했습니다(${PORT_RANGE.from}~${PORT_RANGE.to - 1}). E2E_PORT로 정하세요`);
}

interface PgClient {
  connect(): Promise<unknown>;
  query(text: string): Promise<unknown>;
  end(): Promise<unknown>;
}
interface PgModule {
  Client: new (config: { connectionString: string }) => PgClient;
}
const isPgModule = (value: unknown): value is PgModule =>
  typeof value === "object" && value !== null && typeof Reflect.get(value, "Client") === "function";

/** 관리 접속(TEST_DATABASE_URL)으로 문장 하나. pg는 서버 꾸러미의 것을 쓴다(루트에 따로 두지 않는다) */
async function adminQuery(adminUrl: string, text: string): Promise<void> {
  const pg: unknown = createRequire(path.join(ROOT, "apps/server/package.json"))("pg");
  if (!isPgModule(pg)) throw new Error("apps/server의 pg 꾸러미를 읽지 못했습니다(pnpm install)");
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

/** 서버 기록의 끝 몇 줄(실패 안내용) */
function logTail(file: string, lines = 30): string {
  try {
    return readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

/** 서버가 /health에 db ok로 답할 때까지. 실패하면 기록 끝 줄을 붙인다(전체는 정리 때 e2e/test-results/server.log로 옮긴다) */
async function waitForServer(baseURL: string, server: ChildProcess, logFile: string): Promise<void> {
  const until = Date.now() + SERVER_START_MS;
  while (Date.now() < until) {
    if (server.exitCode !== null) {
      throw new Error(`서버가 꺼졌습니다(코드 ${server.exitCode}). 기록 끝:\n${logTail(logFile)}`);
    }
    try {
      const response = await fetch(`${baseURL}/health`, { signal: AbortSignal.timeout(2_000) });
      const body: unknown = await response.json();
      if (response.ok && typeof body === "object" && body !== null && Reflect.get(body, "db") === "ok")
        return;
    } catch {
      // 아직 뜨는 중
    }
    await sleep(250);
  }
  throw new Error(`서버가 ${SERVER_START_MS / 1000}초 안에 뜨지 않았습니다. 기록 끝:\n${logTail(logFile)}`);
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), sleep(SERVER_STOP_MS).then(() => false)]);
  if (!stopped) {
    server.kill("SIGKILL");
    await exited;
  }
}

/** 모르는 JSON 값의 칸 하나(객체가 아니면 undefined) */
function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * 계정으로 한 번 들어가 세션 쿠키를 파일로 남기고 계정 ID를 돌려준다(같은 출처 검사: origin 머리글 = BETTER_AUTH_URL).
 * 응답 모양은 packages/shared/src/accountApi.ts의 EnterResponse({ status: "signed_in", user: { id, … } })
 */
async function saveSession(baseURL: string, account: CreatedAccount): Promise<HarnessAccount> {
  const { id, password, storageState } = account;
  const context = await request.newContext({ baseURL });
  try {
    const response = await context.post("/api/account/enter", {
      data: { id, password },
      headers: { origin: baseURL },
    });
    const body: unknown = await response.json().catch(() => null);
    const status = fieldOf(body, "status");
    const userId = fieldOf(fieldOf(body, "user"), "id");
    if (response.status() !== 200 || status !== "signed_in" || typeof userId !== "string") {
      throw new Error(`${id} 세션을 만들지 못했습니다: HTTP ${response.status()}, status ${String(status)}`);
    }
    await context.storageState({ path: storageState });
    return { ...account, userId };
  } finally {
    await context.dispose();
  }
}

/** 서버가 싣는 콘텐츠 팩의 행성 ID(planets.json의 entries[].id). 서버와 같이 CONTENT_DIR를 따른다 */
function planetIds(): string[] {
  const dir = process.env.CONTENT_DIR
    ? path.resolve(ROOT, process.env.CONTENT_DIR)
    : path.join(ROOT, "content/core");
  const file = path.join(dir, "planets.json");
  if (!existsSync(file)) return [];
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  const entries: unknown =
    typeof data === "object" && data !== null ? Reflect.get(data, "entries") : undefined;
  const list: unknown[] = Array.isArray(entries) ? entries : [];
  return list
    .map((entry) => (typeof entry === "object" && entry !== null ? Reflect.get(entry, "id") : undefined))
    .filter((id): id is string => typeof id === "string");
}

/**
 * 행성이 준비될 때까지(목록 정보 status "ready") 기다린다. 서버는 켤 때 행성을 뒤에서 굽는데(캐시가 없으면),
 * 짧은 실행은 굽기가 끝나기 전에 서버를 꺼서 캐시가 남지 않고 시험 동안 CPU만 쓴다. 기다리면 첫 실행에 한 번
 * 굽고 캐시를 남긴다(다음 실행부터 약 1초). 지도 시험도 늘 준비된 행성에서 시작한다.
 * 상한을 넘으면 알리고 계속한다(지도가 아닌 시험까지 막지 않는다).
 */
async function waitForPlanets(baseURL: string, storageState: string): Promise<void> {
  const ids = planetIds();
  if (ids.length === 0) return;
  const context = await request.newContext({ baseURL, storageState });
  const started = Date.now();
  try {
    for (const id of ids) {
      for (;;) {
        const response = await context.get(`/api/planets/${id}`);
        const body: unknown = await response.json().catch(() => null);
        if (
          response.ok() &&
          typeof body === "object" &&
          body !== null &&
          Reflect.get(body, "status") === "ready"
        ) {
          break;
        }
        if (Date.now() - started > PLANET_READY_MS) {
          log(
            `행성 ${id}이(가) ${PLANET_READY_MS / 1000}초 안에 준비되지 않았습니다. 지도 시험은 실패할 수 있습니다`,
          );
          return;
        }
        // 목록 정보는 사용자마다 분당 60번까지다(apps/server/src/planet/routes.ts)
        await sleep(1_500);
      }
    }
    log(`행성 ${ids.join(", ")} 준비(${((Date.now() - started) / 1000).toFixed(1)}초)`);
  } finally {
    await context.dispose();
  }
}

function readRunState(): RunState | null {
  try {
    const data: unknown = JSON.parse(readFileSync(RUN_STATE_FILE, "utf8"));
    if (typeof data !== "object" || data === null) return null;
    const text = (key: string): string | null => {
      const value: unknown = Reflect.get(data, key);
      return typeof value === "string" ? value : null;
    };
    return {
      runner: parseProcessRef(Reflect.get(data, "runner")),
      runDir: text("runDir"),
      dbName: text("dbName"),
      server: parseProcessRef(Reflect.get(data, "server")),
    };
  } catch {
    return null;
  }
}

/** 이 틀이 만드는 모양의 임시 폴더인지(지우기 전에 본다): tmpdir() 바로 아래, 이름은 RUN_DIR_NAME */
const isRunDir = (dir: string): boolean =>
  path.dirname(dir) === tmpdir() && RUN_DIR_NAME.test(path.basename(dir));

/**
 * 앞 실행이 정리하지 못한 서버·DB·임시 폴더를 정리한다. 서버는 적어 둔 번호·시작 시각이 같을 때만 끈다
 * (번호만 같은 다른 프로세스, 예를 들어 다른 작업 트리의 서버는 건드리지 않는다).
 */
async function cleanPreviousRun(adminUrl: string): Promise<void> {
  const state = readRunState();
  if (!state) return;
  // 잠금(설정을 읽을 때)이 실행을 하나로 막는다. 여기서 살아 있는 다른 실행기를 보면 잠금을 함께 가져간 드문 경우다
  if (isAlive(state.runner) && state.runner.pid !== process.pid) {
    throw new Error(
      `이 작업 트리에서 다른 화면 시험이 돌고 있습니다(실행기 pid ${state.runner.pid}, 실행 기록 ${RUN_STATE_FILE}). 끝난 뒤 다시 돌리세요`,
    );
  }
  let server = "서버 기록 없음";
  if (state.server !== null) {
    const stopped = isAlive(state.server);
    if (stopped) process.kill(state.server.pid, "SIGKILL");
    server = `서버 pid ${state.server.pid} ${stopped ? "끔" : "이미 없음"}`;
  }
  if (state.dbName !== null && DB_NAME.test(state.dbName)) {
    await adminQuery(adminUrl, `drop database if exists ${state.dbName} with (force)`);
  }
  if (state.runDir !== null && isRunDir(state.runDir)) {
    rmSync(state.runDir, { recursive: true, force: true });
  }
  rmSync(RUN_STATE_FILE, { force: true });
  log(`앞 실행이 남긴 것을 정리했습니다(${server}, DB ${String(state.dbName)}, 실행 기록 ${RUN_STATE_FILE})`);
}

export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      "TEST_DATABASE_URL이 없습니다. CREATEDB 권한이 있는 PostgreSQL 접속 주소를 줍니다(예: TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm e2e).",
    );
  }
  const outputDir = config.projects[0]?.outputDir ?? path.join(ROOT, "e2e", "test-results");
  const cleanups: (() => Promise<void> | void)[] = [];
  const cleanup = async (): Promise<void> => {
    for (const step of cleanups.toReversed()) {
      try {
        await step();
      } catch (error) {
        console.error(`[e2e] 정리 실패: ${String(error)}`);
      }
    }
  };

  try {
    await cleanPreviousRun(adminUrl);
    await checkBrowser();
    buildIfStale();

    const state: RunState = { runner: processRef(process.pid), runDir: null, dbName: null, server: null };
    const saveState = (): void => writeFileSync(RUN_STATE_FILE, JSON.stringify(state));
    // 맨 처음 넣으므로 정리 때 맨 마지막에 돈다
    cleanups.push(() => rmSync(RUN_STATE_FILE, { force: true }));
    const runDir = mkdtempSync(path.join(tmpdir(), RUN_DIR_PREFIX));
    state.runDir = runDir;
    saveState();
    const logFile = path.join(runDir, "server.log");
    cleanups.push(() => rmSync(runDir, { recursive: true, force: true }));
    cleanups.push(() => {
      if (!existsSync(logFile)) return;
      mkdirSync(outputDir, { recursive: true });
      copyFileSync(logFile, path.join(outputDir, "server.log"));
    });

    const dbName = `terra_e2e_${randomBytes(4).toString("hex")}`;
    const dbUrl = new URL(adminUrl);
    dbUrl.pathname = `/${dbName}`;
    state.dbName = dbName;
    saveState();
    await adminQuery(adminUrl, `create database ${dbName}`);
    cleanups.push(() => adminQuery(adminUrl, `drop database if exists ${dbName} with (force)`));

    const port = await choosePort();
    const baseURL = `http://127.0.0.1:${port}`;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "",
      HOST: "127.0.0.1",
      PORT: String(port),
      STATIC_DIR: path.join(ROOT, "apps/game/dist"),
      DATABASE_URL: dbUrl.toString(),
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: baseURL,
    };
    await run(process.execPath, ["apps/server/dist/migrate.js"], { cwd: ROOT, env });

    const createAccount = async (name: AccountName): Promise<CreatedAccount> => {
      const { id, roles } = ACCOUNTS[name];
      // 비밀번호 규칙(8자 이상, 아이디와 다름, 흔한 비밀번호 아님)을 지키는 무작위 값
      const password = `e2e-${randomBytes(12).toString("base64url")}`;
      await run(process.execPath, ["apps/server/dist/cli.js", "create-user", "--id", id, "--roles", roles], {
        cwd: ROOT,
        env: { ...env, TIC_PASSWORD: password, TIC_ACTOR: "e2e global-setup" },
      });
      return { id, password, storageState: path.join(runDir, `session-${name}.json`) };
    };
    const [player, dev, admin] = await Promise.all([
      createAccount("player"),
      createAccount("dev"),
      createAccount("admin"),
    ]);

    const logStream = createWriteStream(logFile);
    const server = spawn(process.execPath, ["apps/server/dist/main.js"], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    state.server = server.pid === undefined ? null : processRef(server.pid);
    saveState();
    server.stdout.pipe(logStream);
    server.stderr.pipe(logStream);
    // 실행기가 전역 정리 없이 끝나도 서버를 남기지 않는다: 오류 등으로 끝날 때(exit), SIGTERM·SIGHUP을 받을 때
    const killServer = (): void => {
      server.kill("SIGKILL");
    };
    const onStopSignal = (signal: NodeJS.Signals): void => {
      killServer();
      // 듣는 함수를 모두 떼고 같은 신호로 다시: Node 기본 동작대로 끝난다(종료 코드 128 + 신호 번호)
      process.off("exit", killServer);
      for (const other of STOP_SIGNALS) process.off(other, onStopSignal);
      process.kill(process.pid, signal);
    };
    process.once("exit", killServer);
    for (const signal of STOP_SIGNALS) process.once(signal, onStopSignal);
    cleanups.push(async () => {
      process.off("exit", killServer);
      for (const signal of STOP_SIGNALS) process.off(signal, onStopSignal);
      await stopServer(server);
      await new Promise<void>((resolve) => logStream.end(resolve));
    });
    const started = Date.now();
    await waitForServer(baseURL, server, logFile);
    log(`서버 ${baseURL} (DB ${dbName}, ${((Date.now() - started) / 1000).toFixed(1)}초, 기록 ${logFile})`);

    // 차례로 들어간다(객체 칸은 적은 차례대로 기다린다)
    const accounts: Record<AccountName, HarnessAccount> = {
      player: await saveSession(baseURL, player),
      dev: await saveSession(baseURL, dev),
      admin: await saveSession(baseURL, admin),
    };
    await waitForPlanets(baseURL, accounts.admin.storageState);
    const harness: Harness = { baseURL, accounts };
    process.env[HARNESS_ENV] = JSON.stringify(harness);
  } catch (error) {
    await cleanup();
    throw error;
  }
  return cleanup;
}
