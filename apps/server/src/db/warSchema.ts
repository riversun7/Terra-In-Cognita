// 공성 결과 표(docs/adr/2026-11-07-war-outcomes.md, 기획 D-520) — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts).
// factions는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환 가져오기가 문제되지 않는다. 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts)
// 하나다. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { factions } from "./schema.ts";

/**
 * 공성 결과 한 줄(약탈·점령·귀속·점령 상태). 약탈은 기록만(끝 = 그때), 점령 상태는 남은 상태(끝·다음 세금·거둔 세금), 점령·귀속은 회복 불이익
 * 끝. 남은 상태가 끝나면 ended_at_ms를 적는다(줄은 남는다 — 세력 화면·복귀 요약이 읽는다). 도시는 나중에 폐허가 될 수 있어 외래 키를 두지 않는다
 */
export const warOutcomes = pgTable(
  "war_outcomes",
  {
    /** NPC 사회 런타임이 정한다(켤 때 가장 큰 값 다음부터) */
    id: bigint("id", { mode: "number" }).primaryKey(),
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    attackerFactionId: bigint("attacker_faction_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => factions.id),
    targetFactionId: bigint("target_faction_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => factions.id),
    /** loot | integrate | occupy(@terra/sim WAR_OUTCOMES) */
    outcome: text("outcome").notNull(),
    /** 점령·귀속의 지분 처리(keep | delist). 나머지는 null */
    shareChoice: text("share_choice"),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
    /** 점령 상태 끝·회복 불이익 끝. 약탈은 null */
    untilMs: bigint("until_ms", { mode: "number" }),
    /** 다음 세금 시각(점령 상태만) */
    nextTaxMs: bigint("next_tax_ms", { mode: "number" }),
    /** 남은 상태가 끝난 시각(약탈 = at_ms). null = 아직 남음 */
    endedAtMs: bigint("ended_at_ms", { mode: "number" }),
    /** 약탈 = 가져간 국고 몫, 점령 상태 = 거둔 세금 합, 점령·귀속 = 재건 비용(최소 단위, takenAsset 화폐) */
    taken: bigint("taken", { mode: "bigint" }).notNull().default(sql`0`),
    takenAsset: text("taken_asset"),
  },
  (table) => [
    index("war_outcomes_attacker_idx").on(table.attackerFactionId, table.atMs),
    index("war_outcomes_target_idx").on(table.targetFactionId, table.atMs),
    check("war_outcomes_outcome", sql`${table.outcome} in ('loot', 'integrate', 'occupy')`),
    check(
      "war_outcomes_share_choice",
      sql`${table.shareChoice} is null or ${table.shareChoice} in ('keep', 'delist')`,
    ),
    check("war_outcomes_taken", sql`${table.taken} >= 0`),
  ],
);
