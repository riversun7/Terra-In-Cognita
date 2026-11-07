// 물자 거래소 부팅 읽기 — docs/adr/2026-11-07-play-flow.md WP4. 걸린 주문(seq 그대로)·유저의 최근 끝난 주문·최근 체결·ID 상한.
// 쓰기는 월드 쓰기 대기열 하나라 부팅 때 한 번 읽고 그 뒤는 메모리가 원본의 캐시다.
import type { Side } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import {
  DONE_KEEP,
  type DoneOrder,
  type DoneState,
  type LoadedMarkets,
  TRADE_WINDOW_MS,
  type TradeRecord,
} from "./books.ts";

const side = (value: unknown): Side => (value === "sell" ? "sell" : "buy");
const doneState = (value: unknown): DoneState =>
  value === "filled" ? "filled" : value === "expired" ? "expired" : "cancelled";

export async function loadMarkets(pool: QueryPool, nowMs: number): Promise<LoadedMarkets> {
  const books = await pool.query(`select id, city_id, item from market_books order by id`);
  const open = await pool.query(
    `select id, market_id, owner_id, side, price, qty, remaining, seq, placed_at_ms, expires_at_ms
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
    `select id, market_id, price, qty, taker_side, maker_order_id, taker_order_id, maker_owner_id, taker_owner_id, at_ms
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
    })),
    open: open.rows.map((row) => ({
      marketId: Number(row.market_id),
      qty: BigInt(String(row.qty)),
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
      }),
    ),
    // 주문 ID는 체결 기록에 남은 것(지운 NPC 주문)보다도 커야 한다(같은 ID를 다시 쓰지 않는다)
    maxOrderId: Math.max(Number(top.orders ?? 0), Number(top.trade_orders ?? 0)),
    maxTradeId: Number(top.trades ?? 0),
    maxBookId: Number(top.books ?? 0),
  };
}
