// 로컬 개발 서버 통합 실행 + 테스트 데이터(사이보그·샘플 영토 비콘) 자동 시드
// 사용: node scripts/dev-local.mjs [--reset] [--seed-only] (별칭: pnpm dev, pnpm dev:local)
// - dev-db.mjs로 로컬 DB 마이그레이션·계정 준비 후 서버(4100)·프론트(5173)를 띄운다.
// - 서버가 준비되면 실제 HTTP·WebSocket 프로토콜로 dev·player 기본 사이보그와 샘플 비콘을 멱등하게 만든다.
// - 실행 중 apps/server/drizzle이 바뀌면 자동으로 db:migrate를 돌리고, 새 마이그레이션 적용 시 서버를 재기동한다.
// - --seed-only는 이미 떠 있는 로컬 서버에 시드만 확인·적용하고 종료한다(자동 검사·초기화용).
import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, watch } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { PROTOCOL_VERSION } from "../packages/protocol/src/version.ts";
import { assertLocalDatabaseUrl, ensureLocalEnv, REPO_ROOT } from "./dev-env.mjs";
import { createMigrationWatcher, parseAppliedMigrations, stopProcessGracefully } from "./dev-local-watch.mjs";

const execFileAsync = promisify(execFile);

const resetMode = process.argv.includes("--reset");
const seedOnly = process.argv.includes("--seed-only");
const env = ensureLocalEnv();
assertLocalDatabaseUrl(env.DATABASE_URL);

const SERVER_ORIGIN = "http://127.0.0.1:4100";
const AUTH_ORIGIN = env.BETTER_AUTH_URL || "http://localhost:5173";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!seedOnly) {
  const dbArgs = ["scripts/dev-db.mjs", ...(resetMode ? ["--reset"] : [])];
  const dbStep = spawnSync("node", dbArgs, { cwd: REPO_ROOT, env, stdio: "inherit" });
  if (dbStep.status !== 0) process.exit(dbStep.status ?? 1);
}

/** 쿠키·Origin을 유지하며 로컬 서버 API 호출 */
function createSessionClient() {
  const cookies = new Map();
  const absorbCookies = (response) => {
    const rawList = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const raw of rawList) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const request = async (pathname, options = {}) => {
    const headers = {
      origin: AUTH_ORIGIN,
      ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    };
    const response = await fetch(`${SERVER_ORIGIN}${pathname}`, { ...options, headers });
    absorbCookies(response);
    return response;
  };
  return { request, cookieHeader };
}

