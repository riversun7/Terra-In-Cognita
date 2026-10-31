// 거래창 자료 모양 만들기 — 걸린 주문·체결 → 호가 단계·봉·24시간 수치(순수 함수, 시험 대상).
// 시안 시장(previewMarket.ts)이 쓰고, 서버가 거래소를 열면 같은 함수로 실제 호가창을 보낸다(R2 ADR "다시 볼 조건").
import type { BookLevel, Candle, TradeTick } from "@terra/shared/economy";
import type { BookOrder, Side } from "@terra/sim";

/** 화면에 보내는 호가 단계 수(쪽마다) */
export const BOOK_DEPTH = 10;
/** 화면에 보내는 최근 체결 수 */
export const RECENT_TRADES = 30;

export interface TradeLike {
  readonly at: number;
  readonly price: bigint;
  readonly qty: bigint;
  readonly side: Side;
}

/** 걸린 주문 → 쪽마다 값이 같은 것끼리 묶은 단계(매도 낮은 값 차례, 매수 높은 값 차례). me = 내 주체 */
export function bookLevels(
  orders: readonly BookOrder[],
  me: number,
  depth = BOOK_DEPTH,
): { asks: BookLevel[]; bids: BookLevel[] } {
  const group = (side: Side): BookLevel[] => {
    const byPrice = new Map<bigint, { qty: bigint; orders: number; mine: bigint }>();
    for (const order of orders) {
      if (order.side !== side || order.remaining <= 0n) continue;
      const level = byPrice.get(order.price) ?? { qty: 0n, orders: 0, mine: 0n };
      level.qty += order.remaining;
      level.orders += 1;
      if (order.owner === me) level.mine += order.remaining;
      byPrice.set(order.price, level);
    }
    const prices = [...byPrice.keys()].toSorted((a, b) => {
      const ascending = a < b ? -1 : a > b ? 1 : 0;
      return side === "sell" ? ascending : -ascending;
    });
    return prices.slice(0, depth).map((price) => {
      const level = byPrice.get(price) ?? { qty: 0n, orders: 0, mine: 0n };
      return { price: String(price), qty: String(level.qty), orders: level.orders, mine: String(level.mine) };
    });
  };
  return { asks: group("sell"), bids: group("buy") };
}

/** 최근 체결(새것 먼저, count개) */
export function recentTrades(trades: readonly TradeLike[], count = RECENT_TRADES): TradeTick[] {
  const out: TradeTick[] = [];
  for (let index = trades.length - 1; index >= 0 && out.length < count; index -= 1) {
    const trade = trades[index];
    if (!trade) continue;
    out.push({ at: trade.at, price: String(trade.price), qty: String(trade.qty), side: trade.side });
  }
  return out;
}

/**
 * 봉: [from, to) 를 candleMs로 나눠 칸마다 시가·고가·저가·종가·거래량. 체결이 없는 칸은 앞 종가로 채운다(거래량 0).
 * 첫 체결 앞의 빈 칸은 첫 체결가로 채운다. 체결이 하나도 없으면 빈 배열
 */
export function candles(trades: readonly TradeLike[], from: number, to: number, candleMs: number): Candle[] {
  const sorted = trades.filter((trade) => trade.at >= from && trade.at < to);
  const first = sorted[0];
  if (!first) return [];
  const count = Math.ceil((to - from) / candleMs);
  const out: Candle[] = [];
  let previous = first.price;
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const start = from + index * candleMs;
    const stop = start + candleMs;
    let open: bigint | undefined;
    let high = previous;
    let low = previous;
    let close = previous;
    let volume = 0n;
    while (cursor < sorted.length) {
      const trade = sorted[cursor];
      if (!trade || trade.at >= stop) break;
      if (open === undefined) {
        open = trade.price;
        high = trade.price;
        low = trade.price;
      }
      if (trade.price > high) high = trade.price;
      if (trade.price < low) low = trade.price;
      close = trade.price;
      volume += trade.qty;
      cursor += 1;
    }
    out.push({
      at: start,
      open: String(open ?? previous),
      high: String(high),
      low: String(low),
      close: String(close),
      volume: String(volume),
    });
    previous = close;
  }
  return out;
}

/** 바뀐 정도(만분율, 0 쪽으로 버림). 기준이 없거나 0이면 null */
export function changeBp(last: bigint | undefined, reference: bigint | undefined): number | null {
  if (last === undefined || reference === undefined || reference === 0n) return null;
  return Number(((last - reference) * 10_000n) / reference);
}

/** 창 안 체결의 마지막 값·고가·저가·거래량·첫 값(24시간 바뀜 기준) */
export function tradeStats(trades: readonly TradeLike[]): {
  last: bigint | undefined;
  first: bigint | undefined;
  high: bigint | undefined;
  low: bigint | undefined;
  volume: bigint;
} {
  let high: bigint | undefined;
  let low: bigint | undefined;
  let volume = 0n;
  for (const trade of trades) {
    if (high === undefined || trade.price > high) high = trade.price;
    if (low === undefined || trade.price < low) low = trade.price;
    volume += trade.qty;
  }
  return { last: trades.at(-1)?.price, first: trades[0]?.price, high, low, volume };
}
