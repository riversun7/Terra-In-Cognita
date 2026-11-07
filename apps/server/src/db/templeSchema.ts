// 신전·종교 표(docs/adr/2026-11-07-temple-religion.md, 기획 D-311·D-441·D-451·49 S15·기획 정리 395 나) — schema.ts가 다시 내보낸다
// (drizzle-kit 표 정의 진입점은 schema.ts). world_units·world_owners·world_cities는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환
// 가져오기가 문제되지 않는다. 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
// 비활성(수명이 다한 유저 휴먼, D-517)은 표에 두지 않는다: 수명 끝(world_humans 태어난 시각 + 수명) ≤ 지금으로 셈한다.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
} from "drizzle-orm/pg-core";
import { worldCities, worldOwners, worldUnits } from "./schema.ts";

/**
 * 유닛 신앙(D-451: 유닛마다 신앙도·신앙 포인트). 유저가 고용한 휴먼만 쓴다(사이보그 본체는 cyborgs.faith·faith_points).
 * 신앙도 = 쌓이는 문턱 점수(0~100, D-455 186 — 환생하면 0), 신앙 포인트 = 따로 쓰는 재화. 종교 코드는 신앙 목록(D-411)이 생기면 더한다.
 * 줄이 없으면 둘 다 0이다. 유닛이 지워지면 함께 지워진다
 */
export const unitFaith = pgTable(
  "unit_faith",
  {
    unitId: bigint("unit_id", { mode: "number" })
      .primaryKey()
      .references((): AnyPgColumn => worldUnits.id, { onDelete: "cascade" }),
    faith: smallint("faith").notNull().default(0),
    faithPoints: integer("faith_points").notNull().default(0),
  },
  (table) => [
    check("unit_faith_faith", sql`${table.faith} between 0 and 100`),
    check("unit_faith_points", sql`${table.faithPoints} >= 0`),
  ],
);

/** 기도 쿨다운(옛 religion_routes.js 1시간): 소유 주체마다 마지막 기도 시각 */
export const templeDevotions = pgTable("temple_devotions", {
  ownerId: bigint("owner_id", { mode: "number" })
    .primaryKey()
    .references((): AnyPgColumn => worldOwners.id),
  lastPrayedAtMs: bigint("last_prayed_at_ms", { mode: "number" }).notNull(),
});

/**
 * 수호신(D-311·D-5059): 신전에서 신격화한 휴먼. 열쇠 = 바탕 휴먼의 유닛 ID(유닛 ID는 다시 쓰지 않는다). 기획 답 456 가부터 같은 유닛이 수호신
 * 유닛(world_units.kind 6)으로 그 도시에 남아 방어전에 나서고, 도시 버프 하나(buff, 수호신마다 편집기 칸, 출발값 방어)를 준다. 이 판 전에
 * 신격화한 줄은 유닛이 지워졌다(기록·버프만 남는다) — 그래서 world_units 외래 키를 두지 않는다. 그 도시에 묶이고(도시당 상한 49 S15),
 * 소유자에게 속한다. 지역 신화 모습은 아직 없다. 도시가 지워지면 함께 지운다
 */
export const templeGuardians = pgTable(
  "temple_guardians",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => worldOwners.id),
    cityId: bigint("city_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => worldCities.id, { onDelete: "cascade" }),
    /** 집전한 신전(2차맵 건물 ID, 외래 키 없음 — 건물이 지워져도 기록은 남는다) */
    templeId: bigint("temple_id", { mode: "number" }).notNull(),
    level: smallint("level").notNull(),
    rebirths: smallint("rebirths").notNull(),
    /** 바탕 휴먼의 1차 스탯 STR·DEX·AGI·VIT·INT·WIS */
    stats: smallint("stats").array().notNull(),
    /** 바탕 휴먼의 속성값 12칸(없으면 null) */
    elements: smallint("elements").array(),
    faith: smallint("faith").notNull(),
    deifiedAtMs: bigint("deified_at_ms", { mode: "number" }).notNull(),
    /** 도시 버프 종류(@terra/sim GUARDIAN_BUFFS). 직전 판 앱은 이 칸을 모른 채 넣는다 → 기본값 방어 */
    buff: text("buff").notNull().default("defense"),
  },
  (table) => [
    index("temple_guardians_city_idx").on(table.cityId),
    check("temple_guardians_level", sql`${table.level} >= 1 and ${table.rebirths} >= 0`),
    check("temple_guardians_stats", sql`cardinality(${table.stats}) = 6`),
    check(
      "temple_guardians_elements",
      sql`${table.elements} is null or (cardinality(${table.elements}) = 12 and 0 <= all(${table.elements}) and 10 >= all(${table.elements}))`,
    ),
    check("temple_guardians_faith", sql`${table.faith} between 0 and 100`),
    check("temple_guardians_buff", sql`${table.buff} in ('defense', 'satisfaction', 'production')`),
  ],
);
