// DB 표 정의 — 원본은 여기. 바꾼 뒤 `pnpm --filter @terra/server db:generate`로 마이그레이션을 만든다.
// 적용된 마이그레이션(apps/server/drizzle/)은 고치지 않고 새로 추가만 한다 (docs/PROTECTED.md).
// Drizzle 1.0 RC에는 열 이름 자동 변환(casing) 설정이 없어서 열 이름을 직접 적는다.
import type { PerfReport } from "@terra/protocol";
import type { PlanetLibraryBase, SettingsObject, StarSystemDefinition } from "@terra/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  bytea,
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  smallint,
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

/**
 * 행성 보관함 — 팀 공용 목록(dev·admin 모두 같은 목록, 만든 사람 표시). [저장]·[다른 이름으로 저장]만 쓴다(ADR 38 "바뀜:
 * 행성 보관함"). id는 바뀌지 않는다(나중 항성계 편집기가 가리킨다). 지우기는 표시만 한다(deleted_at, 줄은 남는다: 가리키던 것이
 * "지운 행성"으로 남게). revision은 행성마다 1부터 [저장]마다 1씩(id를 다시 쓰지 않아 띄엄띄엄일 까닭이 없다)
 */
export const planetLibrary = pgTable(
  "planet_library",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 이름(자유 글, 앞뒤 빈칸 뗌, 1~60 코드 포인트 — @terra/shared normalizePlanetLibraryName) */
    name: text("name").notNull(),
    /** 시작한 곳({ kind: "pack", id: 팩 행성 ID }. 나중에 표본 "template") */
    base: jsonb("base").$type<PlanetLibraryBase>().notNull(),
    /** 행성 정의(콘텐츠 팩 행성 항목 모양, 시드 포함). 지금 판의 정의 = 가장 최근 판 기록의 정의 */
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    revision: integer("revision").notNull(),
    /** 만든 사람(계정을 지우면 비운다: 행성은 팀 것이라 남긴다) */
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** 마지막으로 저장(또는 이름을 바꾼) 사람 */
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** 지운 때·지운 사람(지우지 않았으면 null). 지운 행성은 목록·열기에서 빠진다 */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("planet_library_updated_idx").on(table.updatedAt),
    check("planet_library_revision_positive", sql`${table.revision} >= 1`),
    check("planet_library_name_length", sql`char_length(${table.name}) between 1 and 60`),
  ],
);

/** 보관함 행성의 저장 판 — [저장]마다 한 줄(자동 저장 없음). 모두 남긴다(저장은 손으로 하는 일이라 드물다) */
export const planetLibraryVersions = pgTable(
  "planet_library_versions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    planetId: uuid("planet_id")
      .notNull()
      .references(() => planetLibrary.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    /** 정의 크기(바이트, @terra/shared planetDraftEntryBytes). 판 목록이 정의를 읽지 않게 저장할 때 잰다 */
    bytes: integer("bytes").notNull(),
    savedBy: uuid("saved_by").references(() => users.id, { onDelete: "set null" }),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("planet_library_versions_planet_revision_idx").on(table.planetId, table.revision),
    check("planet_library_versions_revision_positive", sql`${table.revision} >= 1`),
    check("planet_library_versions_bytes_nonnegative", sql`${table.bytes} >= 0`),
  ],
);

// ── S3 월드 저장 — docs/adr/2026-10-31-s3-server-stage.md 1·4절 ─────────────────────────────────────
// DB가 원본이고 서버 메모리는 캐시다(ADR 6). 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나가 0.25초마다
// 묶어 커밋한다. 그래서 ID는 DB가 아니라 서버가 정한다(부팅 때 가장 큰 값 + 1부터, 쓰는 프로세스는 하나다).
// 시각은 서버 ms 정수(int8)다. 예약은 따로 된 표 없이 주인 행의 예정 시각 열(유닛의 경로 도착·wake_at_ms)이다.

