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
  pgSequence,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { PlanetDraftBase } from "../planetEditor/types.ts";

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

// ── 행성 편집기 초안 — docs/adr/2026-10-29-planet-editor-stage1.md 9절 ───────────────────────────────
// 사람마다·팩 행성마다 초안 하나와 그 판 기록(최근 50개). 초안 항목(entry)은 planets.json 항목 그대로(시드 포함)라
// 이 표 밖(감사 기록·로그)으로 내보내지 않는다. 쓰기·검사는 src/planetEditor/(store.ts·validate.ts).
// 행성 ID는 콘텐츠 ID 규칙만 검사 조건에 넣는다: 팩에 있는지는 앱이 본다(팩이 바뀌어도 옛 버전 앱이 그대로 읽게).

/**
 * 초안 판 번호 — 모든 초안이 함께 쓰는 번호(저장·되돌리기마다 다음 값). 한 번 쓴 번호는 다시 나오지 않는다:
 * 지운 뒤 다시 만든 초안도 옛 판 번호를 쓰지 않아서, 옛 판을 들고 있던 기기의 저장은 늘 CONFLICT다(ADR 38 WP-B).
 * 판 열(integer)에 맞춰 상한을 둔다. 다 쓰면 저장이 실패한다(한 기기가 쉬지 않고 2초마다 저장해도 약 136년)
 */
export const PLANET_DRAFT_REVISION_SEQ = "planet_draft_revision_seq";
export const planetDraftRevisionSeq = pgSequence(PLANET_DRAFT_REVISION_SEQ, {
  startWith: 1,
  minValue: 1,
  maxValue: 2_147_483_647,
  increment: 1,
  cache: 1,
  cycle: false,
});

/** 행성 초안 — (owner_id, planet_id)마다 하나. revision은 저장할 때마다 커진다(planet_draft_revision_seq, 띄엄띄엄) */
export const planetDrafts = pgTable(
  "planet_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 콘텐츠 팩 행성 ID */
    planetId: text("planet_id").notNull(),
    /** 지금 판(가장 최근 판 기록과 같다) */
    revision: integer("revision").notNull(),
    /** 초안을 시작한 공개본(팩 버전·정의 해시·생성기 판). 모르면 null(항목만 가져온 경우) */
    base: jsonb("base").$type<PlanetDraftBase>(),
    /** planets.json 항목 모양(시드 포함) */
    entry: jsonb("entry").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 마지막 저장 시각(저장하는 쪽이 now()로 쓴다) */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("planet_drafts_owner_planet_idx").on(table.ownerId, table.planetId),
    check("planet_drafts_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
    check("planet_drafts_revision_positive", sql`${table.revision} >= 1`),
  ],
);

/** 초안 판 기록 — 저장·되돌리기마다 한 줄. 초안마다 최근 50개만 남긴다(저장할 때 오래된 것을 지운다) */
export const planetDraftRevisions = pgTable(
  "planet_draft_revisions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => planetDrafts.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    entry: jsonb("entry").$type<Record<string, unknown>>().notNull(),
    base: jsonb("base").$type<PlanetDraftBase>(),
    /** 항목 크기(바이트, @terra/shared planetDraftEntryBytes). 판 목록이 항목을 읽지 않게 저장할 때 잰다 */
    bytes: integer("bytes").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("planet_draft_revisions_draft_revision_idx").on(table.draftId, table.revision),
    check("planet_draft_revisions_revision_positive", sql`${table.revision} >= 1`),
    check("planet_draft_revisions_bytes_nonnegative", sql`${table.bytes} >= 0`),
  ],
);

/** Better Auth Drizzle 어댑터에 넘기는 표 (usePlural: 모델 이름 + s) */
export const authSchema = { users, sessions, accounts, verifications };
