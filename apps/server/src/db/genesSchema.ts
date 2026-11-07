// 유닛이 배운 스킬 표(스킬 유전자 주입, D-478·D-516 376, docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)") — schema.ts가 다시
// 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts, schema.ts가 1,000줄 상한에 가까워 나눔). world_units는 schema.ts에서 오고, 참조는 함수
// 안에서만 읽어 순환 가져오기가 문제되지 않는다. 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다. 직전 판 앱은 이 표를 모른 채
// 그대로 돈다(더하기만). 유전자 하나하나(스탯 유전자 = 총합·분포·속성, 스킬 유전자 = 스킬)는 보유 물건 item_holdings의 gene 칸이다.
import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, check, pgTable, primaryKey, smallint, text } from "drizzle-orm/pg-core";
import { worldUnits } from "./schema.ts";

/**
 * 유닛이 배운 스킬(유닛·스킬마다 한 줄): 스킬 유전자를 주입하면 그 스킬을 등급 1로 배운다(D-478 "주입해 능력을 준다", 376 기술 기본안).
 * 스킬 칸 수는 유닛 종류의 스킬 칸 규칙(팩 unit_kinds skillSlots)이다. 수명이 다하면 배운 스킬마다 스킬 유전자가 남는다(D-478).
 * source = 배운 길(gene = 유전자 주입). 유닛이 지워지면 함께 지워진다
 */
export const unitSkills = pgTable(
  "unit_skills",
  {
    unitId: bigint("unit_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => worldUnits.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    /** 스킬 등급(1~10, D-5001). 주입은 1 */
    grade: smallint("grade").notNull().default(1),
    source: text("source").notNull(),
    learnedAtMs: bigint("learned_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.unitId, table.skillId] }),
    check("unit_skills_skill_format", sql`${table.skillId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
    check("unit_skills_grade", sql`${table.grade} between 1 and 10`),
    check("unit_skills_source_format", sql`${table.source} ~ '^[a-z][a-z0-9_]{1,31}$'`),
  ],
);
