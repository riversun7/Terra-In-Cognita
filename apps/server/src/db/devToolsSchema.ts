// 개발자 도구 DB 표 — schema.ts가 다시 내보낸다(drizzle-kit은 schema.ts 하나를 읽는다). schema.ts가 1,000줄 상한에 닿아 나눴다.
// 바꾼 뒤 `pnpm --filter @terra/server db:generate`로 마이그레이션을 만든다(schema.ts와 같은 규칙).
import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./schema.ts";

/**
 * 전투 실험실 프리셋 — 개발자 밸런스·전투 실험실(/dev/balance, docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)"
 * 3절). 팀이 함께 쓰는 유닛·파티 프리셋. 값(data)은 @terra/shared LabUnit·LabParty 모양이고 읽을 때마다 같은 스키마로 다시 검사한다
 * (맞지 않는 줄은 목록에서 빼고 센다). 줄 판(version)을 조건으로 바꿔 두 사람이 같은 줄을 고치면 늦은 쪽이 충돌.
 * 샘플은 코드(battleLab/samples.ts)라 이 표에 없다. 바꾸기·감사 기록(battle_lab_preset.*)은 한 트랜잭션
 */
export const battleLabPresets = pgTable(
  "battle_lab_presets",
  {
    /** `lab_` + 16진 12자 */
    id: text("id").primaryKey(),
    kind: text("kind").$type<"unit" | "party">().notNull(),
    nameKo: text("name_ko").notNull(),
    nameEn: text("name_en").notNull(),
    data: jsonb("data").notNull(),
    version: integer("version").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("battle_lab_presets_id_format", sql`${table.id} ~ '^lab_[0-9a-f]{12}$'`),
    check("battle_lab_presets_kind", sql`${table.kind} in ('unit', 'party')`),
    check(
      "battle_lab_presets_name_length",
      sql`char_length(${table.nameKo}) between 1 and 40 and char_length(${table.nameEn}) between 1 and 40`,
    ),
    check("battle_lab_presets_version_positive", sql`${table.version} >= 1`),
  ],
);