/**
 * 행성 ID·영역(기획 D-372: 행성 ID와 영역 4종은 처음부터 둔다). 셀 키는 행성 안에서만 하나라서(ADR 2026-10-29-cell-key-layout)
 * 2차맵을 가리키는 표는 (planet_id, map_key)로 읽는다. 기본값은 S1·S3 시험 2차맵이 놓인 시험 행성(콘텐츠 팩 s2_test_planet)
 * — 열 더하기만 한 마이그레이션이라 직전 판 앱이 이 열을 모른 채 넣어도 기본값이 들어간다.
 * 영역: space(우주)·sky(하늘)·land(육지)·sea(해상). 지금 유닛·건물은 모두 land다.
 */
export const DEFAULT_WORLD_PLANET_ID = "s2_test_planet";
export const WORLD_DOMAINS = ["space", "sky", "land", "sea"] as const;
export type WorldDomain = (typeof WORLD_DOMAINS)[number];
const planetIdColumn = () => text("planet_id").notNull().default(DEFAULT_WORLD_PLANET_ID);
const domainColumn = () => text("domain").$type<WorldDomain>().notNull().default("land");

/** 세력(최소) — 소유와 시야 묶음에만 쓴다. 가입·봉신·외교는 세력 시스템(기획 Step 4-6)이 넓힌다 */
export const factions = pgTable(
  "factions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    /** npc | player */
    kind: text("kind").notNull(),
    /** 위 세력(봉신 관계). 최상위 세력이 시야 묶음이다(D-250) */
    parentId: bigint("parent_id", { mode: "number" }).references((): AnyPgColumn => factions.id),
    /** 서버가 찾는 이름(예: s3_test_npc). 유저 세력은 비운다 */
    code: text("code").unique(),
    createdAt: createdAt(),
  },
  (table) => [
    check("factions_kind", sql`${table.kind} in ('npc', 'player')`),
    check("factions_code_format", sql`${table.code} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/** 사용자 → 세력(사용자당 한 줄). S3는 시험 명령으로만 넣는다 */
export const factionMembers = pgTable("faction_members", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  factionId: bigint("faction_id", { mode: "number" })
    .notNull()
    .references(() => factions.id),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 소유 주체 = 사용자 하나 또는 세력 하나. 정산은 주체 단위다(ADR 4절) */
export const worldOwners = pgTable(
  "world_owners",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .unique()
      .references(() => users.id),
    factionId: bigint("faction_id", { mode: "number" })
      .unique()
      .references(() => factions.id),
    /** 마지막 정산 시각. 정산 결과(원장 항목)와 같은 커밋에 쓴다(두 번 적용 없음, 불변 조건 I6) */
    settledAtMs: bigint("settled_at_ms", { mode: "number" }).notNull(),
    /** 내지 못한 유지비 횟수[임시] */
    upkeepArrears: integer("upkeep_arrears").notNull().default(0),
  },
  (table) => [check("world_owners_one_kind", sql`num_nonnulls(${table.userId}, ${table.factionId}) = 1`)],
);

/** 2차맵 유닛. 위치는 저장하지 않고 경로·출발 시각·속도로 계산한다(ADR 5) */
export const worldUnits = pgTable(
  "world_units",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" })
      .notNull()
      .references(() => worldOwners.id),
    /** 유닛 종류 코드(src/world/unitKinds.ts. 0 시험 봇, 1 시험 일꾼) */
    kind: smallint("kind").notNull(),
    size: smallint("size").notNull(),
    speed: integer("speed").notNull(),
    mapKey: bigint("map_key", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    domain: domainColumn(),
    /** 꺾이는 점 [x0, y0, x1, y1, …] (고정소수점) */
    path: integer("path").array().notNull(),
    departAtMs: bigint("depart_at_ms", { mode: "number" }).notNull(),
    /** 쉬기 끝 예약(시험 봇). 없으면 null */
    wakeAtMs: bigint("wake_at_ms", { mode: "number" }),
    /** 판단 횟수 — 봇 난수를 (유닛, 횟수)로 뽑아 다시 켜도 이어진다 */
    aiStep: integer("ai_step").notNull().default(0),
    /** 정산 직무 상태(packages/sim settle): 직무 종류, 일·쉼, 지금 주기 안 시간, 피로 */
    job: smallint("job").notNull().default(0),
    jobPhase: smallint("job_phase").notNull().default(0),
    jobProgressMs: integer("job_progress_ms").notNull().default(0),
    fatigue: integer("fatigue").notNull().default(0),
  },
  (table) => [
    index("world_units_owner_idx").on(table.ownerId),
    index("world_units_map_idx").on(table.mapKey),
    check("world_units_size", sql`${table.size} between 1 and 3`),
    check("world_units_speed", sql`${table.speed} > 0`),
    check("world_units_path", sql`cardinality(${table.path}) >= 2 and cardinality(${table.path}) % 2 = 0`),
    check("world_units_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
    check("world_units_domain", sql`${table.domain} in ('space', 'sky', 'land', 'sea')`),
  ],
);

/** 2차맵 건물(칸 직사각형) */
export const worldBuildings = pgTable(
  "world_buildings",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    mapKey: bigint("map_key", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    domain: domainColumn(),
    ownerId: bigint("owner_id", { mode: "number" }).references(() => worldOwners.id),
    x: smallint("x").notNull(),
    y: smallint("y").notNull(),
    width: smallint("width").notNull(),
    height: smallint("height").notNull(),
    rotation: smallint("rotation").notNull(),
  },
  (table) => [
    index("world_buildings_map_idx").on(table.mapKey),
    check("world_buildings_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
    check("world_buildings_domain", sql`${table.domain} in ('space', 'sky', 'land', 'sea')`),
  ],
);

/** 접속 상태(D-136): 모든 연결이 끊긴 시각. 접속 중이면 null */
export const worldPresence = pgTable("world_presence", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  offlineSinceMs: bigint("offline_since_ms", { mode: "number" }),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
});

/**
 * 탐사 기록(ADR 26, D-143·D-152): (사용자, 행성, 2차맵)마다 시야 칸 32×32 비트 = 128바이트.
 * 기본 키는 아직 (user_id, map_key)다: 직전 판 앱이 그 열쇠로 덮어쓰기(on conflict)를 하기 때문이다. 행성이 둘 이상이 되기 전에
 * 다음 마이그레이션에서 (user_id, planet_id, map_key)로 바꾼다(ADR 22 세 단계: 더하기 → 코드 → 정리).
 */
export const worldExploration = pgTable(
  "world_exploration",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mapKey: bigint("map_key", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    cells: bytea("cells").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mapKey] }),
    check("world_exploration_cells", sql`octet_length(${table.cells}) = 128`),
    check("world_exploration_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/**
 * 2차맵 고정본(PLAN 5.5, ADR 2026-10-31-second-map-from-planet 6절): 플레이어가 처음 손댄 2차맵(건설 등)의 그때 지형 파일.
 * 그 뒤 생성기가 바뀌어도 이 2차맵은 고정본에서 읽는다. 처음 한 번만 쓰고 고치지 않는다(on conflict do nothing).
 * terrain_version = 지형 주소 판 표지(2차맵 생성기 판.행성 생성기 판.정의 해시 8자.소품 규칙 해시), tctr_gzip = TCTR 2판 gzip.
 * 새 표라 직전 판 앱은 이 표를 모른 채 그대로 돈다.
 */
export const secondMapPins = pgTable(
  "second_map_pins",
  {
    planetId: text("planet_id").notNull(),
    mapKey: bigint("map_key", { mode: "number" }).notNull(),
    terrainVersion: text("terrain_version").notNull(),
    tctrGzip: bytea("tctr_gzip").notNull(),
    pinnedAtMs: bigint("pinned_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planetId, table.mapKey] }),
    check("second_map_pins_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
    check("second_map_pins_size", sql`octet_length(${table.tctrGzip}) between 32 and 4194304`),
  ],
);

/** 서버 생존 시각(한 줄). kill -9 뒤 접속 중이던 사용자를 이 시각에 끊긴 것으로 친다(ADR 2절) */
export const worldHeartbeat = pgTable(
  "world_heartbeat",
  {
    id: smallint("id").primaryKey(),
    bootId: uuid("boot_id").notNull(),
    aliveAtMs: bigint("alive_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [check("world_heartbeat_single", sql`${table.id} = 1`)],
);

// 원장(ADR 8, 이 단계 ADR 4절): 복식부기. 화폐와 쌓이는 자원을 자산 코드로 같은 원장에 적는다.
// 거래 하나의 항목 합은 자산마다 0이다. 거래·항목은 추가만 한다(마이그레이션의 트리거가 고치기·지우기를 막는다).
// 금액은 최소 단위 정수(bigint 모드 → JS BigInt).

/** 계정 = (소유 주체, 자산) 또는 시스템 계정(발행·소멸·매장량). balance는 항목 합의 캐시다(불변 조건 I2) */
export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" }).references(() => worldOwners.id),
    systemCode: text("system_code").unique(),
    asset: text("asset").notNull(),
    balance: bigint("balance", { mode: "bigint" }).notNull().default(0n),
  },
  (table) => [
    uniqueIndex("ledger_accounts_owner_asset_idx").on(table.ownerId, table.asset),
    check("ledger_accounts_one_kind", sql`num_nonnulls(${table.ownerId}, ${table.systemCode}) = 1`),
    check("ledger_accounts_owner_nonnegative", sql`${table.systemCode} is not null or ${table.balance} >= 0`),
    check("ledger_accounts_asset_format", sql`${table.asset} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/** 원장 거래. idempotency_key가 있으면 한 번만 들어간다(예: 유지비 = 주체·경계 시각) */
export const ledgerTransactions = pgTable("ledger_transactions", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  /** 예: issue, job_output, upkeep */
  kind: text("kind").notNull(),
  atMs: bigint("at_ms", { mode: "number" }).notNull(),
  idempotencyKey: text("idempotency_key").unique(),
});

/** 원장 항목. 같은 거래의 항목 합은 자산마다 0(불변 조건 I1) */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    txId: bigint("tx_id", { mode: "number" })
      .notNull()
      .references(() => ledgerTransactions.id),
    accountId: bigint("account_id", { mode: "number" })
      .notNull()
      .references(() => ledgerAccounts.id),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
  },
  (table) => [
    index("ledger_entries_tx_idx").on(table.txId),
    index("ledger_entries_account_idx").on(table.accountId),
    check("ledger_entries_amount_nonzero", sql`${table.amount} <> 0`),
  ],
);

