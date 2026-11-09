// 운영 권한 체크박스 표(docs/adr/2026-11-08-operator-console.md) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로 둔다).
// 계정마다 역할 기본(@terra/shared OPS_ROLE_DEFAULTS) 위에 더 준 운영 권한. 빼기는 없다(역할 기본은 늘 가진다).
// 세계 밖 표(계정 설정)라 시험 세계 새로 시작(reset-world)에서 남긴다(src/cli/resetWorld.ts 남길 표 목록).
import { sql } from "drizzle-orm";
import { bigint, boolean, check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    check("faction_profiles_source", sql`${table.source} in ('preset', 'default', 'admin')`),
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
