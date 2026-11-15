// 환전 시장(동시호가) — docs/adr/2026-10-31-economy-core.md 5절
// 짝 하나 = (기준 쪽 화폐 base, 값 매기는 화폐 quote, 로트 크기). 값은 로트(base lotSize 최소 단위)당 quote 최소 단위.
// - 주문을 낼 때 묶는다: 살 쪽 quote(로트 × 상한), 팔 쪽 base(로트 × 로트 크기). 모자라면 거절.
// - 회차(run)마다 체결가 하나로 모두 체결하고, 회차가 끝나면 남은 주문은 돌려준다(주문은 한 회차만 산다).
//   회차 정산은 장부 거래 하나다(계정마다 합쳐 적는다). 수수료는 없다(E3 전환 수수료는 통화 제도 전환이 열릴 때).
// - 서버 몫(시뮬은 쓰지 않는다, 시뮬 출력 그대로 — docs/adr/2026-11-07-play-flow.md WP6): 회차 전에 내 주문 거두기(cancel, 묶은 것을 돌려줌),
//   부팅 복원(restore: 걸린 주문·지난 체결가·차례), 회차 결과의 주문마다 체결 로트(run().fills), 넣은 주문 ID(place().orderId).
// - 짝은 기준 통화(첫 고정 NPC 나라의 화폐, D-131 "기준 통화")와만 둔다(기술 기본안). 다른 두 화폐는 두 번 거친다.
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import { type AuctionOrder, clearCallAuction } from "./callAuction.ts";
import type { Side } from "./orderBook.ts";

export interface FxPair {
  readonly id: number;
  /** 사고파는 화폐(자산 코드) */
  readonly base: string;
  /** 값을 매기는 화폐(자산 코드) */
  readonly quote: string;
  /** 로트 하나 = base 최소 단위 몇 개 */
  readonly lotSize: bigint;
  /**
   * 에스크로 계정·거래 종류 앞머리(없으면 "fx" — 환전). 같은 동시호가를 다른 상품(사업장 지분 — 서버 business/shares.ts,
   * docs/adr/2026-11-15-building-screen.md)에 쓸 때 시스템 계정 escrow:<앞머리>:<ID>:… 와 거래 종류 <앞머리>_escrow·<앞머리>_clear·
   * <앞머리>_refund가 환전과 겹치지 않게 한다. 시뮬은 쓰지 않는다(출력 그대로)
   */
  readonly prefix?: string | undefined;
}

export interface FxOrder extends AuctionOrder {
  readonly side: Side;
}

/** 부팅 복원(서버): 걸린 주문(seq 그대로)·지난 체결가 */
export interface FxRestore {
  readonly orders?: readonly FxOrder[] | undefined;
  readonly lastPrice?: bigint | undefined;
}

export type FxPlaceResult = { readonly ok: true; readonly orderId: number } | { readonly ok: false };

export interface FxMarket {
  readonly pair: FxPair;
  readonly lastPrice: bigint | undefined;
  /** 회차마다 체결 로트 수 누적 */
  readonly volumeLots: bigint;
  place(owner: number, side: Side, price: bigint, lots: bigint, nowMs: number): FxPlaceResult;
  /** 회차를 닫는다: 체결가·체결 로트 수·주문마다 체결 로트(체결된 주문만) */
  run(nowMs: number): { price: bigint | undefined; lots: bigint; fills: ReadonlyMap<number, bigint> };
  /** 회차 전에 걸린 주문 하나를 거둔다(묶은 것을 돌려준다). 없으면 false */
  cancel(orderId: number, nowMs: number): boolean;
  orders(): readonly FxOrder[];
  checkEscrow(): string[];
}

