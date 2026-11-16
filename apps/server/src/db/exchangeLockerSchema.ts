// 거래소 유닛 개인 창고 표(기획 D-571 1943 "유닛마다 작은 한도 창고 제공, 비용 지불하여 창고 확장도 가능", 질문 2081 — 줄기 exchange-3,
// docs/adr/2026-11-16-exchange-buildings.md "바뀜 (2081·2083·2084·2086)").
// - exchange_unit_lockers: 유닛 창고를 넓힌 칸 수(도시 × 유닛). 줄이 없으면 넓히지 않은 기본 크기다. 건물이 아니라 도시를 열쇠로 둔다(건물이 부서져
//   다시 지어도 산 칸이 남는다). 유닛에 외래 키가 없다(유닛은 NPC 런타임·전투가 지운다 — 사라진 유닛의 줄은 크기에 들지 않을 뿐이다).
// - 옛 주인마다 표 exchange_lockers(도시 × 주인)는 그대로 둔다(직전 판 앱이 쓴다). 이 표를 만드는 마이그레이션이 옛 줄의 칸을 그 주인의 대표 유닛
//   (사이보그 본체 먼저, 없으면 가장 작은 휴먼·사이보그 유닛 ID) 줄로 한 번 옮긴다. 옛 표는 다음 배포에서 지운다.
import { sql } from "drizzle-orm";
import { bigint, check, integer, pgTable, primaryKey } from "drizzle-orm/pg-core";

/** 거래소 유닛 개인 창고 넓힌 칸(도시 × 유닛) */
export const exchangeUnitLockers = pgTable(
  "exchange_unit_lockers",
  {
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    unitId: bigint("unit_id", { mode: "number" }).notNull(),
    steps: integer("steps").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.cityId, table.unitId] }),
    check("exchange_unit_lockers_steps", sql`${table.steps} >= 0`),
  ],
);
