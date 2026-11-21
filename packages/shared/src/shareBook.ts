// 지분 호가창 모양(사업장 지분·도시 정부 지분 공통) — 기획 D-583(질문 2438 답 "호가창처럼 거래가능"), D-125(동시호가 그대로 — "기존기술을 그대로
// 사용하자 빠른 구현이 먼저다"), docs/adr/2026-11-21-share-market.md.
// - 체결은 그대로 동시호가(회차마다 한 값)다. 화면은 걸린 주문을 값마다 모아 호가창처럼 보인다(값 칸마다 주 수·주문 수).
// - 살 쪽은 높은 값 차례, 팔 쪽은 낮은 값 차례, 한 쪽마다 위에서 depth칸만. 누가 낸 주문인지는 보이지 않는다.
// 서버·화면이 같이 쓴다. 정수(BigInt)만 쓴다.

/** 호가창 한 칸(값 하나에 걸린 주 수 합·주문 수) */
export interface ShareBookLevel {
  /** 1주 값(화폐 최소 단위) */
  readonly price: string;
  readonly shares: string;
  readonly orders: number;
}

/** 호가창(살 쪽 = 높은 값 차례, 팔 쪽 = 낮은 값 차례) */
export interface ShareBookView {
  readonly bids: readonly ShareBookLevel[];
  readonly asks: readonly ShareBookLevel[];
}

/** 지금 회차를 바로 닫으면 날 체결가·체결 주 수(동시호가 미리 보기). 체결이 없으면 null */
export interface ShareExpectedView {
  readonly price: string;
  readonly shares: string;
}

/** 한 쪽마다 보이는 값 칸 수 */
export const SHARE_BOOK_DEPTH = 10;

export const EMPTY_SHARE_BOOK: ShareBookView = { bids: [], asks: [] };

interface BookOrder {
  readonly side: "buy" | "sell";
  readonly price: bigint;
  readonly lots: bigint;
}

/** 걸린 주문 → 호가창(값마다 모음) */
export function shareBookLevels(orders: Iterable<BookOrder>, depth = SHARE_BOOK_DEPTH): ShareBookView {
  const bids = new Map<bigint, { shares: bigint; orders: number }>();
  const asks = new Map<bigint, { shares: bigint; orders: number }>();
  for (const order of orders) {
    if (order.lots <= 0n) continue;
    const side = order.side === "buy" ? bids : asks;
    const level = side.get(order.price) ?? { shares: 0n, orders: 0 };
    level.shares += order.lots;
    level.orders += 1;
    side.set(order.price, level);
  }
  const rows = (map: Map<bigint, { shares: bigint; orders: number }>, high: boolean): ShareBookLevel[] =>
    [...map]
      .toSorted((a, b) => (a[0] === b[0] ? 0 : a[0] > b[0] === high ? -1 : 1))
      .slice(0, Math.max(0, Math.trunc(depth)))
      .map(([price, level]) => ({
        price: String(price),
        shares: String(level.shares),
        orders: level.orders,
      }));
  return { bids: rows(bids, true), asks: rows(asks, false) };
}

const two = (value: number): string => String(value).padStart(2, "0");

/** 남은 시간(ms) → "분:초" 또는 "시:분:초"(화면 회차 시계) */
export function countdownText(leftMs: number): string {
  const total = Math.max(0, Math.ceil(leftMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