/** 복귀 요약 마지막 확인 시각(D-6014, ADR 37 8절) */
export const summaryAcks = pgTable("summary_acks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  ackedAtMs: bigint("acked_at_ms", { mode: "number" }).notNull(),
});

/**
 * 항성계 보관함 — 개발자 항성계 편집기의 팀 공용 목록(ADR 2026-10-31-star-system-editor). 행성 보관함과 같은 모양:
 * [저장]만 쓰고(판 기록 표는 두지 않는다), 판으로 충돌을 보고, 지우기는 표시만 한다. 게임 실행에는 쓰지 않는다(기획 질문 100~103)
 */
export const starSystems = pgTable(
  "star_systems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 이름(1~60 코드 포인트 — @terra/shared normalizeStarSystemName) */
    name: text("name").notNull(),
    /** 항성계 정의(항성 종류, 궤도 목록 — @terra/shared parseStarSystemDefinition). 행성은 보관함 행성 id로 가리킨다 */
    definition: jsonb("definition").$type<StarSystemDefinition>().notNull(),
    revision: integer("revision").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("star_systems_updated_idx").on(table.updatedAt),
    check("star_systems_revision_positive", sql`${table.revision} >= 1`),
    check("star_systems_name_length", sql`char_length(${table.name}) between 1 and 60`),
  ],
);

/** Better Auth Drizzle 어댑터에 넘기는 표 (usePlural: 모델 이름 + s) */
export const authSchema = { users, sessions, accounts, verifications };
