// 국적 바꾸기(귀화) 기록 표(docs/adr/2026-11-08-citizenship.md, 질문 745 나) — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은
// schema.ts). users·factions·world_cities는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환 가져오기가 문제되지 않는다.
// 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다(사이보그 행·세력 가입·원장 거래와 같은 커밋, 추가만).
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, uuid } from "drizzle-orm/pg-core";
import { factions, users, worldCities } from "./schema.ts";

/**
 * 국적 바꾸기 한 번 = 한 줄(추가만 — 고치거나 지우지 않는다). 감사·쉬는 날·지원금 반환 여부의 원본이다: 부팅이 사용자마다 마지막 바꾼 시각
 * (쉬는 날)과 돌려준 지원금 합(한 번만 돌려준다)을 읽는다(src/cyborg/state.ts). 사이보그 행의 faction_id·start_city_id가 지금 값이다.
 * fee = 받는 나라 국고에 낸 귀화 값, grant_returned = 옛 나라 국고에 돌려준 정착 지원금(둘 다 최소 단위, 원장 거래 nationality_change와 같은 양)
 */
export const nationalityChanges = pgTable(
  "nationality_changes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromFaction: bigint("from_faction", { mode: "number" })
      .notNull()
      .references(() => factions.id),
    toFaction: bigint("to_faction", { mode: "number" })
      .notNull()
      .references(() => factions.id),
    /** 귀화한 도시(새 내 도시 = cyborgs.start_city_id) */
    cityId: bigint("city_id", { mode: "number" })
      .notNull()
      .references(() => worldCities.id),
    /** 신청한 행정 건물(외래 키 없음 — 건물이 무너져도 기록은 남는다) */
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
    fee: bigint("fee", { mode: "bigint" }).notNull(),
    grantReturned: bigint("grant_returned", { mode: "bigint" }).notNull(),
  },
  (table) => [
    index("nationality_changes_user_idx").on(table.userId, table.atMs),
    check("nationality_changes_amounts", sql`${table.fee} >= 0 and ${table.grantReturned} >= 0`),
    check("nationality_changes_other_nation", sql`${table.fromFaction} <> ${table.toFaction}`),
  ],
);
