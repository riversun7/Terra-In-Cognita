// 사업장 표의 쓰기 대기열 정의(world/persist/tables.ts가 펼쳐 넣는다 — 그 파일 줄 수 때문에 따로 둔다, 묶음 1117h). 열 이름은 src/db/businessSchema.ts와 같다.
import type { TableSpec } from "../world/persist/tables.ts";

export const BUSINESS_TABLES = {
  /** 사업장 상태(적자·멈춤·자동 정산 주기 — docs/adr/2026-11-15-business-ledger.md). 건물이 사라지면 지운다 */
  businessStates: {
    name: "business_states",
    columns: ["building_id", "planet_id", "debt_since_ms", "suspended_at_ms", "settled_at_ms", "reserve_pm"],
    key: ["building_id"],
  },
  /** 사업장 창고 판매 값(D-555 1507) */
  businessPrices: {
    name: "business_prices",
    columns: ["building_id", "item", "planet_id", "price"],
    key: ["building_id", "item"],
  },
  /** 생산시설 지분 주문(docs/adr/2026-11-15-building-screen.md — open·done·cancelled) */
  businessShareOrders: {
    name: "business_share_orders",
    columns: [
      "id",
      "building_id",
      "planet_id",
      "owner_id",
      "side",
      "price",
      "shares",
      "locked",
      "seq",
      "placed_at_ms",
      "exchange_id",
      "state",
      "filled",
      "clear_price",
      "done_at_ms",
    ],
    key: ["id"],
  },
  /** 생산시설 지분 동시호가 회차(추가만) */
  businessShareRounds: {
    name: "business_share_rounds",
    columns: ["id", "building_id", "planet_id", "at_ms", "price", "shares"],
    key: [],
  },
} as const satisfies Record<string, TableSpec>;
