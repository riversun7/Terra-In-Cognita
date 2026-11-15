// 플레이어 가문 표(질문 926~935 답, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)") — schema.ts가 다시 내보낸다
// (그 파일 줄 수 때문에 따로 둔다). 둘 다 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다).
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factions, users } from "./schema.ts";

/**
 * 가문 구성원(D-216 이중 소속): 사용자 → 가문(세력 행, kind = player). 사용자마다 한 가문. 나라 소속(시민권)은 그대로 faction_members·
 * cyborgs.faction_id다 — 같은 나라 시야 공유(D-250)는 이 표를 보지 않는다. 가문원은 그 가문 나라(factions.born_of)의 시민만이다(질문 985 다 —
 * 가입은 house_requests, 나라가 달라지면 빠진다 983 가)
 */
export const houseMembers = pgTable(
  "house_members",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    /** leader(가문장) | member */
    role: text("role").notNull(),
    joinedAtMs: bigint("joined_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("house_members_faction_idx").on(table.factionId),
    check("house_members_role", sql`${table.role} in ('leader', 'member')`),
  ],
);

/**
 * 가문 마크·이름 신고(질문 930 나): 신고한 계정마다 한 줄(같은 가문을 두 번 세지 않는다). 운영자가 넘기거나 마크를 내리면 그 가문 줄을 지운다.
 * 하루 횟수 제한(설정 칸 house_report_daily)은 created_at_ms로 센다
 */
export const houseReports = pgTable(
  "house_reports",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("house_reports_once_idx").on(table.factionId, table.reporterId),
    index("house_reports_reporter_idx").on(table.reporterId, table.createdAtMs),
  ],
);

/**
 * 가문 초대·가입 신청(질문 985 다): 가문 × 사람마다 한 줄(초대와 신청이 맞으면 바로 든다 — 줄을 지운다). 답하거나 거두거나 expires_at_ms가
 * 지나면 지운다(지난 줄은 명령마다 지우고 조회는 거른다). kind: invite(가문장 → 그 사람) | apply(그 사람 → 가문)
 */
export const houseRequests = pgTable(
  "house_requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    /** 초대받은 사람 또는 신청한 사람 */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** 보낸 사람(초대 = 가문장, 신청 = 그 사람) */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    expiresAtMs: bigint("expires_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("house_requests_pair_idx").on(table.factionId, table.userId),
    index("house_requests_user_idx").on(table.userId),
    index("house_requests_expires_idx").on(table.expiresAtMs),
    check("house_requests_kind", sql`${table.kind} in ('invite', 'apply')`),
  ],
);

/**
 * 가문 소식(@terra/shared/house HOUSE_NOTICE_KINDS): 받은 사람마다 한 줄, 확인하면 지운다. 가문 이름은 그때 값을 적어 둔다(가문 이름이 바뀌거나
 * 가문이 사라져도 읽힌다). 처리할 일(house_notice)과 세력 화면 "내 가문" 칸이 읽는다
 */
export const houseNotices = pgTable(
  "house_notices",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    factionId: bigint("faction_id", { mode: "number" }).references(() => factions.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    houseName: text("house_name").notNull(),
    /** 상대 사이보그 이름(그때 값) */
    otherName: text("other_name"),
    reason: text("reason"),
    count: integer("count").notNull().default(0),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("house_notices_user_idx").on(table.userId, table.createdAtMs),
    check("house_notices_reason", sql`char_length(${table.reason}) <= 200`),
  ],
);

/**
 * 가문 소속 도시(기획 D-565): 가문 행마다 한 줄. 가문은 소속 도시를 고르고 그 도시가 속한 나라(최상위 세력)의 가문이 된다 — 나라는
 * factions.born_of에 함께 적는다(시야 공유 D-250·가입 목록이 읽는다). 소속 도시는 세금 납부·랭킹 집계에 쓴다. 도시가 폐허가 되어
 * world_cities 행이 지워져도 남는다(외래 키 없음 — 가문 나라는 그대로, 가문장이 다시 고른다).
 * 마이그레이션이 이 표 전의 가문을 가문장 사이보그의 내 도시(cyborgs.start_city_id)로 채운다. 세계 표라 시험 세계 새로 시작에서 지운다
 */
export const houseHomes = pgTable("house_homes", {
  factionId: bigint("faction_id", { mode: "number" })
    .primaryKey()
    .references(() => factions.id, { onDelete: "cascade" }),
  cityId: bigint("city_id", { mode: "number" }).notNull(),
  /** 소속 도시를 마지막으로 정한 시각(창설 포함 — 다시 바꾸기 대기 house_home_wait_ms가 센다) */
  setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
});
