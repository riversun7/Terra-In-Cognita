// DB 연결 — pg 연결 풀 위에 Drizzle을 얹는다. 서버 프로세스에 하나만 만든다.
// 드라이버 선택(pg)은 docs/adr/2026-10-28-db-access-and-migrations.md
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function createDatabase(url: string, onPoolError: (error: Error) => void) {
  const pool = new Pool({
    connectionString: url,
    max: 10,
    // DB가 응답하지 않을 때 무한정 기다리지 않게
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  // 쉬고 있던 연결이 끊기면(DB 재시작 등) 풀이 error를 낸다. 듣는 곳이 없으면 프로세스가 죽는다.
  pool.on("error", onPoolError);
  return drizzle({ client: pool });
}

export type Database = ReturnType<typeof createDatabase>;

/** 헬스체크용: DB가 제한 시간 안에 응답하는지 */
export async function pingDatabase(db: Database, timeoutMs = 2_000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([db.execute(sql`select 1`).then(() => true), timedOut]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function closeDatabase(db: Database): Promise<void> {
  await db.$client.end();
}
