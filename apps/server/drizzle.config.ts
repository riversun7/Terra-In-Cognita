// drizzle-kit 설정 — 표 정의(src/db/schema.ts)와 마이그레이션 폴더(drizzle/)
// 마이그레이션 만들기: pnpm --filter @terra/server db:generate (DB 접속 없이 정의만 비교한다)
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
