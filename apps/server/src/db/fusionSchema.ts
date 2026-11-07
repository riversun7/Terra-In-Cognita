// 사이보그 유닛 표(D-470, 49 N46, docs/adr/2026-11-07-cyborg-fusion-genes.md) — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은
// schema.ts). world_units는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환 가져오기가 문제되지 않는다.
// 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, check, integer, pgTable, smallint, text } from "drizzle-orm/pg-core";
import { worldUnits } from "./schema.ts";

/**
 * 사이보그 유닛(유닛 종류 5): 휴먼을 바탕으로 기계 부품(또는 안드로이드)을 융합해 만든 유닛. 바탕 휴먼의 유닛이 그대로 이 유닛이 된다
 * (같은 유닛 ID — 화물·지닌 물건·생명 수치가 따라온다). 수명이 없다(D-470). 레벨·1차 스탯(STR·DEX·AGI·VIT·INT·WIS)·속성 12칸,
 * 융합 기록(바탕 휴먼 스탯·부품 쪽·보너스 ‰·시각). 유닛이 지워지면 함께 지워진다
 */
export const cyborgUnits = pgTable(
  "cyborg_units",
  {
    unitId: bigint("unit_id", { mode: "number" })
      .primaryKey()
      .references((): AnyPgColumn => worldUnits.id, { onDelete: "cascade" }),
    /** 레벨(옛 craftCyborg = 1에서 시작). 성장은 본체처럼 공통 레벨 + 인공장기(D-470, 레벨 오르기는 아직 없다) */
    level: smallint("level").notNull().default(1),
    /** 융합 뒤 1차 스탯 */
    stats: smallint("stats").array().notNull(),
    /** 속성값 12칸(바탕 휴먼의 값, @terra/shared ELEMENT_IDS 차례). null = 바탕 휴먼에 없었다 */
    elements: smallint("elements").array(),
    /** 바탕 휴먼의 1차 스탯(융합 전) */
    humanStats: smallint("human_stats").array().notNull(),
    /** 부품 쪽: parts(기계 부품) 또는 android(안드로이드 유닛, 서버에 아직 없다) */
    donor: text("donor").notNull(),
    /** 융합 보너스 배율(‰, N46) */
    bonusPm: integer("bonus_pm").notNull(),
    fusedAtMs: bigint("fused_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    check("cyborg_units_level", sql`${table.level} >= 1`),
    check("cyborg_units_stats", sql`cardinality(${table.stats}) = 6 and 0 <= all(${table.stats})`),
    check("cyborg_units_human_stats", sql`cardinality(${table.humanStats}) = 6`),
    check(
      "cyborg_units_elements",
      sql`${table.elements} is null or (cardinality(${table.elements}) = 12 and 0 <= all(${table.elements}) and 10 >= all(${table.elements}))`,
    ),
    check("cyborg_units_donor", sql`${table.donor} in ('parts', 'android')`),
    check("cyborg_units_bonus", sql`${table.bonusPm} >= 0`),
  ],
);
