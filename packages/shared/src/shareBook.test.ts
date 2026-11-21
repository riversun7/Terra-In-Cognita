// 지분 호가창 모양 시험(D-583 "호가창처럼") — 값마다 모으기·차례·깊이, 회차 시계 글자
import { describe, expect, it } from "vitest";
import { countdownText, shareBookLevels } from "./shareBook.ts";

describe("지분 호가창", () => {
  it("값마다 주 수·주문 수를 모으고, 살 쪽은 높은 값·팔 쪽은 낮은 값 차례, 깊이만큼", () => {
    const book = shareBookLevels(
      [
        { side: "buy", price: 10n, lots: 5n },
        { side: "buy", price: 12n, lots: 1n },
        { side: "buy", price: 10n, lots: 3n },
        { side: "sell", price: 15n, lots: 2n },
        { side: "sell", price: 13n, lots: 4n },
        { side: "sell", price: 20n, lots: 9n },
        { side: "sell", price: 14n, lots: 0n },
      ],
      2,
    );
    expect(book.bids).toEqual([
      { price: "12", shares: "1", orders: 1 },
      { price: "10", shares: "8", orders: 2 },
    ]);
    expect(book.asks).toEqual([
      { price: "13", shares: "4", orders: 1 },
      { price: "15", shares: "2", orders: 1 },
    ]);
    expect(shareBookLevels([])).toEqual({ bids: [], asks: [] });
  });

  it("회차 시계: 분:초, 한 시간 넘으면 시:분:초, 지나면 0:00", () => {
    expect(countdownText(65_000)).toBe("1:05");
    expect(countdownText(3_725_000)).toBe("1:02:05");
    expect(countdownText(-5)).toBe("0:00");
    expect(countdownText(1)).toBe("0:01");
  });
});
