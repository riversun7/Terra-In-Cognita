// 로컬 개발용 PostgreSQL 준비·마이그레이션·표준 개발 계정(dev·player) 초기화
// 사용: node scripts/dev-db.mjs [--reset]
// - 다른 PC에서도 같은 DB 구조·표준 계정·결정적 세계 시드를 맞추도록 멱등하게 동작한다.
// - NAS·외부 DB에는 절대 연결하지 않는다(assertLocalDatabaseUrl).
import { spawnSync } from "node:child_process";
import { assertLocalDatabaseUrl, ensureLocalEnv, loadPg, REPO_ROOT } from "./dev-env.mjs";

const resetMode = process.argv.includes("--reset");
const env = ensureLocalEnv();
const { url, dbName, host, port } = assertLocalDatabaseUrl(env.DATABASE_URL);
const { Client } = loadPg();

const adminUrl = new URL(url.toString());
adminUrl.pathname = "/postgres";

async function canConnect(connectionString) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ensurePostgresRunning() {
  if (await canConnect(adminUrl.toString())) return;
  if (process.platform === "darwin") {
    console.log("· 로컬 PostgreSQL이 꺼져 있어 Homebrew postgresql@15 시작을 시도합니다...");
    for (const formula of ["postgresql@15", "postgresql"]) {
      const res = spawnSync("brew", ["services", "start", formula], { encoding: "utf8" });
      if (res.status === 0) break;
    }
    for (let i = 0; i < 10; i++) {
      if (await canConnect(adminUrl.toString())) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    `로컬 PostgreSQL(${host}:${port})에 연결할 수 없습니다.\n` +
      `  macOS: brew services start postgresql@15\n` +
      `  Linux/Docker: 로컬 PostgreSQL 컨테이너 또는 서비스를 켠 뒤 다시 실행하세요.`,
  );
}

async function ensureDatabaseExists() {
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query("select 1 from pg_database where datname = $1", [dbName]);
    if (existing.rowCount === 0) {
      await client.query(`create database "${dbName}"`);
      console.log(`✓ 로컬 DB 생성: ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

function runPnpm(args, extraEnv = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: REPO_ROOT,
    env: { ...env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`명령 실패: pnpm ${args.join(" ")} (종료 코드 ${String(result.status)})`);
  }
}

function ensureUser(id, roles, password) {
  const commonEnv = { ...env, TIC_PASSWORD: password, TIC_ACTOR: "local:dev-db" };
  const created = spawnSync(
    "pnpm",
    ["--filter", "@terra/server", "exec", "tsx", "src/cli.ts", "create-user", "--id", id, "--roles", roles],
    { cwd: REPO_ROOT, env: commonEnv, encoding: "utf8" },
  );
  if (created.status === 0) {
    console.log(`✓ 개발 계정 생성: ${id} (${roles})`);
    return;
  }
  if (created.status === 3 || `${created.stderr}${created.stdout}`.includes("이미 있는 아이디입니다")) {
    // 이미 있는 계정은 역할만 최신 기준에 맞춰 둔다
    const synced = spawnSync(
      "pnpm",
      ["--filter", "@terra/server", "exec", "tsx", "src/cli.ts", "set-roles", "--id", id, "--roles", roles],
      { cwd: REPO_ROOT, env: commonEnv, encoding: "utf8" },
    );
    if (synced.status !== 0) {
      throw new Error(`계정 역할 맞추기 실패(${id}): ${synced.stderr || synced.stdout}`);
    }
    return;
  }
  throw new Error(`계정 생성 실패(${id}): ${created.stderr || created.stdout}`);
}

await ensurePostgresRunning();
await ensureDatabaseExists();

if (resetMode) {
  console.log("· 로컬 세계 표 초기화(reset-world --confirm RESET-WORLD)...");
  runPnpm(
    ["--filter", "@terra/server", "exec", "tsx", "src/cli.ts", "reset-world", "--confirm", "RESET-WORLD"],
    { TIC_ACTOR: "local:dev-reset" },
  );
}

runPnpm(["--filter", "@terra/server", "db:migrate"]);

const devPassword = env.DEV_USER_PASSWORD;
if (!devPassword) {
  throw new Error(".env에 DEV_USER_PASSWORD가 없습니다. dev 계정을 만들 비밀번호를 지정하세요.");
}
ensureUser("dev", "player,dev,admin", devPassword);
ensureUser("player", "player", devPassword);

console.log(`✓ 로컬 DB(${dbName}) 준비 완료 — 계정: dev(관리·개발자), player(일반) (비밀번호는 .env 참고)`);
