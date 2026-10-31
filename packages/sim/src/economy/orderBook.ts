// 물자 호가창(연속 체결) — docs/adr/2026-10-31-economy-core.md 4절, 기획 D-125(물자 = 연속 체결)·D-411 1
// 순수 자료 구조다(원장·저장을 모른다). 묶어 두기(에스크로)와 체결 정산은 goodsMarket.ts가 장부로 한다.
// - 차례: 가격 우선(살 쪽은 높은 값, 팔 쪽은 낮은 값), 같은 값이면 먼저 건 주문(seq). 체결가는 걸려 있던 주문의 값.
// - 들어온 주문은 맞는 반대쪽을 차례로 먹고, 남은 양은 걸어 둔다(부분 체결). 자기 주문과는 체결하지 않는다(건너뛰고 둔다).
// - 값·수량은 양의 정수(BigInt, 값 = 물건 1개당 화폐 최소 단위). 반올림이 없다.
// - 부팅 복원: 걸린 주문 목록(seq 포함)으로 다시 만들면 같은 차례가 된다(createOrderBook(orders)).

export type Side = "buy" | "sell";

export interface OrderInput {
  readonly id: number;
  readonly owner: number;
  readonly side: Side;
  /** 물건 1개당 값(화폐 최소 단위) */
  readonly price: bigint;
  readonly qty: bigint;
  /** 이 시각이 되면 거둔다(E10 걸어 둔 주문 만료) */
  readonly expiresAtMs: number;
}

export interface BookOrder {
  readonly id: number;
  readonly owner: number;
  readonly side: Side;
  readonly price: bigint;
  readonly expiresAtMs: number;
  /** 건 차례(같은 값 안의 시간 우선) */
  readonly seq: number;
  remaining: bigint;
}

export interface BookFill {
  readonly makerId: number;
  readonly makerOwner: number;
  readonly takerId: number;
  readonly takerOwner: number;
  /** 살 쪽(true면 들어온 주문이 샀다) */
  readonly takerSide: Side;
  readonly price: bigint;
  readonly qty: bigint;
}

export interface OrderBook {
  /** 주문을 넣는다: 체결 목록과 걸어 둔 나머지(없으면 undefined) */
  place(input: OrderInput): { fills: BookFill[]; rested: BookOrder | undefined };
  /** 걸린 주문을 뺀다(없으면 undefined) */
  cancel(id: number): BookOrder | undefined;
  /** 만료 시각 ≤ nowMs인 주문을 빼서 돌려준다(건 차례) */
  expire(nowMs: number): BookOrder[];
  get(id: number): BookOrder | undefined;
  /** 그쪽의 가장 좋은 주문 */
  best(side: Side): BookOrder | undefined;
  /** 걸린 주문 전부(건 차례) */
  orders(): BookOrder[];
}

/** a가 같은 쪽에서 b보다 앞인가 */
function ahead(a: BookOrder, b: BookOrder): boolean {
  if (a.price !== b.price) return a.side === "buy" ? a.price > b.price : a.price < b.price;
  return a.seq < b.seq;
}

export function createOrderBook(restore: readonly BookOrder[] = []): OrderBook {
  /** 쪽마다 차례대로 놓은 배열(앞이 먼저 체결) */
  const sides: Record<Side, BookOrder[]> = { buy: [], sell: [] };
  const byId = new Map<number, BookOrder>();
  let nextSeq = 1;

  const insert = (order: BookOrder): void => {
    const list = sides[order.side];
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const at = list[mid];
      if (at && ahead(at, order)) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, order);
    byId.set(order.id, order);
  };

  const remove = (order: BookOrder): void => {
    const list = sides[order.side];
    const index = list.indexOf(order);
    if (index >= 0) list.splice(index, 1);
    byId.delete(order.id);
  };

  for (const order of [...restore].toSorted((a, b) => a.seq - b.seq)) {
    insert({ ...order });
    nextSeq = Math.max(nextSeq, order.seq + 1);
  }

  return {
    place(input) {
      if (input.price <= 0n || input.qty <= 0n) throw new RangeError("price and qty must be positive");
      if (byId.has(input.id)) throw new RangeError(`duplicate order id ${input.id}`);
      const fills: BookFill[] = [];
      let left = input.qty;
      const opposite = sides[input.side === "buy" ? "sell" : "buy"];
      for (let index = 0; left > 0n && index < opposite.length; ) {
        const maker = opposite[index];
        if (!maker) break;
        const crosses = input.side === "buy" ? maker.price <= input.price : maker.price >= input.price;
        if (!crosses) break;
        if (maker.owner === input.owner) {
          index += 1;
          continue;
        }
        const qty = left < maker.remaining ? left : maker.remaining;
        fills.push({
          makerId: maker.id,
          makerOwner: maker.owner,
          takerId: input.id,
          takerOwner: input.owner,
          takerSide: input.side,
          price: maker.price,
          qty,
        });
        left -= qty;
        maker.remaining -= qty;
        if (maker.remaining === 0n) {
          opposite.splice(index, 1);
          byId.delete(maker.id);
        }
      }
      if (left === 0n) return { fills, rested: undefined };
      const rested: BookOrder = {
        id: input.id,
        owner: input.owner,
        side: input.side,
        price: input.price,
        expiresAtMs: input.expiresAtMs,
        seq: nextSeq++,
        remaining: left,
      };
      insert(rested);
      return { fills, rested };
    },
    cancel(id) {
      const order = byId.get(id);
      if (!order) return undefined;
      remove(order);
      return order;
    },
    expire(nowMs) {
      const due = [...byId.values()]
        .filter((order) => order.expiresAtMs <= nowMs)
        .toSorted((a, b) => a.seq - b.seq);
      for (const order of due) remove(order);
      return due;
    },
    get(id) {
      return byId.get(id);
    },
    best(side) {
      return sides[side][0];
    },
    orders() {
      return [...byId.values()].toSorted((a, b) => a.seq - b.seq);
    },
  };
}
