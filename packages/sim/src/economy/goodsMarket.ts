// 물자 거래소(도시마다, 물건마다) — docs/adr/2026-10-31-economy-core.md 4절, ADR 8(에스크로·단일 작성자)
// 호가창(orderBook.ts)을 원장 장부에 묶는다. 장부 판단은 공용 장부 한 벌이고, 서버는 같은 거래소를 쓰기 대기열 고리로 저장한다.
// - 주문을 걸 때 묶는다: 팔 쪽 물건(그 도시 창고 계정) → 물건 에스크로, 살 쪽 돈(값 × 수량) → 돈 에스크로.
//   모자라면 거절하고 아무것도 바꾸지 않는다.
// - 체결 하나 = 장부 거래 하나: 물건 에스크로 → 산 쪽 창고(그 도시), 돈 에스크로 → 판 쪽(총액 − 거래세) + 국고(거래세).
//   산 쪽이 들어온 주문이면 묶은 값과 체결가의 차이를 돌려준다. 체결가는 걸려 있던 주문의 값(orderBook.ts).
// - 거래세 = ⌊총액 × 세율(만분율) ÷ 10000⌋(버림), 판 쪽이 내고 그 도시를 가진 나라의 국고로 간다(D-128·D-131, 기술 기본안).
// - 불변식: 물건 에스크로 = 걸린 팔 주문 남은 양 합, 돈 에스크로 = 걸린 살 주문 (값 × 남은 양) 합(checkEscrow).
// - 걷은 거래세 누적(taxCollected, 읽기 전용 통계): 도시 세금 정산(D-304, society/dividends.ts)이 기간 차이를 쓴다. 장부는 바꾸지 않는다.
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import { type BookFill, type BookOrder, type OrderBook, type Side, createOrderBook } from "./orderBook.ts";

export interface GoodsMarketConfig {
  readonly id: number;
  /** 거래소가 있는 도시(물건 창고 위치) */
  readonly location: number;
  /** 물건 자산 코드 */
  readonly item: string;
  /** 값을 매기는 화폐 자산 코드(그 도시를 가진 나라의 화폐) */
  readonly currency: string;
  /** 거래세(만분율) */
  readonly taxBp: number;
  /** 거래세를 받는 국고의 주인(세력) */
  readonly treasuryOwner: number;
}

export type PlaceResult =
  | { readonly ok: true; readonly orderId: number; readonly fills: readonly BookFill[] }
  | { readonly ok: false; readonly reason: "insufficient" };

export interface GoodsMarket {
  readonly config: GoodsMarketConfig;
  /** 마지막 체결가(없으면 undefined) */
  readonly lastPrice: bigint | undefined;
  /** 체결 수·체결 수량(누적) */
  readonly trades: number;
  readonly volume: bigint;
  /** 걷은 거래세 누적(화폐가 바뀌어도 이어 센다. 쓰는 쪽이 주인이 바뀔 때 기준점을 다시 잡는다) */
  readonly taxCollected: bigint;
  place(
    owner: number,
    side: Side,
    price: bigint,
    qty: bigint,
    nowMs: number,
    expiresAtMs: number,
  ): PlaceResult;
  cancel(orderId: number, nowMs?: number): boolean;
  /** 그 주인의 걸린 주문을 모두 취소한다. 취소한 수 */
  cancelOwner(owner: number, nowMs: number): number;
  /** 만료 시각이 된 주문을 거둔다. 거둔 수 */
  expire(nowMs: number): number;
  /** 도시 주인이 바뀌면: 걸린 주문을 모두 돌려준 뒤 화폐·국고·세율을 바꾼다 */
  retarget(nowMs: number, currency: string, treasuryOwner: number, taxBp: number): void;
  orders(): BookOrder[];
  /** 그쪽의 가장 좋은 걸린 주문 */
  best(side: Side): BookOrder | undefined;
  checkEscrow(): string[];
}

/** 0이 아닌 항목만 넣는다(장부는 0 항목을 받지 않는다) */
function push(entries: LedgerEntry[], account: number, amount: bigint): void {
  if (amount !== 0n) entries.push({ account, amount });
}