export function createFxMarket(
  pair: FxPair,
  book: LedgerBook,
  nextOrderId: () => number,
  restore: FxRestore = {},
): FxMarket {
  let pending: FxOrder[] = [...(restore.orders ?? [])].toSorted((a, b) => a.seq - b.seq);
  let lastPrice: bigint | undefined = restore.lastPrice;
  let volumeLots = 0n;
  let seq = pending.reduce((max, order) => Math.max(max, order.seq), 0);
  const prefix = pair.prefix ?? "fx";
  const baseEscrow = (): number => book.systemAccount(`escrow:${prefix}:${pair.id}:base`, pair.base);
  const quoteEscrow = (): number => book.systemAccount(`escrow:${prefix}:${pair.id}:quote`, pair.quote);
  const refundKind = pair.prefix === undefined ? "order_refund" : `${prefix}_refund`;
  const lockOf = (order: { side: Side; price: bigint; lots: bigint }): bigint =>
    order.side === "buy" ? order.price * order.lots : order.lots * pair.lotSize;

  return {
    pair,
    get lastPrice() {
      return lastPrice;
    },
    get volumeLots() {
      return volumeLots;
    },
    place(owner, side, price, lots, nowMs) {
      if (price <= 0n || lots <= 0n) throw new RangeError("price and lots must be positive");
      const from = book.ownerAccount(owner, side === "buy" ? pair.quote : pair.base);
      const lock = lockOf({ side, price, lots });
      if (book.balance(from) < lock) return { ok: false };
      book.post({
        kind: `${prefix}_escrow`,
        atMs: nowMs,
        entries: [
          { account: from, amount: -lock },
          { account: side === "buy" ? quoteEscrow() : baseEscrow(), amount: lock },
        ],
      });
      seq += 1;
      const orderId = nextOrderId();
      pending.push({ id: orderId, owner, side, price, lots, seq });
      return { ok: true, orderId };
    },
    run(nowMs) {
      if (pending.length === 0) return { price: undefined, lots: 0n, fills: new Map() };
      const buys = pending.filter((order) => order.side === "buy");
      const sells = pending.filter((order) => order.side === "sell");
      const result = clearCallAuction(buys, sells, lastPrice);
      const price = result.price ?? 0n;
      const sums = new Map<number, bigint>();
      const add = (account: number, amount: bigint): void => {
        sums.set(account, (sums.get(account) ?? 0n) + amount);
      };
      for (const order of buys) {
        const filled = result.fills.get(order.id) ?? 0n;
        const locked = order.price * order.lots;
        add(quoteEscrow(), -locked);
        add(book.ownerAccount(order.owner, pair.quote), locked - filled * price);
        add(book.ownerAccount(order.owner, pair.base), filled * pair.lotSize);
      }
      for (const order of sells) {
        const filled = result.fills.get(order.id) ?? 0n;
        add(baseEscrow(), -order.lots * pair.lotSize);
        add(book.ownerAccount(order.owner, pair.base), (order.lots - filled) * pair.lotSize);
        add(book.ownerAccount(order.owner, pair.quote), filled * price);
      }
      const entries: LedgerEntry[] = [];
      for (const [account, amount] of sums) if (amount !== 0n) entries.push({ account, amount });
      if (entries.length > 0) book.post({ kind: `${prefix}_clear`, atMs: nowMs, entries });
      pending = [];
      if (result.price !== undefined) {
        lastPrice = result.price;
        volumeLots += result.lots;
      }
      return { price: result.price, lots: result.lots, fills: result.fills };
    },
    cancel(orderId, nowMs) {
      const order = pending.find((entry) => entry.id === orderId);
      if (!order) return false;
      pending = pending.filter((entry) => entry.id !== orderId);
      const lock = lockOf(order);
      book.post({
        kind: refundKind,
        atMs: nowMs,
        entries: [
          { account: order.side === "buy" ? quoteEscrow() : baseEscrow(), amount: -lock },
          {
            account: book.ownerAccount(order.owner, order.side === "buy" ? pair.quote : pair.base),
            amount: lock,
          },
        ],
      });
      return true;
    },
    orders() {
      return pending;
    },
    checkEscrow() {
      let base = 0n;
      let quote = 0n;
      for (const order of pending) {
        if (order.side === "buy") quote += lockOf(order);
        else base += lockOf(order);
      }
      const problems: string[] = [];
      if (book.balance(baseEscrow()) !== base) problems.push(`fx escrow base mismatch in pair ${pair.id}`);
      if (book.balance(quoteEscrow()) !== quote) problems.push(`fx escrow quote mismatch in pair ${pair.id}`);
      return problems;
    },
  };
}
