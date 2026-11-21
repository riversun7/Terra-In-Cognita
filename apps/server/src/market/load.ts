// 물자 거래소·환전 부팅 읽기 — docs/adr/2026-11-07-play-flow.md WP4·WP6. 걸린 주문(seq 그대로)·유저의 최근 끝난 주문·최근 체결·ID 상한.
// 쓰기는 월드 쓰기 대기열 하나라 부팅 때 한 번 읽고 그 뒤는 메모리가 원본의 캐시다.
import type { Side } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import {
  DONE_KEEP,
  LEGACY_MARKET_CURRENCY,
  type DoneOrder,
  type DoneState,
  type LoadedMarkets,
  TRADE_WINDOW_MS,
  type TradeRecord,
} from "./books.ts";
import {
  FX_DONE_KEEP,
  FX_ROUND_WINDOW_MS,
  type FxDoneOrder,
  type FxRoundRecord,
  type LoadedFx,
} from "./fx.ts";

const side = (value: unknown): Side => (value === "sell" ? "sell" : "buy");
const optionalBig = (value: unknown): bigint | undefined =>
  typeof value === "string" || typeof value === "number" || typeof value === "bigint"
    ? BigInt(value)
    : undefined;
/** 화폐 칸(비었으면 null) */
const optionalText = (value: unknown): string | null => (typeof value === "string" ? value : null);
const doneState = (value: unknown): DoneState =>
  value === "filled" ? "filled" : value === "expired" ? "expired" : "cancelled";

export async function loadMarkets(pool: QueryPool, nowMs: number): Promise<LoadedMarkets> {
  const books = await pool.query(
    `select id, city_id, item, currency, created_at_ms from market_books order by id`,
  );
  const open = await pool.query(
    `select id, market_id, owner_id, side, price, qty, remaining, locked, seq, placed_at_ms, expires_at_ms
     from market_orders where state = 'open' order by id`,
  );
  // 유저의 끝난 주문(주인마다 최근 DONE_KEEP개)
  const done = await pool.query(
    `select id, market_id, owner_id, side, price, qty, remaining, state, done_at_ms from (
       select o.*, row_number() over (partition by o.owner_id order by o.done_at_ms desc, o.id desc) as n
       from market_orders o where o.state <> 'open') t
     where n <= $1 order by owner_id, done_at_ms desc`,
    [DONE_KEEP],
  );
  const trades = await pool.query(
    `select id, market_id, price, qty, taker_side, maker_order_id, taker_order_id, maker_owner_id, taker_owner_id, at_ms,
            currency
     from market_trades where at_ms >= $1 order by id`,
    [nowMs - TRADE_WINDOW_MS],
  );
  const max = await pool.query(
    `select (select coalesce(max(id), 0) from market_orders) as orders,
            (select coalesce(max(greatest(maker_order_id, taker_order_id)), 0) from market_trades) as trade_orders,
            (select coalesce(max(id), 0) from market_trades) as trades,
            (select coalesce(max(id), 0) from market_books) as books`,
  );
  const top = max.rows[0] ?? {};
  return {
    books: books.rows.map((row) => ({
      id: Number(row.id),
      cityId: Number(row.city_id),
      item: String(row.item),
      currency: optionalText(row.currency),
      createdAtMs: Number(row.created_at_ms),
    })),
    open: open.rows.map((row) => ({
      marketId: Number(row.market_id),
      qty: BigInt(String(row.qty)),
      locked: BigInt(String(row.locked)),
      placedAtMs: Number(row.placed_at_ms),
      order: {
        id: Number(row.id),
        owner: Number(row.owner_id),
        side: side(row.side),
        price: BigInt(String(row.price)),
        expiresAtMs: Number(row.expires_at_ms),
        seq: Number(row.seq),
        remaining: BigInt(String(row.remaining)),
      },
    })),
    done: done.rows.map(
      (row): DoneOrder => ({
        id: Number(row.id),
        marketId: Number(row.market_id),
        ownerId: Number(row.owner_id),
        side: side(row.side),
        price: BigInt(String(row.price)),
        qty: BigInt(String(row.qty)),
        filled: BigInt(String(row.qty)) - BigInt(String(row.remaining)),
        state: doneState(row.state),
        atMs: Number(row.done_at_ms),
      }),
    ),
    trades: trades.rows.map(
      (row): TradeRecord => ({
        id: Number(row.id),
        marketId: Number(row.market_id),
        at: Number(row.at_ms),
        price: BigInt(String(row.price)),
        qty: BigInt(String(row.qty)),
        side: side(row.taker_side),
        makerOrderId: Number(row.maker_order_id),
        takerOrderId: Number(row.taker_order_id),
        makerOwner: Number(row.maker_owner_id),
        takerOwner: Number(row.taker_owner_id),
        currency: optionalText(row.currency) ?? LEGACY_MARKET_CURRENCY,
      }),
    ),
    // 주문 ID는 체결 기록에 남은 것(지운 NPC 주문)보다도 커야 한다(같은 ID를 다시 쓰지 않는다)
    maxOrderId: Math.max(Number(top.orders ?? 0), Number(top.trade_orders ?? 0)),
    maxTradeId: Number(top.trades ?? 0),
    maxBookId: Number(top.books ?? 0),
  };
}

