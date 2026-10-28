// DB 표 정의 — 원본은 여기. 바꾼 뒤 `pnpm --filter @terra/server db:generate`로 마이그레이션을 만든다.
// 적용된 마이그레이션(apps/server/drizzle/)은 고치지 않고 새로 추가만 한다 (docs/PROTECTED.md).
// Drizzle 1.0 RC에는 열 이름 자동 변환(casing) 설정이 없어서 열 이름을 직접 적는다.
import type { PerfReport } from "@terra/protocol";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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

/** 기기 성능 요약 (PLAN 9.5 텔레메트리, S1 측정 기준: 프레임 시간 p95·메모리). 보이는 동안 1분마다 1건. */
export const clientPerfSamples = pgTable("client_perf_samples", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  clientBuild: text("client_build").notNull(),
  page: text("page"),
  userAgent: text("user_agent"),
  /** 측정 구간(초). 화면이 숨겨진 시간은 빠진다 */
  windowSec: real("window_sec").notNull(),
  frames: integer("frames").notNull(),
  fps: real("fps").notNull(),
  frameP50Ms: real("frame_p50_ms").notNull(),
  frameP95Ms: real("frame_p95_ms").notNull(),
  frameMaxMs: real("frame_max_ms").notNull(),
  /** 50ms를 넘긴 프레임 수 */
  longFrames: integer("long_frames").notNull(),
  memoryMb: real("memory_mb"),
  /** 화면 크기, 픽셀 비율, 코어 수 등 */
  device: jsonb("device").$type<PerfReport["device"]>().notNull(),
});

// ── 인증(Better Auth) 표 — docs/adr/2026-10-28-auth-and-accounts.md ──────────────────────────────
// Better Auth는 속성 이름(emailVerified 등)으로 열을 찾는다. 그래서 속성 이름은 Better Auth 필드 이름 그대로,
// 열 이름은 snake_case로 적는다. 시작할 때 이 정의를 Better Auth 기대값과 비교한다(src/auth/auth.test.ts).
// 기본 키는 DB가 만드는 UUID(generateId: "uuid" → Better Auth는 id를 보내지 않는다).

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** 계정. username·role·banned 등은 username·admin 플러그인 열 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 입력한 모양의 로그인 아이디(표시용). 다른 플레이어에게 보이지 않는다 */
    name: text("name").notNull(),
    /** 항상 서버가 만든 `<UUID>@id.placeholder.invalid`(메일이 갈 수 없는 주소). 복구 이메일은 account_recovery */
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** 로그인 아이디 키(소문자, 영문·숫자·_ 3~20자). 바꿀 수 없다 */
    username: text("username").notNull().unique(),
    /** 역할 목록(쉼표로 구분, 예: "player,admin") */
    role: text("role").notNull().default("player"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
  },
  (table) => [check("users_username_format", sql`${table.username} ~ '^[a-z0-9_]{3,20}$'`)],
);

/** 로그인 세션. 쿠키에는 서명한 token만 간다 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 관리자 대리 로그인(쓰지 않음, Better Auth 기대 열) */
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/** 로그인 수단. 비밀번호 로그인은 provider_id "credential", password는 scrypt 해시 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

/** 확인용 일회성 값(메일 확인 등). 지금은 쓰지 않지만 Better Auth 기본 표 */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

/**
 * 비밀번호 찾기용 복구 이메일(확인하지 않은 주소). Better Auth가 모르는 표라 세션 응답에 섞이지 않는다.
 * 소문자로 저장한다. 여러 계정이 같은 이메일을 써도 된다(고유 제약 없음).
 */
export const accountRecovery = pgTable(
  "account_recovery",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "account_recovery_email_format",
      sql`${table.email} = lower(${table.email}) and length(${table.email}) between 3 and 254`,
    ),
  ],
);

/** 감사 기록의 행위자 종류 */
export const AUDIT_ACTOR_KINDS = ["user", "admin", "cli", "system"] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];

/**
 * 감사 기록(PLAN 4.8). 추가만 한다 — UPDATE·DELETE·TRUNCATE는 DB 트리거가 막는다(마이그레이션 audit_log_append_only).
 * 외래 키를 두지 않는다: 대상 계정이 지워져도 기록은 남아야 한다. 비밀번호·토큰·이메일은 넣지 않는다.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorKind: text("actor_kind").$type<AuditActorKind>().notNull(),
    actorId: uuid("actor_id"),
    /** 예: account.create, account.password_reset, account.set_roles, cli.create_user */
    action: text("action").notNull(),
    targetId: uuid("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    meta: jsonb("meta"),
  },
  (table) => [
    check("audit_log_actor_kind", sql`${table.actorKind} in ('user', 'admin', 'cli', 'system')`),
    index("audit_log_target_id_idx").on(table.targetId),
  ],
);

/**
 * 화면 설정(계정) — 사용자당 한 줄: 테마, 기기 설정 따르기, 언어(docs/adr/2026-10-28-design-system.md).
 * null은 "정하지 않음"(기기 규칙을 따른다). 목록(@terra/shared THEMES·LOCALES)은 검사 조건에 넣지 않는다:
 * 더 새 버전이 저장한 값도 옛 버전 앱이 그대로 읽게 한다(모르는 값은 읽을 때 null로 본다).
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
  },
  (table) => [
    check("user_settings_theme_format", sql`${table.theme} ~ '^[a-z][a-z0-9_]{0,31}$'`),
    check("user_settings_locale_format", sql`${table.locale} ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$'`),
  ],
);

/** Better Auth Drizzle 어댑터에 넘기는 표 (usePlural: 모델 이름 + s) */
export const authSchema = { users, sessions, accounts, verifications };
