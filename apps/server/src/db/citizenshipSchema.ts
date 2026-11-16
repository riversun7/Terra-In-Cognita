// 국적 바꾸기(귀화) 기록 표와 사람·나라 우호도 표(docs/adr/2026-11-08-citizenship.md, 질문 745 나·D-526), 사람·나라 명성 표(D-326 작위, D-571) —
// schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은
// schema.ts). users·factions·world_cities는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환 가져오기가 문제되지 않는다.
// 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다(사이보그 행·세력 가입·원장 거래와 같은 커밋, 추가만).
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { factions, users, worldCities } from "./schema.ts";

/**
 * 국적 바꾸기 한 번 = 한 줄(추가만 — 고치거나 지우지 않는다). 감사·쉬는 날의 원본이다: 부팅이 사용자마다 마지막 바꾼 시각(쉬는 날)을 읽는다
 * (src/cyborg/state.ts). 사이보그 행의 faction_id·start_city_id가 지금 값이다. 양은 모두 최소 단위이고 원장 거래 nationality_change와 같다:
 * fee = 받는 나라 국고에 낸 입회비, grant_paid = 받는 나라 국고에서 받은 지원금(D-526 — 둘 중 하나만 0보다 크다),
 * grant_returned = 옛 나라 국고에 돌려준 정착 지원금(D-526 전 기록만, 이제 돌려주지 않아 0), standing_drop = 옛 나라 우호도가 떨어진 양,
 * hostile = 옛 나라와 전쟁 중인 나라로 옮겼다(크게 떨어짐)
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
    grantPaid: bigint("grant_paid", { mode: "bigint" }).notNull().default(sql`0`),
    standingDrop: integer("standing_drop").notNull().default(0),
    hostile: boolean("hostile").notNull().default(false),
  },
  (table) => [
    index("nationality_changes_user_idx").on(table.userId, table.atMs),
    check("nationality_changes_amounts", sql`${table.fee} >= 0 and ${table.grantReturned} >= 0`),
    check("nationality_changes_d526", sql`${table.grantPaid} >= 0 and ${table.standingDrop} >= 0`),
    check("nationality_changes_other_nation", sql`${table.fromFaction} <> ${table.toFaction}`),
  ],
);

/**
 * 사람(사용자)과 나라 사이 우호도(D-526: 국적을 바꾸면 옛 나라와 떨어지고, 적대 세력으로 가면 크게). 눈금은 세력 호감 띠와 같은 −100~100(46 §4.1,
 * @terra/shared/faction relationBand), 줄이 없으면 0(보통). 세력 쌍 호감(D-255)·개인 신뢰도(D-315)와 다른 값이다. 쓰기는 월드 쓰기 대기열(덮어쓰기)
 */
export const userNationStandings = pgTable(
  "user_nation_standings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id),
    score: integer("score").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.factionId] }),
    check("user_nation_standings_score", sql`${table.score} between -100 and 100`),
  ],
);

/**
 * 사람(사용자)의 나라별 명성(D-326 "명성은 납품·방어·의뢰로 그 나라에서 쌓는다. 나라마다 따로다", 46 §9.4). 작위 = 명성 구간(49 S18,
 * @terra/sim titleOfRenown) — 기획 D-571(답 1961·1962)로 지휘관 정원이 작위를 읽는다(world/commandRanks.ts). 줄이 없으면 0(민간인).
 * 쓰기는 월드 쓰기 대기열(덮어쓰기 — 메모리 값이 원본의 캐시, cyborg/service.ts addRenown). 추가만 한 표다(D-571 줄기 legion-3)
 */
export const userNationRenown = pgTable(
  "user_nation_renown",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id),
    renown: bigint("renown", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.factionId] }),
    check("user_nation_renown_nonnegative", sql`${table.renown} >= 0`),
  ],
);
