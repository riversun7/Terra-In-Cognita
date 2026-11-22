// 가문 연맹(조약) 표(npc-invest-2 — 사용자 답 D-587 4·5·6, 질문 2502·2503) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로 둔다).
// docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (npc-invest-2)". 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다).
// 새 표만 더해서 직전 판 앱은 모른 채 돈다(league-2의 들기 절차·조항 카드 표도 새 표만 — 직전 판 앱은 읽지 않는다). 쓰는 곳은 apps/server/src/factionIdentity/leagueStore.ts 하나다.
// 가문 열쇠 = 플레이어 가문 p:<세력 행>, NPC 가문 n:<npc_city_houses ID>(@terra/shared/governance HouseKey와 같은 꼴). 가문이 사라져도 줄은 남는다(읽을 때 본다).
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

const houseKeyCheck = (column: unknown) => sql`${column} ~ '^[pn]:[1-9][0-9]*$'`;

/** 연맹 하나: 만든 가문(바뀌지 않음)·지금 대표. 끝난 연맹(대표 혼자 남아 나감)은 ended_at_ms가 있다 */
export const houseLeagues = pgTable(
  "house_leagues",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    founderKey: text("founder_key").notNull(),
    representativeKey: text("representative_key").notNull(),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    endedAtMs: bigint("ended_at_ms", { mode: "number" }),
  },
  (table) => [
    check("house_leagues_founder_key", houseKeyCheck(table.founderKey)),
    check("house_leagues_representative_key", houseKeyCheck(table.representativeKey)),
  ],
);

/** 든 가문(든 차례 = joined_at_ms, 같으면 열쇠 차례) */
export const houseLeagueMembers = pgTable(
  "house_league_members",
  {
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => houseLeagues.id, { onDelete: "cascade" }),
    houseKey: text("house_key").notNull(),
    joinedAtMs: bigint("joined_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.leagueId, table.houseKey] }),
    index("house_league_members_house_idx").on(table.houseKey),
    check("house_league_members_house_key", houseKeyCheck(table.houseKey)),
  ],
);

/**
 * 들기 절차(league-2, 사용자 결정 D-590 2502 다): 대표가 부른 초대(invite)·가문장이 낸 신청(apply). 연맹 × 가문마다 하나(마지막 것). 들거나 거절·거두면 지운다
 */
export const houseLeagueRequests = pgTable(
  "house_league_requests",
  {
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => houseLeagues.id, { onDelete: "cascade" }),
    houseKey: text("house_key").notNull(),
    kind: text("kind").notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.leagueId, table.houseKey] }),
    index("house_league_requests_house_idx").on(table.houseKey),
    check("house_league_requests_house_key", houseKeyCheck(table.houseKey)),
    check("house_league_requests_kind", sql`${table.kind} in ('invite', 'apply')`),
  ],
);

/** 연맹에 붙인 조항 카드(league-2, D-590 2501 다 — 카드 ID는 @terra/protocol HOUSE_LEAGUE_CLAUSES, 서버가 집행). 대표가 붙이고 뗀다 */
export const houseLeagueClauses = pgTable(
  "house_league_clauses",
  {
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => houseLeagues.id, { onDelete: "cascade" }),
    clause: text("clause").notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.leagueId, table.clause] })],
);

/** 대표 투표(질문 2503 [임시] — 든 가문마다 한 표, 마지막 표만) */
export const houseLeagueVotes = pgTable(
  "house_league_votes",
  {
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => houseLeagues.id, { onDelete: "cascade" }),
    voterKey: text("voter_key").notNull(),
    candidateKey: text("candidate_key").notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.leagueId, table.voterKey] }),
    check("house_league_votes_voter_key", houseKeyCheck(table.voterKey)),
    check("house_league_votes_candidate_key", houseKeyCheck(table.candidateKey)),
  ],
);
