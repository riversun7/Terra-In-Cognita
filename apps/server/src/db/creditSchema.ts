// 신용 점수 깎은 몫 표(줄기 credit — 기획 D-581, 질문 2374 답) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로 둔다). docs/adr/2026-11-21-credit.md.
// 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다). 더하기만 해서 직전 판 앱은 그대로 돈다(이 표를 모른다).
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * 갚지 않은 빚 하나마다 한 줄 — 그 빚으로 깎은 신용 점수(apps/server/src/credit/book.ts). 점수 자체는 저장하지 않는다(시작값 − 깎은 몫 합, 설정 칸 범위로 자름).
 * - cause: 원장 빚 시스템 계정 코드(debt:resident:… — 주민세, debt:business:… — 사업장 적자). 그 계정 잔고가 0이 되면(다 갚음·탕감) 줄을 지운다 = 바로 회복
 * - owner_id: 주체의 주인(소유 주체). unit_id: 유닛 몫(주민세 집 몫 — 유닛 지갑)이면 그 유닛, 주인 자신이면 null
 * - city_id·nation_id: 깎인 도시 신용·나라 신용(나라 = 그때 그 도시의 국고 주인 ID). 외래 키는 두지 않는다(도시·주체가 사라져도 빚 계정 기준으로 지운다)
 * - city_points·nation_points: 지금까지 깎은 점수(주민세는 못 낸 주기마다 더한다), count: 깎은 횟수
 */
export const creditMarks = pgTable(
  "credit_marks",
  {
    cause: text("cause").primaryKey(),
    kind: text("kind").notNull(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    unitId: bigint("unit_id", { mode: "number" }),
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    nationId: bigint("nation_id", { mode: "number" }).notNull(),
    cityPoints: integer("city_points").notNull(),
    nationPoints: integer("nation_points").notNull(),
    count: integer("count").notNull(),
    sinceMs: bigint("since_ms", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("credit_marks_owner_idx").on(table.ownerId),
    check("credit_marks_kind", sql`${table.kind} in ('resident', 'business')`),
    check(
      "credit_marks_points",
      sql`${table.cityPoints} >= 0 and ${table.nationPoints} >= 0 and ${table.count} >= 1`,
    ),
  ],
);
