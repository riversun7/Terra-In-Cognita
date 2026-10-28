// 마이그레이션 실행 진입점 — 배포 때 ops/deploy.sh가 새 이미지로 한 번 실행한다(앱 교체 전).
// 개발: pnpm --filter @terra/server db:migrate (DATABASE_URL 필요)
import { fileURLToPath } from "node:url";
import { closeDatabase, createDatabase } from "./db/client.ts";
import { runMigrations } from "./db/migrations.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 없습니다");
  process.exit(1);
}

// src/migrate.ts와 dist/migrate.js 모두 한 단계 위의 drizzle/ 폴더를 본다
const folder = fileURLToPath(new URL("../drizzle", import.meta.url));
const db = createDatabase(url, (error) => console.error("DB 연결 오류:", error.message));
try {
  const applied = await runMigrations(db, folder);
  console.log(applied.length > 0 ? `마이그레이션 적용: ${applied.join(", ")}` : "적용할 마이그레이션 없음");
} finally {
  await closeDatabase(db);
}
