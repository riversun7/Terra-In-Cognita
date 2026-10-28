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
    async drop() {
      await closeDatabase(db);
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

export function trpcMutation(app: FastifyInstance, path: string, input: unknown, cookie?: string) {
  return app.inject({
    method: "POST",
    url: `/api/trpc/${path}`,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
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