export function createGoodsMarket(
  initial: GoodsMarketConfig,
  book: LedgerBook,
  nextOrderId: () => number,
  restore: readonly BookOrder[] = [],
): GoodsMarket {
  let config = initial;
  const orders: OrderBook = createOrderBook(restore);
  let lastPrice: bigint | undefined;
  let trades = 0;
  let volume = 0n;
  let taxCollected = 0n;

  const goodsEscrow = (): number =>
    book.systemAccount(`escrow:goods:${config.id}`, config.item, config.location);
  const cashEscrow = (): number =>
    book.systemAccount(`escrow:cash:${config.id}:${config.currency}`, config.currency);
  const goodsOf = (owner: number): number => book.ownerAccount(owner, config.item, config.location);
  const cashOf = (owner: number): number => book.ownerAccount(owner, config.currency);

  const refund = (order: BookOrder, atMs: number): void => {
    if (order.remaining === 0n) return;
    const entries: LedgerEntry[] = [];
    if (order.side === "sell") {
      push(entries, goodsEscrow(), -order.remaining);
      push(entries, goodsOf(order.owner), order.remaining);
    } else {
      const amount = order.price * order.remaining;
      push(entries, cashEscrow(), -amount);
      push(entries, cashOf(order.owner), amount);
    }
    book.post({ kind: "order_refund", atMs, entries });
  };

  const settle = (fill: BookFill, takerPrice: bigint, atMs: number): void => {
    const buyer = fill.takerSide === "buy" ? fill.takerOwner : fill.makerOwner;
    const seller = fill.takerSide === "buy" ? fill.makerOwner : fill.takerOwner;
    const gross = fill.price * fill.qty;
    const tax = (gross * BigInt(config.taxBp)) / 10_000n;
    const improvement = fill.takerSide === "buy" ? (takerPrice - fill.price) * fill.qty : 0n;
    const entries: LedgerEntry[] = [];
    push(entries, goodsEscrow(), -fill.qty);
    push(entries, goodsOf(buyer), fill.qty);
    push(entries, cashEscrow(), -(gross + improvement));
    push(entries, cashOf(seller), gross - tax);
    push(entries, cashOf(config.treasuryOwner), tax);
    push(entries, cashOf(buyer), improvement);
    book.post({ kind: "order_fill", atMs, entries });
    lastPrice = fill.price;
    trades += 1;
    volume += fill.qty;
    taxCollected += tax;
  };

  return {
    get config() {
      return config;
    },
    get lastPrice() {
      return lastPrice;
    },
    get trades() {
      return trades;
    },
    get volume() {
      return volume;
    },
    get taxCollected() {
      return taxCollected;
    },
    place(owner, side, price, qty, nowMs, expiresAtMs) {
      if (price <= 0n || qty <= 0n) throw new RangeError("price and qty must be positive");
      const from = side === "sell" ? goodsOf(owner) : cashOf(owner);
      const lock = side === "sell" ? qty : price * qty;
      if (book.balance(from) < lock) return { ok: false, reason: "insufficient" };
      book.post({
        kind: "order_escrow",
        atMs: nowMs,
        entries: [
          { account: from, amount: -lock },
          { account: side === "sell" ? goodsEscrow() : cashEscrow(), amount: lock },
        ],
      });
      const orderId = nextOrderId();
      const { fills } = orders.place({ id: orderId, owner, side, price, qty, expiresAtMs });
      for (const fill of fills) settle(fill, price, nowMs);
      return { ok: true, orderId, fills };
    },
    cancel(orderId, nowMs = 0) {
      const order = orders.cancel(orderId);
      if (!order) return false;
      refund(order, nowMs);
      return true;
    },
    cancelOwner(owner, nowMs) {
      let count = 0;
      for (const order of orders.orders()) {
        if (order.owner !== owner) continue;
        orders.cancel(order.id);
        refund(order, nowMs);
        count += 1;
      }
      return count;
    },
    expire(nowMs) {
      const due = orders.expire(nowMs);
      for (const order of due) refund(order, nowMs);
      return due.length;
    },
    retarget(nowMs, currency, treasuryOwner, taxBp) {
      for (const order of orders.orders()) {
        orders.cancel(order.id);
        refund(order, nowMs);
      }
      if (currency !== config.currency) lastPrice = undefined;
      config = { ...config, currency, treasuryOwner, taxBp };
    },
    orders() {
      return orders.orders();
    },
    best(side) {
      return orders.best(side);
    },
    checkEscrow() {
      let goods = 0n;
      let cash = 0n;
      for (const order of orders.orders()) {
        if (order.side === "sell") goods += order.remaining;
        else cash += order.price * order.remaining;
      }
      const problems: string[] = [];
      if (book.balance(goodsEscrow()) !== goods)
        problems.push(`escrow goods mismatch in market ${config.id}`);
      if (book.balance(cashEscrow()) !== cash) problems.push(`escrow cash mismatch in market ${config.id}`);
      return problems;
    },
  };
}
