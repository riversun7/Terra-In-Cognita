// 물자 거래소 표(docs/adr/2026-11-07-play-flow.md "WP4 도시 경제·거래소", 경제 코어 ADR 2026-10-31-economy-core.md 4절) — schema.ts가
// 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts). world_owners는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환 가져오기가
// 문제되지 않는다. 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
// - market_books: 도시 × 물건 거래소 하나(ID가 원장 에스크로 계정 escrow:goods:<ID>·escrow:cash:<ID>:<화폐>를 가리킨다 — 바뀌면 안 된다).
//   도시가 폐허가 되어 world_cities 행이 지워져도 남는다(외래 키 없음).
// - market_orders: 주문 한 줄. 걸린 주문(open)은 부팅 때 같은 차례(seq)로 호가창에 다시 놓는다. locked = 지금 에스크로에 묶인 양
//   (팔 쪽 = 남은 묶음 × 묶음 크기의 물건 기본 단위, 살 쪽 = 값 × 남은 묶음의 화폐) → 불변 조건 M1(에스크로 잔고 = 걸린 주문 locked 합).
//   유저 주문은 끝나도(체결·취소·만료) 남겨 내 주문 기록으로 보인다. NPC 세력 주문은 끝나면 지운다(거래 판단마다 다시 건다).
// - market_trades: 체결 한 건(추가만). 차트·최근 체결·마지막 값·24시간 수치를 부팅 때 다시 채운다.
// - 나라 화폐(docs/adr/2026-11-07-play-flow.md WP6): market_books·market_trades의 currency = 값을 매긴 화폐(원장 자산 코드). 비어 있으면
//   WP4 때 쓴 시험 화폐(s3_test_credit)다(그 판 앱이 쓴 줄 — 열을 더하기만 해서 직전 판 앱이 그대로 돈다). 부팅 때 걸린 주문을 그 화폐로 되살린 뒤
//   도시 주인의 화폐와 다르면 주문을 돌려주고 화폐를 바꾼다(시뮬 retarget). 차트는 지금 화폐의 체결만 본다.
// - 환전(동시호가 D-125, 경제 ADR 5절): fx_pairs = 짝 하나(화폐 ↔ 기준 통화, ID = 에스크로 계정 escrow:fx:<ID>:base·quote의 열쇠),
//   fx_orders = 회차에 낸 주문(open은 부팅 때 같은 차례로 되살린다, locked = 지금 묶인 양 → 불변 조건 M2). 회차가 끝나면 유저 주문은 done
//   (체결 로트·체결가)으로 남기고 NPC 주문은 지운다. fx_rounds = 회차 결과(추가만, 지난 체결가·차트).
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
    /** 값을 매기는 화폐(원장 자산 코드). null = WP4 시험 화폐(s3_test_credit) */
    currency: text("currency"),
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
    /** 값을 매긴 화폐(원장 자산 코드). null = WP4 시험 화폐(s3_test_credit) */
    currency: text("currency"),
  },
  (table) => [
    index("market_trades_market_at_idx").on(table.marketId, table.atMs),
    check("market_trades_side", sql`${table.takerSide} in ('buy', 'sell')`),
    check("market_trades_amounts", sql`${table.price} > 0 and ${table.qty} > 0`),
  ],
);

/** 환전 짝 하나(화폐 ↔ 기준 통화). ID = 에스크로 계정 escrow:fx:<ID>:base·quote의 열쇠 — 바뀌면 안 된다 */
export const fxPairs = pgTable(
  "fx_pairs",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    /** 사고파는 화폐(원장 자산 코드 cur:<코드>) */
    currency: text("currency").notNull(),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("fx_pairs_currency").on(table.currency)],
);

/** 환전 주문 한 줄(값 = 로트당 기준 통화 최소 단위, 수량 = 로트 수) */
export const fxOrders = pgTable(
  "fx_orders",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    pairId: bigint("pair_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => fxPairs.id),
    ownerId: bigint("owner_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => worldOwners.id),
    side: text("side").notNull(),
    price: bigint("price", { mode: "bigint" }).notNull(),
    lots: bigint("lots", { mode: "bigint" }).notNull(),
    /** 지금 에스크로에 묶인 양(사기 = 값 × 로트의 기준 통화, 팔기 = 로트 × 로트 크기의 화폐). 끝난 주문은 0 */
    locked: bigint("locked", { mode: "bigint" }).notNull(),
    /** 낸 차례(같은 값 안의 시간 우선, 부팅 복원) */
    seq: integer("seq").notNull(),
    placedAtMs: bigint("placed_at_ms", { mode: "number" }).notNull(),
    /** open · done(회차가 끝남) · cancelled(회차 전에 거둠) */
    state: text("state").notNull(),
    /** 체결 로트(끝난 주문) */
    filledLots: bigint("filled_lots", { mode: "bigint" }).notNull(),
    /** 그 회차 체결가(체결이 없었으면 null) */
    clearPrice: bigint("clear_price", { mode: "bigint" }),
    doneAtMs: bigint("done_at_ms", { mode: "number" }),
  },
  (table) => [
    index("fx_orders_pair_idx").on(table.pairId),
    index("fx_orders_owner_idx").on(table.ownerId),
    check("fx_orders_side", sql`${table.side} in ('buy', 'sell')`),
    check("fx_orders_state", sql`${table.state} in ('open', 'done', 'cancelled')`),
    check(
      "fx_orders_amounts",
      sql`${table.price} > 0 and ${table.lots} > 0 and ${table.locked} >= 0 and ${table.filledLots} >= 0 and ${table.filledLots} <= ${table.lots}`,
    ),
    check("fx_orders_done", sql`(${table.state} = 'open') = (${table.doneAtMs} is null)`),
  ],
);

/** 환전 회차 결과 한 건(추가만) */
export const fxRounds = pgTable(
  "fx_rounds",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    pairId: bigint("pair_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => fxPairs.id),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
    /** 체결가(체결이 없었으면 null) */
    price: bigint("price", { mode: "bigint" }),
    lots: bigint("lots", { mode: "bigint" }).notNull(),
  },
  (table) => [
    index("fx_rounds_pair_at_idx").on(table.pairId, table.atMs),
    check("fx_rounds_amounts", sql`(${table.price} is null or ${table.price} > 0) and ${table.lots} >= 0`),
  ],
);
