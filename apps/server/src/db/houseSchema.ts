// 플레이어 가문 표(질문 926~935 답, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)") — schema.ts가 다시 내보낸다
// (그 파일 줄 수 때문에 따로 둔다). 둘 다 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다).
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { factions, users } from "./schema.ts";

/**
 * 가문 구성원(D-216 이중 소속): 사용자 → 가문(세력 행, kind = player). 사용자마다 한 가문. 나라 소속(시민권)은 그대로 faction_members·
 * cyborgs.faction_id다 — 같은 나라 시야 공유(D-250)는 이 표를 보지 않는다. 지금은 창설자(leader)만 넣는다(가입 흐름은 다음 줄기)
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
