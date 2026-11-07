// 랭킹 집계 표(docs/adr/2026-11-07-ranking.md, 기획 20 §8·D-037·D-041·D-392) — schema.ts가 다시 내보낸다(drizzle-kit 진입점은 schema.ts).
// 원장·전투 기록·세계 표에서 다시 셀 수 있는 파생 자료라 월드 쓰기 대기열을 거치지 않고 랭킹 집계가 한 트랜잭션으로 바꿔 쓴다.
// 주체(소유 주체·세력)에 외래 키를 두지 않는다: 세력이 사라져도(유동 세력) 판 줄은 다음 집계에서 빠진다. 새 표라 직전 판 앱은 모른 채 돈다.
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, primaryKey, smallint, text } from "drizzle-orm/pg-core";

/** 마지막 집계(한 줄, id = 1): 집계한 기간 [from, to)·센 시각. 다음 집계는 to 다음 경계에서 */
export const rankingState = pgTable(
  "ranking_state",
  {
    id: smallint("id").primaryKey(),
    periodFromMs: bigint("period_from_ms", { mode: "number" }).notNull(),
    periodToMs: bigint("period_to_ms", { mode: "number" }).notNull(),
    computedAtMs: bigint("computed_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    check("ranking_state_single", sql`${table.id} = 1`),
    check("ranking_state_period", sql`${table.periodToMs} > ${table.periodFromMs}`),
  ],
);

/**
 * 경로 판 한 줄(경로 × 소유 주체). score = 감쇠형 점수(D-037), gain = 이번 집계에 더한 점수, rank·tier_pm = 이 집계의 순위·백분위
 * 등급 문턱(‰, 등급 밖이면 null), prev_rank = 지난 집계의 순위(처음 오르면 null). 점수가 0이 되면 줄을 지운다
 */
export const rankingPathScores = pgTable(
  "ranking_path_scores",
  {
    pathId: text("path_id").notNull(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    score: bigint("score", { mode: "number" }).notNull(),
    gain: bigint("gain", { mode: "number" }).notNull(),
    rank: integer("rank").notNull(),
    prevRank: integer("prev_rank"),
    tierPm: smallint("tier_pm"),
  },
  (table) => [
    primaryKey({ columns: [table.pathId, table.ownerId] }),
    index("ranking_path_scores_rank_idx").on(table.pathId, table.rank),
    check("ranking_path_scores_score", sql`${table.score} > 0 and ${table.gain} >= 0 and ${table.rank} >= 1`),
    check("ranking_path_scores_path_format", sql`${table.pathId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/**
 * 세력 판 한 줄(세력 규모, 감쇠 없음 — 집계 때의 값). cities·humans = 그때의 규모, renown = 그때의 세력 명성(정원사 2가
 * npc_society.gardener에 쌓는 값, 쌓은 적 없으면 null — 점수에 더하지 않는다)
 */
export const rankingFactionScores = pgTable(
  "ranking_faction_scores",
  {
    factionId: bigint("faction_id", { mode: "number" }).primaryKey(),
    score: bigint("score", { mode: "number" }).notNull(),
    rank: integer("rank").notNull(),
    prevRank: integer("prev_rank"),
    tierPm: smallint("tier_pm"),
    cities: integer("cities").notNull(),
    humans: integer("humans").notNull(),
    renown: bigint("renown", { mode: "number" }),
  },
  (table) => [
    index("ranking_faction_scores_rank_idx").on(table.rank),
    check("ranking_faction_scores_score", sql`${table.score} > 0 and ${table.rank} >= 1`),
  ],
);
