// DB 통합 테스트 — TEST_DATABASE_URL이 있을 때만 돈다(CI는 PostgreSQL 18.6 서비스 컨테이너).
// 테스트마다 새 데이터베이스를 만들고 끝나면 지운다(접속 계정에 CREATEDB 권한이 필요).
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { TELEMETRY_PATHS } from "@terra/protocol";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { samplePerf } from "../testFixtures.ts";
import { closeDatabase, createDatabase, type Database } from "./client.ts";
import { appliedMigrations, runMigrations } from "./migrations.ts";
import { clientErrors, clientPerfSamples } from "./schema.ts";

const baseUrl = process.env.TEST_DATABASE_URL;
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

// 테스트용 데이터베이스 만들기·지우기는 기본 데이터베이스에 접속해서 한다
async function admin(statement: string): Promise<void> {
  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

describe.skipIf(!baseUrl)("DB (TEST_DATABASE_URL)", () => {
  const name = `terra_test_${randomBytes(4).toString("hex")}`;
  let db: Database;

  beforeAll(async () => {
    await admin(`create database ${name}`);
    const url = new URL(String(baseUrl));
    url.pathname = `/${name}`;
    db = createDatabase(url.toString(), () => {});
  });

  afterAll(async () => {
    await closeDatabase(db);
    await admin(`drop database if exists ${name}`);
  });

  it("빈 DB에 마이그레이션을 모두 적용하고, 다시 돌리면 아무것도 하지 않는다", async () => {
    const first = await runMigrations(db, MIGRATIONS);
    expect(first.length).toBeGreaterThan(0);
    expect(await appliedMigrations(db)).toEqual(first);
    expect(await runMigrations(db, MIGRATIONS)).toEqual([]);
  });

  it("client_errors에 쓰고 읽을 수 있다", async () => {
    const [row] = await db
      .insert(clientErrors)
      .values({ clientBuild: "test", kind: "error", message: "boom" })
      .returning();
    expect(row?.id).toBeTypeOf("number");
    expect(row?.receivedAt).toBeInstanceOf(Date);
    expect(row?.stack).toBeNull();
  });

  it("텔레메트리 보고를 표에 남긴다 (접속 프로그램 정보는 요청 머리글에서)", async () => {
    const app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0, db });
    try {
      const headers = { "user-agent": "vitest-db" };
      const error = await app.inject({
        method: "POST",
        url: TELEMETRY_PATHS.errors,
        headers,
        payload: { clientBuild: "test", kind: "rejection", message: "nope", page: "/x" },
      });
      expect(error.statusCode).toBe(204);
      const perf = await app.inject({
        method: "POST",
        url: TELEMETRY_PATHS.perf,
        headers,
        payload: samplePerf,
      });
      expect(perf.statusCode).toBe(204);
    } finally {
      await app.close();
    }
    const [errorRow] = await db.select().from(clientErrors).where(eq(clientErrors.kind, "rejection"));
    expect(errorRow).toMatchObject({ message: "nope", page: "/x", userAgent: "vitest-db" });
    const [perfRow] = await db.select().from(clientPerfSamples);
    expect(perfRow).toMatchObject({ frames: 3_600, userAgent: "vitest-db", device: samplePerf.device });
    expect(perfRow?.memoryMb).toBeNull();
  });

  it("헬스체크가 DB 상태를 알려준다", async () => {
    const app = await buildApp({ contentVersion: "test", logger: false, db });
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "ok", db: "ok" });
    } finally {
      await app.close();
    }
  });
});
