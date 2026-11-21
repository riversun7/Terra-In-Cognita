// 가문 지분 계정(houseShares.ts — D-338·D-582, 쿠데타 몰수 도우미 2401 일부 답)
import { createLedgerBook, holdingsOf, houseHoldingsOf, issueShares } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  confiscateSharesToHouse,
  coupSatisfactionAfter,
  houseKeyOfTail,
  houseTailOf,
  treasurySharesToHouse,
} from "./houseShares.ts";

function book() {
  let account = 0;
  let tx = 0;
  return createLedgerBook({ nextAccountId: () => ++account, nextTxId: () => ++tx });
}

describe("가문 지분 계정", () => {
  it("가문 열쇠 ↔ 꼬리", () => {
    expect(houseTailOf("n:5")).toBe("npc:5:");
    expect(houseTailOf("p:12")).toBe("12:");
    expect(houseKeyOfTail("npc:5:")).toBe("n:5");
    expect(houseKeyOfTail("12:")).toBe("p:12");
    expect(houseKeyOfTail("x:1:")).toBeUndefined();
  });
  it("국고 지분 → 지배 가문 계정(멱등)", () => {
    const b = book();
    issueShares(b, 1, [{ owner: 9, amount: 1000n }], 0);
    issueShares(
      b,
      2,
      [
        { owner: 9, amount: 600n },
        { owner: 3, amount: 400n },
      ],
      0,
    );
    expect(treasurySharesToHouse(b, [1, 2, 3], 9, "n:5", 1)).toEqual([
      { cityId: 1, amount: 1000n },
      { cityId: 2, amount: 600n },
    ]);
    expect(treasurySharesToHouse(b, [1, 2, 3], 9, "n:5", 2)).toEqual([]);
    expect(holdingsOf(b, 2)).toEqual([{ owner: 3, amount: 400n }]);
    expect(houseHoldingsOf(b, 2).map((row) => [row.house, row.amount])).toEqual([["npc:5:", 600n]]);
  });
  it("쿠데타 몰수: 다른 모든 주주(주체·다른 가문) → 지배 가문 계정, 만족도 벌칙", () => {
    const b = book();
    issueShares(
      b,
      1,
      [
        { owner: 9, amount: 500n },
        { owner: 3, amount: 300n },
        { owner: 4, amount: 200n },
      ],
      0,
    );
    treasurySharesToHouse(b, [1], 9, "n:6", 1);
    treasurySharesToHouse(b, [1], 3, "p:7", 1);
    expect(confiscateSharesToHouse(b, [1], "p:7", 2)).toBe(700n);
    expect(holdingsOf(b, 1)).toEqual([]);
    expect(houseHoldingsOf(b, 1).map((row) => [row.house, row.amount])).toEqual([["7:", 1000n]]);
    expect(coupSatisfactionAfter(50_000, 30)).toBe(20_000);
    expect(coupSatisfactionAfter(10_000, 30)).toBe(0);
  });
});
