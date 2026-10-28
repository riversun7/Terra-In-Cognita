// 마이그레이션 적용 — Drizzle 1.0은 밀린 마이그레이션을 트랜잭션 하나로 적용한다.
// 실패하면 아무것도 바뀌지 않는다. 적용 기록은 drizzle.__drizzle_migrations 표에 남는다.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client.ts";

/** 이미 적용된 마이그레이션 이름 (적용 순서대로) */
export async function appliedMigrations(db: Database): Promise<string[]> {
  // Drizzle 1.0의 execute 결과는 여러 문장용 배열일 수도 있는 타입이라, 조회는 pg 연결로 직접 한다
  const table = await db.$client.query<{ name: string | null }>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as name",
  );
  if (!table.rows[0]?.name) return [];
  const result = await db.$client.query<{ name: string }>(
    "select name from drizzle.__drizzle_migrations order by id",
  );
  return result.rows.map((row) => row.name);
}

/** 밀린 마이그레이션을 적용하고, 이번에 적용한 이름을 돌려준다 */
export async function runMigrations(db: Database, migrationsFolder: string): Promise<string[]> {
  const before = new Set(await appliedMigrations(db));
  await migrate(db, { migrationsFolder });
  return (await appliedMigrations(db)).filter((name) => !before.has(name));
}
