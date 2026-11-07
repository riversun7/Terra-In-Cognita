// 물자 거래소 표(docs/adr/2026-11-07-play-flow.md "WP4 도시 경제·거래소", 경제 코어 ADR 2026-10-31-economy-core.md 4절) — schema.ts가
// 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts). world_owners는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환 가져오기가
// 문제되지 않는다. 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
// - market_books: 도시 × 물건 거래소 하나(ID가 원장 에스크로 계정 escrow:goods:<ID>·escrow:cash:<ID>:<화폐>를 가리킨다 — 바뀌면 안 된다).
//   도시가 폐허가 되어 world_cities 행이 지워져도 남는다(외래 키 없음).
// - market_orders: 주문 한 줄. 걸린 주문(open)은 부팅 때 같은 차례(seq)로 호가창에 다시 놓는다. locked = 지금 에스크로에 묶인 양
//   (팔 쪽 = 남은 묶음 × 묶음 크기의 물건 기본 단위, 살 쪽 = 값 × 남은 묶음의 화폐) → 불변 조건 M1(에스크로 잔고 = 걸린 주문 locked 합).
//   유저 주문은 끝나도(체결·취소·만료) 남겨 내 주문 기록으로 보인다. NPC 세력 주문은 끝나면 지운다(거래 판단마다 다시 건다).
// - market_trades: 체결 한 건(추가만). 차트·최근 체결·마지막 값·24시간 수치를 부팅 때 다시 채운다.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { worldOwners } from "./schema.ts";

/** 도시 × 물건 거래소(ID = 에스크로 계정 열쇠) */
export const marketBooks = pgTable(
  "market_books",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    /** 거래소가 있는 도시(창고 위치). 폐허가 되어 도시 행이 지워져도 남는다 */
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    /** 팩 아이템 ID(원장 자산은 item:<ID>) */
    item: text("item").notNull(),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("market_books_city_item").on(table.cityId, table.item)],
);

/** 주문 한 줄(값 = 묶음 하나당 화폐 최소 단위, 수량 = 묶음 수) */
export const marketOrders = pgTable(
  "market_orders",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    marketId: bigint("market_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => marketBooks.id),
    ownerId: bigint("owner_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => worldOwners.id),
    side: text("side").notNull(),
    price: bigint("price", { mode: "bigint" }).notNull(),
    /** 처음 수량(묶음) */
    qty: bigint("qty", { mode: "bigint" }).notNull(),
    /** 남은 수량(묶음) */
    remaining: bigint("remaining", { mode: "bigint" }).notNull(),
    /** 지금 에스크로에 묶인 양(원장 기본 단위·화폐 최소 단위). 끝난 주문은 0 */
    locked: bigint("locked", { mode: "bigint" }).notNull(),
    /** 건 차례(같은 값 안의 시간 우선, 부팅 복원) */
    seq: integer("seq").notNull(),
    placedAtMs: bigint("placed_at_ms", { mode: "number" }).notNull(),
    expiresAtMs: bigint("expires_at_ms", { mode: "number" }).notNull(),
    /** open · filled · cancelled · expired */
    state: text("state").notNull(),
    doneAtMs: bigint("done_at_ms", { mode: "number" }),
  },
  (table) => [
    index("market_orders_market_idx").on(table.marketId),
    index("market_orders_owner_idx").on(table.ownerId),
    check("market_orders_side", sql`${table.side} in ('buy', 'sell')`),
    check("market_orders_state", sql`${table.state} in ('open', 'filled', 'cancelled', 'expired')`),
    check(
      "market_orders_amounts",
      sql`${table.price} > 0 and ${table.qty} > 0 and ${table.remaining} >= 0 and ${table.remaining} <= ${table.qty} and ${table.locked} >= 0`,
    ),
    check("market_orders_done", sql`(${table.state} = 'open') = (${table.doneAtMs} is null)`),
  ],
);

/** 체결 한 건(추가만) */
export const marketTrades = pgTable(
  "market_trades",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    marketId: bigint("market_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => marketBooks.id),
    price: bigint("price", { mode: "bigint" }).notNull(),
    qty: bigint("qty", { mode: "bigint" }).notNull(),
    /** 들어온 주문의 쪽(buy = 매도 호가를 사 갔다) */
    takerSide: text("taker_side").notNull(),
    makerOrderId: bigint("maker_order_id", { mode: "number" }).notNull(),
    takerOrderId: bigint("taker_order_id", { mode: "number" }).notNull(),
    makerOwnerId: bigint("maker_owner_id", { mode: "number" }).notNull(),
    takerOwnerId: bigint("taker_owner_id", { mode: "number" }).notNull(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("market_trades_market_at_idx").on(table.marketId, table.atMs),
    check("market_trades_side", sql`${table.takerSide} in ('buy', 'sell')`),
    check("market_trades_amounts", sql`${table.price} > 0 and ${table.qty} > 0`),
  ],
);
