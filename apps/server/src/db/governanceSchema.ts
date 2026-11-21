// 나라 의결 표(docs/adr/2026-11-21-governance.md — 기획 D-5057·D-217·질문 2351~2365 답) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로
// 둔다). 모두 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다). 새 표만 더해서 직전 판 앱은 모른 채 돈다.
// 쓰는 곳은 apps/server/src/governance/store.ts 하나다(서버가 하나라 의결 서비스가 순서대로 쓴다).
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { factions } from "./schema.ts";

/**
 * 안건 하나(D-5057). nation_id = 나라(세력 행). proposer_key = 올린 가문(p:/n:)·주주(o:) 열쇠, 시스템(임기 끝 자동 선출)이면 null.
 * payload = 종류별 칸(체제 전환 목표 regime·선전포고 상대 targetNationId·해임 뒤 다시 뽑기의 barred·직권 결정 byAuthority).
 * result = 셈 결과(찬반·후보 표·투표권·정족수·문턱·까닭). 시각은 서버 ms(실제 시간 D-5030)
 */
export const governanceAgendas = pgTable(
  "governance_agendas",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    nationId: bigint("nation_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** 열 때 체제 */
    regime: text("regime").notNull(),
    proposerKey: text("proposer_key"),
    proposerUser: uuid("proposer_user"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    openedAtMs: bigint("opened_at_ms", { mode: "number" }).notNull(),
    /** 선출 후보 등록 끝(선출만) */
    registerUntilMs: bigint("register_until_ms", { mode: "number" }),
    closesAtMs: bigint("closes_at_ms", { mode: "number" }).notNull(),
    /** open | passed | enacted | failed | cancelled */
    status: text("status").notNull().default("open"),
    result: jsonb("result"),
    decidedAtMs: bigint("decided_at_ms", { mode: "number" }),
    /** 집행 시각(가결 뒤 유예 — D-131) */
    effectAtMs: bigint("effect_at_ms", { mode: "number" }),
    enactedAtMs: bigint("enacted_at_ms", { mode: "number" }),
  },
  (table) => [
    index("governance_agendas_nation_idx").on(table.nationId, table.status),
    check(
      "governance_agendas_kind",
      sql`${table.kind} in ('leader_election', 'leader_removal', 'regime_change', 'war_declaration', 'tax_change')`,
    ),
    check(
      "governance_agendas_status",
      sql`${table.status} in ('open', 'passed', 'enacted', 'failed', 'cancelled')`,
    ),
    check("governance_agendas_regime", sql`${table.regime} in ('dictatorship', 'democracy', 'capitalism')`),
  ],
);

/**
 * 표 하나(공개 투표·위임 없음 — 2365 가). voter_key = 가문(p:/n: — 민주주의 가문마다 한 표, 2355 가)·주주(o: — 자본주의 지분, 2356 가).
 * 닫힐 때까지 바꿀 수 있다(같은 열쇠 한 줄). weight = 던질 때 무게(화면용 — 셈은 닫을 때 그때 투표권으로 다시 센다)
 */
export const governanceVotes = pgTable(
  "governance_votes",
  {
    agendaId: bigint("agenda_id", { mode: "number" })
      .notNull()
      .references(() => governanceAgendas.id, { onDelete: "cascade" }),
    voterKey: text("voter_key").notNull(),
    /** 던진 플레이어(NPC면 null) */
    userId: uuid("user_id"),
    npc: boolean("npc").notNull().default(false),
    /** yes | no | abstain | 후보 가문 열쇠 */
    choice: text("choice").notNull(),
    weight: bigint("weight", { mode: "bigint" }).notNull(),
    castAtMs: bigint("cast_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agendaId, table.voterKey] }),
    check("governance_votes_key", sql`${table.voterKey} ~ '^[pno]:[1-9][0-9]{0,15}$'`),
  ],
);

/** 선출 후보(스스로 등록 — 2358 가). house_key = p:/n: 가문 열쇠 */
export const governanceCandidates = pgTable(
  "governance_candidates",
  {
    agendaId: bigint("agenda_id", { mode: "number" })
      .notNull()
      .references(() => governanceAgendas.id, { onDelete: "cascade" }),
    houseKey: text("house_key").notNull(),
    userId: uuid("user_id"),
    registeredAtMs: bigint("registered_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agendaId, table.houseKey] }),
    check("governance_candidates_key", sql`${table.houseKey} ~ '^[pn]:[1-9][0-9]{0,15}$'`),
  ],
);

/**
 * 나라마다 의결 상태 한 줄. ruling_house_key = 선출로 정한 지배 가문(2358 가 — null이면 처음 규칙: NPC 나라는 수도에서 처음 세운 가문 D-574 10,
 * 플레이어 가문 나라는 그 가문). term_ends_at_ms = 임기 끝(민주주의·자본주의 — 2357, 독재는 null). share_votes_suspended = 독재로 바뀌며 지배
 * 쪽이 아닌 지분이 의결권을 잃었다(D-349 — 몰수 아님)
 */
export const governanceState = pgTable("governance_state", {
  nationId: bigint("nation_id", { mode: "number" })
    .primaryKey()
    .references(() => factions.id, { onDelete: "cascade" }),
  rulingHouseKey: text("ruling_house_key"),
  electedAtMs: bigint("elected_at_ms", { mode: "number" }),
  termEndsAtMs: bigint("term_ends_at_ms", { mode: "number" }),
  shareVotesSuspended: boolean("share_votes_suspended").notNull().default(false),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  /** 지도자 빈자리가 된 시각(질문 2403 답 D-582 — 해임 뒤 다시 뽑기가 실패하면). 선출로 채우면 null. 직전 판 앱은 읽지 않는다 */
  vacantSinceMs: bigint("vacant_since_ms", { mode: "number" }),
});

/**
 * 자본주의 NPC 나라 처음 지분을 세운 가문으로 옮긴 기록(기획 D-582 — 도시 지분은 그 도시를 처음 세운 NPC 가문, 수도는 지배 가문. 줄기 governance-2).
 * 도시마다 한 번만 옮긴다(그 뒤 국고에 생긴 지분 — 점령 몰수 D-298·재발행 D-444 — 은 국고 몫이라 옮기지 않는다). 세계 표(시험 세계 새로 시작에서 지운다)
 */
export const governanceShareFixups = pgTable("governance_share_fixups", {
  cityId: bigint("city_id", { mode: "number" }).primaryKey(),
  /** 받은 가문 열쇠(p:/n:) */
  houseKey: text("house_key").notNull(),
  /** 옮긴 주 수(10진 문자열이 아니라 정수 — 도시마다 1000주 출발값) */
  shares: bigint("shares", { mode: "number" }).notNull(),
  doneAtMs: bigint("done_at_ms", { mode: "number" }).notNull(),
});
