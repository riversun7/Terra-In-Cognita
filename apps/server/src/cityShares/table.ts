// 도시(정부) 지분 시장 표의 쓰기 대기열 정의(world/persist/tables.ts가 펼쳐 넣는다 — 그 파일 줄 수 때문에 따로 둔다). 열 이름은 src/db/cityShareSchema.ts와 같다.
import type { TableSpec } from "../world/persist/tables.ts";

export const CITY_SHARE_TABLES = {
  /** 도시 지분 주문(open·done·cancelled — docs/adr/2026-11-21-share-market.md) */
  cityShareOrders: {
    name: "city_share_orders",
    columns: [
      "id",
      "city_id",
      "planet_id",
      "holder",
      "side",
      "price",
      "shares",
      "asset",
      "locked",
      "seq",
      "placed_at_ms",
      "state",
      "filled",
      "clear_price",
      "done_at_ms",
      "agenda_id",
      "exchange_id",
    ],
    key: ["id"],
  },
  /** 도시 지분 동시호가 회차(추가만) */
  cityShareRounds: {
    name: "city_share_rounds",
    columns: ["id", "city_id", "planet_id", "at_ms", "price", "shares", "asset"],
    key: [],
  },
} as const satisfies Record<string, TableSpec>;
