// 지도자끼리 조약 표(사용자 결정 D-588 — 질문 2497 가·나, 2498 기술 기본값, docs/adr/2026-11-21-diplomacy-treaties.md) — schema.ts가 다시 내보낸다.
// 모두 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다). 새 표만 더해서 직전 판 앱은 모른 채 돈다.
// 쓰는 곳은 apps/server/src/diplomacy/store.ts 하나다(서버가 하나라 외교 서비스가 의결 서비스와 같은 사슬에서 순서대로 쓴다).
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { factions } from "./schema.ts";
import { governanceAgendas } from "./governanceSchema.ts";

/**
 * 조약 하나(D-292 조항 카드 묶음). nation_a = 처음 제안한 나라, nation_b = 받은 나라(세력 행). author_nation = 지금 조항(revision)을 쓴 나라(맞제안이면 바뀐다).
 * clauses = 조항 목록(jsonb — [{kind, protectorNationId?, tributePm?}]), days = 조약 기간(날).
 * state = proposed | negotiating | active | expired | broken | declined | lapsed. author_ready = 지은이 나라가 받아들였다(비준 투표 가결·지도자 바로).
 * agenda_id·agenda_nation = 열려 있는 비준 투표(의결 안건 kind treaty)와 그 나라. respond_by_ms = 받는 쪽 답 기한(지은이가 받아들인 뒤).
 * next_tribute_ms = 보호 조약 공물 다음 시각. 시각은 서버 ms(실제 시간)
 */
export const diplomacyTreaties = pgTable(
  "diplomacy_treaties",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    nationA: bigint("nation_a", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    nationB: bigint("nation_b", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    authorNation: bigint("author_nation", { mode: "number" }).notNull(),
    revision: integer("revision").notNull().default(0),
    clauses: jsonb("clauses").notNull(),
    days: integer("days").notNull(),
    state: text("state").notNull(),
    authorReady: boolean("author_ready").notNull().default(false),
    agendaId: bigint("agenda_id", { mode: "number" }).references(() => governanceAgendas.id, {
      onDelete: "set null",
    }),
    agendaNation: bigint("agenda_nation", { mode: "number" }),
    respondByMs: bigint("respond_by_ms", { mode: "number" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    activatedAtMs: bigint("activated_at_ms", { mode: "number" }),
    expiresAtMs: bigint("expires_at_ms", { mode: "number" }),
    endedAtMs: bigint("ended_at_ms", { mode: "number" }),
    nextTributeMs: bigint("next_tribute_ms", { mode: "number" }),
    /** 위반(broken)으로 끝난 조약의 어긴 나라(맺은 동안 상대에게 선포한 나라, 세력 행 — 줄기 fixes-1117c, 기획 D-255·D-329 86). 모르면 null */
    brokenBy: bigint("broken_by", { mode: "number" }),
  },
  (table) => [
    index("diplomacy_treaties_a_idx").on(table.nationA, table.state),
    index("diplomacy_treaties_b_idx").on(table.nationB, table.state),
    check(
      "diplomacy_treaties_state",
      sql`${table.state} in ('proposed', 'negotiating', 'active', 'expired', 'broken', 'declined', 'lapsed')`,
    ),
    check("diplomacy_treaties_pair", sql`${table.nationA} <> ${table.nationB}`),
    check("diplomacy_treaties_days", sql`${table.days} between 1 and 3650`),
  ],
);

/**
 * 참전 요청(D-291 요청 → 수락 → 전쟁 참가자 등록). requester = 전쟁 중인 나라(동맹·보호받는 쪽), joiner = 참가할 나라, enemy = 그 적.
 * state = requested | joined | declined | lapsed. auto = 보호 조약이 저절로 낸 요청(보호받는 나라가 전쟁에 들었을 때 — 질문 2498 기술 기본값)
 */
export const diplomacyWarJoins = pgTable(
  "diplomacy_war_joins",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    treatyId: bigint("treaty_id", { mode: "number" })
      .notNull()
      .references(() => diplomacyTreaties.id, { onDelete: "cascade" }),
    requesterNation: bigint("requester_nation", { mode: "number" }).notNull(),
    joinerNation: bigint("joiner_nation", { mode: "number" }).notNull(),
    enemyNation: bigint("enemy_nation", { mode: "number" }).notNull(),
    state: text("state").notNull(),
    auto: boolean("auto").notNull().default(false),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    respondByMs: bigint("respond_by_ms", { mode: "number" }).notNull(),
    decidedAtMs: bigint("decided_at_ms", { mode: "number" }),
    /** 결정 기록(누가·NPC 규칙 점수 등 — 화면에는 쓰지 않는다) */
    note: jsonb("note"),
  },
  (table) => [
    index("diplomacy_war_joins_treaty_idx").on(table.treatyId, table.state),
    index("diplomacy_war_joins_joiner_idx").on(table.joinerNation, table.state),
    check("diplomacy_war_joins_state", sql`${table.state} in ('requested', 'joined', 'declined', 'lapsed')`),
  ],
);
