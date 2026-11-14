// DB 통합 시험 도우미 — 시험마다 새 데이터베이스를 만들고 마이그레이션을 모두 적용한다(접속 계정에 CREATEDB 필요).
// 시험 파일끼리 서로 import하지 않게 여기에 둔다. 게임 앱 선언 파일에는 넣지 않는다(tsconfig.api.json exclude).
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { Client } from "pg";
import { buildApp } from "./app.ts";
import type { AccountLimitName, LimitSetting } from "./auth/limits.ts";
import { closeDatabase, createDatabase, type Database } from "./db/client.ts";
import { runMigrations } from "./db/migrations.ts";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

/** 시험용 앱 출처(BETTER_AUTH_URL). http라서 쿠키 이름에 __Secure- 앞머리가 없다 */
export const TEST_ORIGIN = "http://game.example.test:5173";
export const TEST_SETTINGS = { secret: "b".repeat(64), baseUrl: TEST_ORIGIN };
export const JSON_HEADERS = { origin: TEST_ORIGIN, "content-type": "application/json" };

async function adminQuery(statement: string): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

export interface TestDatabase {
  db: Database;
  /** 이 시험 DB 주소(관리 명령을 따로 연결해 돌리는 시험용). db를 먼저 닫아도 drop이 된다 */
  url: string;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `terra_test_${randomBytes(4).toString("hex")}`;
  await adminQuery(`create database ${name}`);
  const url = new URL(String(TEST_DATABASE_URL));
  url.pathname = `/${name}`;
  const db = createDatabase(url.toString(), () => {});
  await runMigrations(db, MIGRATIONS);
  return {
    db,
    url: url.toString(),
    async drop() {
      if (!db.$client.ending) await closeDatabase(db);
      await adminQuery(`drop database if exists ${name}`);
    },
  };
}

export interface TestAppOptions {
  openSignup?: boolean;
  limits?: Partial<Record<AccountLimitName, LimitSetting>>;
  now?: () => number;
}

export async function buildAuthApp(db: Database, options: TestAppOptions = {}): Promise<FastifyInstance> {
  return buildApp({
    contentVersion: "test",
    logger: false,
    metricsIntervalMs: 0,
    db,
    ...(options.now ? { now: options.now } : {}),
    auth: { settings: TEST_SETTINGS, openSignup: options.openSignup ?? true, limits: options.limits },
  });
}

/** 시험마다 다른 접속 주소를 써서 주소별 시도 제한에 걸리지 않게 한다(공인 주소 문서용 대역) */
let nextIp = 1;
export function freshIp(): string {
  nextIp += 1;
  return `198.51.100.${nextIp % 250}`;
}

export function enter(app: FastifyInstance, body: object, ip = freshIp()) {
  return app.inject({
    method: "POST",
    url: "/api/account/enter",
    headers: JSON_HEADERS,
    payload: JSON.stringify(body),
    remoteAddress: ip,
  });
}

/** 응답의 세션 쿠키를 다음 요청의 cookie 머리글 모양으로("tic.session_token=…") */
export function sessionCookie(res: LightMyRequestResponse): string {
  const cookies = [res.headers["set-cookie"] ?? []].flat();
  const found = cookies.find((cookie) => cookie.startsWith("tic.session_token="));
  if (!found) throw new Error(`session cookie missing (status ${res.statusCode})`);
  return found.split(";", 1)[0] ?? "";
}

export function trpcQuery(app: FastifyInstance, path: string, input: unknown, cookie?: string) {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return app.inject({
    method: "GET",
    url: `/api/trpc/${path}${query}`,
    headers: cookie ? { cookie } : {},
  });
}

/** 같은 출처 화면(브라우저)이 보내는 쓰기 머리글. tRPC 쓰기는 같은 출처만 받는다(src/trpc/createContext.ts) */
export const SAME_ORIGIN_HEADERS = { origin: TEST_ORIGIN, "sec-fetch-site": "same-origin" };

/**
 * tRPC 쓰기. 기본은 같은 출처 브라우저처럼 보낸다. headers를 주면 출처 머리글을 그것으로 바꾼다
 * (다른 사이트 흉내: { origin: "https://evil.example", "sec-fetch-site": "cross-site" }, 머리글 없음: {})
 */
export function trpcMutation(
  app: FastifyInstance,
  path: string,
  input: unknown,
  cookie?: string,
  headers: Record<string, string> = SAME_ORIGIN_HEADERS,
) {
  return app.inject({
    method: "POST",
    url: `/api/trpc/${path}`,
    headers: { "content-type": "application/json", ...headers, ...(cookie ? { cookie } : {}) },
    payload: JSON.stringify(input),
  });
}

/** pg로 바로 조회(시험 확인용) */
export async function rows<T extends Record<string, unknown>>(
  db: Database,
  text: string,
  values: unknown[] = [],
) {
  return (await db.$client.query<T>(text, values)).rows;
}

/**
 * 시험 사용자를 그 2차맵 도시의 세력에 넣는다(2차맵 건설 땅 규칙 — 다른 세력 도시 2차맵에는 못 짓는다,
 * docs/adr/2026-11-14-second-map-build.md). 플레이어가 첫 접속에서 시험 NPC 세력에 드는 것과 같다. 도시가 없거나 이미 세력이 있으면 그대로.
 * 든 세력 ID(없으면 null)
 */
export async function joinCityFaction(db: Database, userId: string, mapKey: number): Promise<number | null> {
  const found = await rows<{ faction_id: string }>(
    db,
    "select faction_id from world_cities where map_key = $1 order by id limit 1",
    [mapKey],
  );
  const faction = found[0]?.faction_id;
  if (faction === undefined) return null;
  await rows(db, "insert into faction_members (user_id, faction_id) values ($1, $2) on conflict do nothing", [
    userId,
    faction,
  ]);
  return Number(faction);
}