async function login(id, password) {
  const client = createSessionClient();
  const res = await client.request("/api/account/enter", {
    method: "POST",
    body: JSON.stringify({ id, password }),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200 || body?.status !== "signed_in") {
    throw new Error(`${id} 로그인 실패(HTTP ${res.status}): ${JSON.stringify(body)}`);
  }
  return client;
}

async function waitForHealth() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SERVER_ORIGIN}/health`);
      if (res.ok) return;
    } catch {
      // 서버 부팅 중
    }
    await sleep(500);
  }
  throw new Error("로컬 서버(127.0.0.1:4100)가 90초 안에 준비되지 않았습니다.");
}

async function waitForPlanets(client) {
  const file = path.join(REPO_ROOT, "content/core/planets.json");
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, "utf8"));
  const ids = (data.entries ?? []).map((entry) => entry.id).filter((id) => typeof id === "string");
  const deadline = Date.now() + 180_000;
  for (const id of ids) {
    while (Date.now() < deadline) {
      const res = await client.request(`/api/planets/${id}`);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.status === "ready") break;
      await sleep(1_500);
    }
  }
}

async function openWs(client) {
  const ws = new WebSocket(`${SERVER_ORIGIN.replace(/^http/, "ws")}/ws`, {
    headers: { origin: AUTH_ORIGIN, cookie: client.cookieHeader() },
  });
  const messages = [];
  const next = (predicate, timeoutMs = 15_000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket 응답 시간 초과")), timeoutMs);
      const check = () => {
        const idx = messages.findIndex(predicate);
        if (idx >= 0) {
          clearTimeout(timer);
          resolve(messages.splice(idx, 1)[0]);
        } else {
          setTimeout(check, 20);
        }
      };
      check();
    });
  ws.addEventListener("message", (event) => {
    if (typeof event.data === "string") messages.push(JSON.parse(event.data));
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket 연결 실패")), { once: true });
  });
  ws.send(JSON.stringify({ t: "hello", protocolVersion: PROTOCOL_VERSION, clientBuild: "local-dev-seed" }));
  await next((m) => m.t === "welcome");
  return { ws, next };
}

async function ensureStarterCyborg(client, cyborgName, nationIndex = 0) {
  const res = await client.request("/api/trpc/cyborg.creation");
  const json = await res.json().catch(() => null);
  const data = json?.result?.data;
  if (!data) throw new Error("cyborg.creation 조회 실패");
  if (data.created === true) return null;
  const factions = data.factions ?? [];
  const faction = factions[nationIndex % factions.length] ?? factions[0];
  const city = faction?.cities?.[0];
  if (!faction || !city) throw new Error("시작 국가·도시가 아직 준비되지 않았습니다.");

  const { ws, next } = await openWs(client);
  try {
    ws.send(JSON.stringify({ t: "cyborg_roll", id: 1, temperament: "balanced" }));
    const rolled = await next((m) => m.t === "cyborg_result" && m.id === 1);
    if (rolled.ok !== true) throw new Error(`cyborg_roll 실패: ${String(rolled.code)}`);
    ws.send(
      JSON.stringify({
        t: "cyborg_create",
        id: 2,
        name: cyborgName,
        appearance: {
          head: "dome",
          face: "visor",
          body: "round",
          limbs: "stub",
          primary: "sky",
          accent: "lemon",
        },
        factionId: faction.id,
        cityId: city.id,
        elements: { fire: 6, wind: 4 },
      }),
    );
    const created = await next((m) => m.t === "cyborg_result" && m.id === 2);
    if (created.ok !== true) throw new Error(`cyborg_create 실패: ${String(created.code)}`);
    return { factionId: faction.id, city };
  } finally {
    ws.close();
  }
}

async function ensureSampleBeacon(devClient) {
  const res = await devClient.request("/api/trpc/territory.planet?input=%7B%7D");
  const json = await res.json().catch(() => null);
  const view = json?.result?.data;
  if (!view || (view.beacons?.length ?? 0) > 0) return;
  const { stepCell, isCellKey } = await import("../packages/planet/src/index.ts");
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const { ws, next } = await openWs(devClient);
  try {
    let msgId = 10;
    for (const city of (view.cities ?? []).slice(0, 6)) {
      const origin = city.cellKey ?? city.mapKey;
      if (!isCellKey(origin)) continue;
      for (const dist of [7, 6, 5, 4, 3]) {
        for (const [di, dj] of directions) {
          let cellKey = origin;
          for (let step = 0; step < dist && cellKey !== null; step++) cellKey = stepCell(cellKey, di, dj);
          if (cellKey === null) continue;
          msgId += 1;
          ws.send(
            JSON.stringify({
              t: "beacon_place",
              id: msgId,
              planetId: view.planetId,
              cellKey,
              factionId: city.factionId,
            }),
          );
          const reply = await next((m) => m.t === "beacon_result" && m.id === msgId);
          if (reply.ok === true) {
            console.log(`✓ 샘플 영토 비콘 배치: planet=${view.planetId}, cellKey=${cellKey}`);
            return;
          }
        }
      }
    }
  } finally {
    ws.close();
  }
}

async function seedWorldFixtures() {
  await waitForHealth();
  const password = env.DEV_USER_PASSWORD;
  if (!password) return;
  const devClient = await login("dev", password);
  await waitForPlanets(devClient);
  const devSeeded = await ensureStarterCyborg(devClient, "DevCyborg", 0);
  if (devSeeded) console.log("✓ dev 기본 사이보그 생성 완료 (DevCyborg)");
  const playerClient = await login("player", password);
  const playerSeeded = await ensureStarterCyborg(playerClient, "TestPlayer", 1);
  if (playerSeeded) console.log("✓ player 기본 사이보그 생성 완료 (TestPlayer)");
  await ensureSampleBeacon(devClient);
  console.log("────────────────────────────────────────────────────────");
  console.log("✓ 로컬 개발 서버 준비 완료");
  console.log("  프론트엔드: http://localhost:5173");
  console.log("  비콘 미리 보기: http://localhost:5173/dev/buildings?facility=territory_beacon");
  console.log("  서버 상태: http://127.0.0.1:4100/health");
  console.log("  테스트 계정: dev(관리·개발자), player(일반) — 비밀번호는 .env의 DEV_USER_PASSWORD");
  console.log("────────────────────────────────────────────────────────");
}

if (seedOnly) {
  await seedWorldFixtures();
  process.exit(0);
}

let shuttingDown = false;
let restartingServer = false;
let resolveUnexpectedExit;
const exitWatcher = new Promise((resolve) => {
  resolveUnexpectedExit = resolve;
});

const useProcessGroup = process.platform !== "win32";

function spawnServer() {
  const proc = spawn("pnpm", ["--filter", "@terra/server", "dev"], {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
    detached: useProcessGroup,
  });
  proc.once("exit", (code) => {
    if (!restartingServer) resolveUnexpectedExit({ who: "server", code });
  });
  return proc;
}

let serverProc = spawnServer();
const gameProc = spawn("pnpm", ["--filter", "@terra/game", "dev"], {
  cwd: REPO_ROOT,
  env,
  stdio: "inherit",
  detached: useProcessGroup,
});
gameProc.once("exit", (code) => resolveUnexpectedExit({ who: "game", code }));

const migrationWatcher = createMigrationWatcher({
  runMigrate: async () => {
    const { stdout, stderr } = await execFileAsync(
      "pnpm",
      ["--filter", "@terra/server", "exec", "tsx", "src/migrate.ts"],
      { cwd: REPO_ROOT, env },
    );
    if (stdout.trim()) process.stdout.write(stdout);
    if (stderr.trim()) process.stderr.write(stderr);
    return parseAppliedMigrations(stdout);
  },
  onApplied: async (applied) => {
    if (shuttingDown) return;
    console.log(`· 새 DB 마이그레이션 적용(${applied.join(", ")}) — 백엔드 서버를 재기동합니다...`);
    restartingServer = true;
    try {
      await stopProcessGracefully(serverProc, 5000, { killGroup: useProcessGroup });
      if (!shuttingDown) serverProc = spawnServer();
    } finally {
      restartingServer = false;
    }
  },
  onError: (error) => {
    console.error("✗ 자동 DB 마이그레이션 실패:", error instanceof Error ? error.message : String(error));
  },
});

const drizzleDir = path.join(REPO_ROOT, "apps/server/drizzle");
const drizzleFsWatcher = existsSync(drizzleDir)
  ? watch(drizzleDir, { recursive: true }, () => {
      if (!shuttingDown) migrationWatcher.trigger();
    })
  : null;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  migrationWatcher.close();
  drizzleFsWatcher?.close();
  await Promise.all([
    stopProcessGracefully(serverProc, 5000, { killGroup: useProcessGroup }),
    stopProcessGracefully(gameProc, 5000, { killGroup: useProcessGroup }),
  ]);
};
process.once("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

seedWorldFixtures().catch((error) => {
  console.error("✗ 로컬 개발 데이터 시드 실패:", error instanceof Error ? error.message : String(error));
});

const ended = await exitWatcher;
await shutdown();
process.exit(ended.code ?? 0);
