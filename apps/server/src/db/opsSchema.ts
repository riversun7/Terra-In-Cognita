// 운영 권한 체크박스 표(docs/adr/2026-11-08-operator-console.md) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로 둔다).
// 계정마다 역할 기본(@terra/shared OPS_ROLE_DEFAULTS) 위에 더 준 운영 권한. 빼기는 없다(역할 기본은 늘 가진다).
// 세계 밖 표(계정 설정)라 시험 세계 새로 시작(reset-world)에서 남긴다(src/cli/resetWorld.ts 남길 표 목록).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  bytea,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { factions, users } from "./schema.ts";

export const opsGrants = pgTable(
  "ops_grants",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 운영 권한 ID 목록(@terra/shared OPS_PERMISSIONS). 모르는 ID는 읽을 때 버린다(더 새 판이 쓴 값) */
    permissions: text("permissions").array().notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    /** 마지막으로 바꾼 운영자(감사 기록에도 남는다). 계정이 지워져도 남게 외래 키를 두지 않는다 */
    updatedBy: uuid("updated_by"),
  },
  (table) => [check("ops_grants_size", sql`cardinality(${table.permissions}) <= 64`)],
);

/**
 * 운영 스위치(docs/adr/2026-11-08-operator-roles-log-switch.md): 줄이 없으면 꺼짐. id = @terra/shared OPS_SWITCHES(모르는 ID는 서버가 무시한다).
 * 세계 밖 표라 시험 세계 새로 시작에서 남긴다
 */
