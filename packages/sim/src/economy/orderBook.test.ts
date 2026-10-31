import { describe, expect, it } from "vitest";
import { type BookOrder, type OrderInput, createOrderBook } from "./orderBook.ts";

let nextId = 1;
const order = (
  owner: number,
  side: "buy" | "sell",
  price: number,
  qty: number,
  expiresAtMs = 1_000_000,
): OrderInput => ({
  id: nextId++,
  owner,
  side,
  price: BigInt(price),
  qty: BigInt(qty),
  expiresAtMs,
});
const view = (list: readonly BookOrder[]) =>
  list.map((o) => `${o.side}:${o.owner}:${o.price}x${o.remaining}`);

describe("물자 호가창(연속 체결, D-125)", () => {
  it("가격이 맞으면 바로 체결한다: 매도 호가 낮은 것부터, 체결가는 걸려 있던 주문 가격", () => {
    const book = createOrderBook();
    book.place(order(1, "sell", 100, 10));
    book.place(order(2, "sell", 99, 5));
    const { fills, rested } = book.place(order(3, "buy", 100, 12));
    expect(fills.map((f) => `${f.makerOwner}:${f.price}x${f.qty}`)).toEqual(["2:99x5", "1:100x7"]);
    expect(rested).toBeUndefined();
    expect(view(book.orders())).toEqual(["sell:1:100x3"]);
  });

  it("같은 가격이면 먼저 건 주문이 먼저다(가격·시간 우선)", () => {
    const book = createOrderBook();
    book.place(order(1, "buy", 50, 4));
    book.place(order(2, "buy", 50, 4));
    book.place(order(3, "buy", 51, 1));
    const { fills } = book.place(order(4, "sell", 50, 6));
    expect(fills.map((f) => `${f.makerOwner}:${f.price}x${f.qty}`)).toEqual(["3:51x1", "1:50x4", "2:50x1"]);
    expect(view(book.orders())).toEqual(["buy:2:50x3"]);
  });

  it("가격이 안 맞으면 남은 양을 걸어 두고, 가장 좋은 호가를 알려 준다", () => {
    const book = createOrderBook();
    book.place(order(1, "sell", 110, 3));
    const { fills, rested } = book.place(order(2, "buy", 100, 7));
    expect(fills).toEqual([]);
    expect(rested?.remaining).toBe(7n);
    expect(book.best("buy")?.price).toBe(100n);
    expect(book.best("sell")?.price).toBe(110n);
  });

  it("자기 주문과는 체결하지 않는다(자기 체결 방지: 건너뛰고 둔다)", () => {
    const book = createOrderBook();
    book.place(order(1, "sell", 10, 5));
    book.place(order(2, "sell", 11, 5));
    const { fills } = book.place(order(1, "buy", 11, 3));
    expect(fills.map((f) => `${f.makerOwner}:${f.price}x${f.qty}`)).toEqual(["2:11x3"]);
    expect(view(book.orders())).toEqual(["sell:1:10x5", "sell:2:11x2"]);
  });

  it("취소하면 남은 주문을 돌려주고, 만료 시각이 지난 주문은 거둔다", () => {
    const book = createOrderBook();
    const a = order(1, "buy", 10, 5, 100);
    const b = order(2, "buy", 9, 5, 200);
    book.place(a);
    book.place(b);
    expect(book.cancel(a.id)?.remaining).toBe(5n);
    expect(book.cancel(a.id)).toBeUndefined();
    expect(book.expire(199)).toEqual([]);
    expect(book.expire(200).map((o) => o.id)).toEqual([b.id]);
    expect(book.orders()).toEqual([]);
  });

  it("걸린 주문 목록으로 다시 만들면 같은 차례로 체결한다(부팅 복원)", () => {
    const original = createOrderBook();
    for (const input of [
      order(1, "sell", 20, 2),
      order(2, "sell", 20, 2),
      order(3, "sell", 19, 1),
      order(4, "buy", 15, 9),
    ])
      original.place(input);
    const restored = createOrderBook(original.orders());
    const taker = order(5, "buy", 20, 4);
    const fromOriginal = original.place({ ...taker });
    const fromRestored = restored.place({ ...taker });
    expect(fromRestored).toEqual(fromOriginal);
    expect(view(restored.orders())).toEqual(view(original.orders()));
  });

  it("값·수량이 양의 정수가 아니면 거절한다", () => {
    const book = createOrderBook();
    expect(() => book.place({ ...order(1, "buy", 1, 1), price: 0n })).toThrow(RangeError);
    expect(() => book.place({ ...order(1, "buy", 1, 1), qty: -1n })).toThrow(RangeError);
  });
});
