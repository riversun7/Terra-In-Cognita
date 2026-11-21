// 계정 설정 표(user_settings) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로 둔다). 세계 밖 표라 세계 새로 시작(reset-world)에서 남긴다
// (src/cli/resetWorld.ts WORLD_RESET_KEEP).
import type { SettingsObject } from "@terra/shared";
import { sql } from "drizzle-orm";
import { boolean, check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./schema.ts";

/** schema.ts updatedAt과 같은 열(그 파일을 모듈 평가 중에 부르지 않으려고 — 다시 내보내기 고리는 users를 늦게만 읽는다) */
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/**
 * 계정 설정 — 사용자당 한 줄: 테마, 기기 설정 따르기, 언어(docs/adr/2026-10-28-design-system.md), 메뉴·홈(ADR 2026-10-29-app-shell 5절).
 * null은 "정하지 않음"(기기 규칙을 따른다). 목록(@terra/shared THEMES·LOCALES)은 검사 조건에 넣지 않는다:
 * 더 새 버전이 저장한 값도 옛 버전 앱이 그대로 읽게 한다(모르는 값은 읽을 때 null로 본다).
 * nav·home은 묶음마다 jsonb 하나다(모양을 모르는 JSON 객체, 입력 검사는 src/trpc/settings.ts). 열 더하기만 한 마이그레이션이라
 * 직전 판 서버는 이 두 열을 모른 채 그대로 읽고 쓴다.
 */
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    theme: text("theme"),
    followSystem: boolean("follow_system").notNull().default(false),
    locale: text("locale"),
    updatedAt: updatedAt(),
    /** 메뉴 설정(@terra/shared navigation.ts의 nav). null이면 정하지 않음 */
    nav: jsonb("nav").$type<SettingsObject>(),
    /** 홈 설정(@terra/shared/dashboard의 home). null이면 정하지 않음 */
    home: jsonb("home").$type<SettingsObject>(),
    /**
     * 물류센터 자동 맡기기(기획 D-576 "설정으로 자동 맡기기", 기획 대조 2272 — 계정 설정, docs/adr/2026-11-16-logistics-center.md "바뀜 (haul-2)"). 켜면 via
     * 없는 운반 명령이 내 운반꾼이 없을 때 같은 도시의 가장 싼 물류센터에 맡긴다. 읽기·쓰기는 src/logistics/autoHaul.ts(설정 화면 tRPC 따로)
     */
    autoHaul: boolean("auto_haul").notNull().default(false),
  },
  (table) => [
    check("user_settings_theme_format", sql`${table.theme} ~ '^[a-z][a-z0-9_]{0,31}$'`),
    check("user_settings_locale_format", sql`${table.locale} ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$'`),
  ],
);
