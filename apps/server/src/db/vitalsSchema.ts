// 유닛 생명 수치 표(HP·아머 HP·쉴드 HP가 전투 뒤에도 남는다, 기획 D-512) — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은
// schema.ts, 그 파일 줄 수 때문에 따로 둔다). docs/adr/2026-10-31-combat-core.md "바뀜 (D-512 …)".
// 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다. 줄이 없으면 세 칸 모두 가득으로 본다(다친 유닛만 줄이 있다).
import { sql } from "drizzle-orm";
import { bigint, check, pgTable } from "drizzle-orm/pg-core";

/**
 * 유닛 하나의 생명 수치 — 값과 그 값의 시각(updated_at_ms, 분 경계). 전투 밖 회복은 읽을 때 분 단위로 셈한다(@terra/shared vitalsAt).
 * - max_*·regen_*: 그 값을 쓸 때의 최대·분당 회복(그 유닛의 지금 몸 자료를 세계가 모르면 이것으로 셈한다 — 전투 사양에서만 스탯이
 *   나오는 NPC 휴먼 등). 사이보그처럼 지금 몸 자료가 있으면 그것을 쓴다. regen_hp·regen_armor는 회복 규칙이 아직 없어 0이다(질문 343·344)
 * - 유닛 행은 옛 시험 2차맵 정리·NPC 사망이 지울 수 있어 외래 키를 두지 않는다(unit_effects와 같다). 없는 유닛의 줄은 서버가 지운다
 * - 값이 커질 수 있어(2차 스탯은 상한이 없다 D-421) int8
 */
export const unitVitals = pgTable(
  "unit_vitals",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    hp: bigint("hp", { mode: "number" }).notNull(),
    armor: bigint("armor", { mode: "number" }).notNull(),
    shield: bigint("shield", { mode: "number" }).notNull(),
    maxHp: bigint("max_hp", { mode: "number" }).notNull(),
    maxArmor: bigint("max_armor", { mode: "number" }).notNull(),
    maxShield: bigint("max_shield", { mode: "number" }).notNull(),
    regenHp: bigint("regen_hp", { mode: "number" }).notNull().default(0),
    regenArmor: bigint("regen_armor", { mode: "number" }).notNull().default(0),
    regenShield: bigint("regen_shield", { mode: "number" }).notNull().default(0),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    check("unit_vitals_hp", sql`${table.hp} between 0 and ${table.maxHp}`),
    check("unit_vitals_armor", sql`${table.armor} between 0 and ${table.maxArmor}`),
    check("unit_vitals_shield", sql`${table.shield} between 0 and ${table.maxShield}`),
    check("unit_vitals_max", sql`${table.maxHp} >= 1 and ${table.maxArmor} >= 0 and ${table.maxShield} >= 0`),
    check(
      "unit_vitals_regen",
      sql`${table.regenHp} >= 0 and ${table.regenArmor} >= 0 and ${table.regenShield} >= 0`,
    ),
  ],
);