/** 환전 부팅 읽기(docs/adr/2026-11-07-play-flow.md WP6): 짝·걸린 주문(seq 그대로)·유저의 최근 끝난 주문·최근 회차·짝마다 마지막 체결가·ID 상한 */
export async function loadFx(pool: QueryPool, nowMs: number): Promise<LoadedFx> {
  const pairs = await pool.query(`select id, currency, created_at_ms from fx_pairs order by id`);
  const open = await pool.query(
    `select id, pair_id, owner_id, side, price, lots, seq, placed_at_ms from fx_orders where state = 'open' order by id`,
  );
  const done = await pool.query(
    `select id, pair_id, owner_id, side, price, lots, filled_lots, clear_price, state, done_at_ms from (
       select o.*, row_number() over (partition by o.owner_id order by o.done_at_ms desc, o.id desc) as n
       from fx_orders o where o.state <> 'open') t
     where n <= $1 order by owner_id, done_at_ms desc`,
    [FX_DONE_KEEP],
  );
  const rounds = await pool.query(
    `select id, pair_id, at_ms, price, lots from fx_rounds where at_ms >= $1 order by id`,
    [nowMs - FX_ROUND_WINDOW_MS],
  );
  const last = await pool.query(
    `select distinct on (pair_id) pair_id, price from fx_rounds where price is not null
     order by pair_id, at_ms desc, id desc`,
  );
  const max = await pool.query(
    `select (select coalesce(max(id), 0) from fx_orders) as orders,
            (select coalesce(max(id), 0) from fx_rounds) as rounds,
            (select coalesce(max(id), 0) from fx_pairs) as pairs`,
  );
  const top = max.rows[0] ?? {};
  return {
    pairs: pairs.rows.map((row) => ({
      id: Number(row.id),
      currency: String(row.currency),
      createdAtMs: Number(row.created_at_ms),
    })),
    open: open.rows.map((row) => ({
      pairId: Number(row.pair_id),
      placedAtMs: Number(row.placed_at_ms),
      order: {
        id: Number(row.id),
        owner: Number(row.owner_id),
        side: side(row.side),
        price: BigInt(String(row.price)),
        lots: BigInt(String(row.lots)),
        seq: Number(row.seq),
      },
    })),
    done: done.rows.map(
      (row): FxDoneOrder => ({
        id: Number(row.id),
        pairId: Number(row.pair_id),
        ownerId: Number(row.owner_id),
        side: side(row.side),
        price: BigInt(String(row.price)),
        lots: BigInt(String(row.lots)),
        filled: BigInt(String(row.filled_lots)),
        clearPrice: optionalBig(row.clear_price),
        state: row.state === "cancelled" ? "cancelled" : "done",
        atMs: Number(row.done_at_ms),
      }),
    ),
    rounds: rounds.rows.map(
      (row): FxRoundRecord => ({
        id: Number(row.id),
        pairId: Number(row.pair_id),
        at: Number(row.at_ms),
        price: optionalBig(row.price),
        lots: BigInt(String(row.lots)),
      }),
    ),
    lastPrice: new Map(last.rows.map((row) => [Number(row.pair_id), BigInt(String(row.price))])),
    maxOrderId: Number(top.orders ?? 0),
    maxRoundId: Number(top.rounds ?? 0),
    maxPairId: Number(top.pairs ?? 0),
  };
}