export const opsSwitches = pgTable(
  "ops_switches",
  {
    id: text("id").primaryKey(),
    enabled: boolean("enabled").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [check("ops_switches_id_format", sql`${table.id} ~ '^[a-z][a-z0-9_]{1,47}$'`)],
);

/**
 * 세력 정체성(docs/adr/2026-11-09-faction-profiles.md): 이름·약어·시그니처 컬러. 세력이 처음 보일 때 서버가 한 번 정하고(고정 NPC 나라 = 팩
 * 국가 프리셋, 그 밖 = 기본값) 그 뒤로는 관리자가 고칠 때만 바뀐다. 약어는 세계 안에서 하나(대소문자 무시).
 * 세계 표라 시험 세계 새로 시작(reset-world)에서 세력과 함께 지운다. 세력 행이 지워지면 함께 지운다
 */
export const factionProfiles = pgTable(
  "faction_profiles",
  {
    factionId: bigint("faction_id", { mode: "number" })
      .primaryKey()
      .references(() => factions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    color: text("color").notNull(),
    /** 처음 값이 어디서 왔나: preset | default. 관리자가 고치면 admin */
    source: text("source").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    uniqueIndex("faction_profiles_short_idx").on(sql`lower(${table.shortName})`),
    check("faction_profiles_name", sql`char_length(${table.name}) between 1 and 24`),
    check("faction_profiles_short", sql`char_length(${table.shortName}) between 2 and 5`),
    check("faction_profiles_color", sql`${table.color} ~ '^#[0-9a-f]{6}$'`),
    // player = 가문을 창설한 플레이어가 정한 값(faction_identities와 같이 바뀐다 — docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)")
    check("faction_profiles_source", sql`${table.source} in ('preset', 'default', 'admin', 'player')`),
  ],
);

/**
 * 화폐 표시(같은 ADR): 원장 자산 코드(cur:<코드>, 기준 통화)마다 이름·기호·3글자 약어. 약어는 세계 안에서 하나.
 * 처음 쓰일 때 서버가 정하고(팩 국가 프리셋 화폐 칸, 없으면 기본값) 관리자가 고친다. 세계 표라 시험 세계 새로 시작에서 지운다
 */
export const currencyProfiles = pgTable(
  "currency_profiles",
  {
    asset: text("asset").primaryKey(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    ticker: text("ticker").notNull().unique(),
    source: text("source").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    check("currency_profiles_name", sql`char_length(${table.name}) between 1 and 24`),
    check("currency_profiles_symbol", sql`char_length(${table.symbol}) between 1 and 3`),
    check("currency_profiles_ticker", sql`${table.ticker} ~ '^[A-Z]{3}$'`),
    check("currency_profiles_source", sql`${table.source} in ('preset', 'default', 'admin')`),
  ],
);

/**
 * 플레이어 세력 정체성(docs/adr/2026-11-11-faction-identity.md): 플레이어가 이끄는 세력(지금은 자기 소유 주체 — 계정마다 하나)의 이름·약어·
 * 시그니처 컬러·마크. 플레이어가 "세력 정체성 정하기"에서 직접 정한다(NPC 국가는 faction_profiles + 팩 프리셋).
 * - 이름은 서버에서 하나(name_key = 소문자 열쇠), 약어도 하나(대소문자 무시). NPC 세력 이름·약어와 겹치는지는 서버가 넣기 전에 본다.
 * - 마크: 만든 마크 사양(네 칸)은 늘 있고, 올린 그림(256 × 256 PNG — 기기가 잘라 만든 것)은 이 줄에 한 장만 둔다(다시 올리면 덮어쓰고,
 *   지우거나 운영자가 내리면 비운다 — 가리키는 곳이 없는 그림이 남지 않는다). 원본 파일은 받지 않는다.
 * - upload_blocked: 운영자가 이 계정의 그림 올리기를 막았다. notice_*: 운영자가 마크를 내렸을 때 주인에게 보이는 알림(확인하면 비운다).
 * 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다. 계정이 지워지면 함께 지운다
 */
export const factionIdentities = pgTable(
  "faction_identities",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull().unique(),
    shortName: text("short_name").notNull(),
    color: text("color").notNull(),
    emblemShape: text("emblem_shape").notNull(),
    emblemDivision: text("emblem_division").notNull(),
    emblemCharge: text("emblem_charge").notNull(),
    emblemScheme: smallint("emblem_scheme").notNull(),
    emblemPng: bytea("emblem_png"),
    /** PNG 바이트의 SHA-256(16진수 소문자) — 그림 길 /api/nation-emblems/<sha256>.png의 주소 */
    emblemSha256: text("emblem_sha256"),
    emblemBytes: integer("emblem_bytes"),
    emblemUploadedAtMs: bigint("emblem_uploaded_at_ms", { mode: "number" }),
    uploadBlocked: boolean("upload_blocked").notNull().default(false),
    noticeKind: text("notice_kind"),
    noticeReason: text("notice_reason"),
    noticeAtMs: bigint("notice_at_ms", { mode: "number" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    /** 이름·약어를 마지막으로 정한 시각(다시 바꾸기까지 기다리는 시간의 기준, D-328) */
    nameChangedAtMs: bigint("name_changed_at_ms", { mode: "number" }).notNull(),
    /**
     * 이 정체성으로 창설한 가문(세력 행, kind = player — 질문 926 나). null = 정체성만 저장하고 창설을 마치지 못함. 앞으로 이 줄의 열쇠는
     * 가문이다(user_id = 창설자). 계정 열쇠는 직전 판 앱이 읽어서 남긴다 — 다음 배포에서 정리(AGENTS.md 마이그레이션 규칙)
     */
    factionId: bigint("faction_id", { mode: "number" })
      .unique()
      .references(() => factions.id, { onDelete: "set null" }),
    foundedAtMs: bigint("founded_at_ms", { mode: "number" }),
    /** 운영자가 올린 마크를 내린 횟수(설정 칸 house_takedown_block 이상이면 올리기를 저절로 막는다, 질문 934 나) */
    takedownCount: integer("takedown_count").notNull().default(0),
    /** 운영자가 가문 이름을 되돌린 횟수(설정 칸 house_name_reset_block 이상이면 이름 바꾸기를 저절로 막는다, 질문 1006 나) */
    nameResetCount: integer("name_reset_count").notNull().default(0),
    /** 이름·약어 바꾸기를 막았나(자동 막기 또는 운영자 — 운영자가 푼다) */
    renameBlocked: boolean("rename_blocked").notNull().default(false),
  },
  (table) => [
    uniqueIndex("faction_identities_short_idx").on(sql`lower(${table.shortName})`),
    index("faction_identities_sha256").on(table.emblemSha256),
    check("faction_identities_name", sql`char_length(${table.name}) between 1 and 24`),
    check("faction_identities_short", sql`char_length(${table.shortName}) between 2 and 5`),
    check("faction_identities_color", sql`${table.color} ~ '^#[0-9a-f]{6}$'`),
    check("faction_identities_scheme", sql`${table.emblemScheme} between 0 and 15`),
    check(
      "faction_identities_upload",
      sql`num_nonnulls(${table.emblemPng}, ${table.emblemSha256}, ${table.emblemBytes}, ${table.emblemUploadedAtMs}) in (0, 4)`,
    ),
    check("faction_identities_sha256_format", sql`${table.emblemSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "faction_identities_bytes",
      sql`${table.emblemBytes} is null or (${table.emblemBytes} > 0 and ${table.emblemBytes} <= 200000)`,
    ),
    check(
      "faction_identities_notice",
      sql`${table.noticeKind} is null or ${table.noticeKind} = 'emblem_removed'`,
    ),
  ],
);
