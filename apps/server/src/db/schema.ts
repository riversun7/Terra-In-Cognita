// DB 표 정의 — 원본은 여기. 바꾼 뒤 `pnpm --filter @terra/server db:generate`로 마이그레이션을 만든다.
// 적용된 마이그레이션(apps/server/drizzle/)은 고치지 않고 새로 추가만 한다 (docs/PROTECTED.md).
// Drizzle 1.0 RC에는 열 이름 자동 변환(casing) 설정이 없어서 열 이름을 직접 적는다.
import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** 기기 오류 기록 (PLAN 9.5 "기기 오류 수집"). 기기가 보낸 오류를 받은 그대로 남긴다. */
export const clientErrors = pgTable("client_errors", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  /** 앱 빌드 이름 (APP_BUILD) */
  clientBuild: text("client_build").notNull(),
  /** 오류 종류: error(일반 오류), rejection(처리 안 된 Promise 거부) 등 */
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  stack: text("stack"),
  /** 오류가 난 화면 경로 */
  page: text("page"),
  userAgent: text("user_agent"),
});
