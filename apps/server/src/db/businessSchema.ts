// 사업장 장부 표(기획 D-548·D-555, docs/adr/2026-11-15-business-ledger.md) — schema.ts가 다시 내보낸다(drizzle-kit 진입점은 schema.ts).
// 금고·창고 돈과 물건은 원장 계정(건물 위치)에 있고 표를 새로 두지 않는다. 여기는 원장에 없는 것만:
// - business_states: 사업장(건물)마다 적자가 생긴 시각·멈춘 시각·마지막 자동 정산 주기. 갚을 돈 자체는 시스템 계정 debt:business:<건물>:<화폐>.
// - business_prices: 사업장 창고 판매 값(아이템마다 1개 값, D-555 1507).
// 건물에 외래 키를 두지 않는다(건물이 사라지면 서비스가 줄을 지운다 — 시설·배 표와 같은 까닭). 더하기만 해서 직전 판 앱은 그대로 돈다.
import { sql } from "drizzle-orm";
import { bigint, check, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

export const businessStates = pgTable("business_states", {
  buildingId: bigint("building_id", { mode: "number" }).primaryKey(),
  planetId: planetIdColumn(),
  debtSinceMs: bigint("debt_since_ms", { mode: "number" }),
  suspendedAtMs: bigint("suspended_at_ms", { mode: "number" }),
  settledAtMs: bigint("settled_at_ms", { mode: "number" }),
});

export const businessPrices = pgTable(
  "business_prices",
  {
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    item: text("item").notNull(),
    planetId: planetIdColumn(),
    price: bigint("price", { mode: "bigint" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildingId, table.item] }),
    check("business_prices_price", sql`${table.price} >= 0`),
  ],
);
