// 가문 지분 계정(서버만 — D-338 "독재 나라 도시의 주식 = 지배 가문 계정", 줄기 governance-2): 옮기기·합·소각·배당·점령 몰수가 주체 계정과 함께 센다
import { describe, expect, it } from "vitest";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "./coefficients.ts";
import { payCityProfit } from "./dividends.ts";
import { settleShares } from "./occupation.ts";
import {
  burnShares,
  holdingsOf,
  houseHoldingsOf,
  houseMoneyCode,
  houseShareCode,
  issueShares,
  moveSharesToHouse,
  shareAsset,
  totalShares,
} from "./shares.ts";

function setup() {
  let account = 0;
  let tx = 0;
  const book = createLedgerBook({ nextAccountId: () => ++account, nextTxId: () => ++tx });
  return book;
}

describe("가문 지분 계정", () => {
  it("국고 지분을 가문 계정으로 옮기면 합은 그대로이고 가문 줄로 보인다", () => {
    const book = setup();
    issueShares(book, 7, [{ owner: 1, amount: 1000n }], 0);
    expect(moveSharesToHouse(book, 7, 1, "npc:5:", 1200n, 1)).toBe(1000n);
    expect(holdingsOf(book, 7)).toEqual([]);
    expect(houseHoldingsOf(book, 7).map((h) => [h.house, h.amount])).toEqual([["npc:5:", 1000n]]);
    expect(totalShares(book, 7)).toBe(1000n);
    expect(book.balance(book.systemAccount(houseShareCode("npc:5:", 7), shareAsset(7)))).toBe(1000n);
    // 다른 도시 지분 계정은 섞이지 않는다
    expect(houseHoldingsOf(book, 70)).toEqual([]);
  });

  it("소각은 가문 계정도 지운다", () => {
    const book = setup();
    issueShares(
      book,
      7,
      [
        { owner: 1, amount: 900n },
        { owner: 2, amount: 100n },
      ],
      0,
    );
    moveSharesToHouse(book, 7, 1, "12:", 900n, 1);
    expect(burnShares(book, 7, 2)).toBe(1000n);
    expect(totalShares(book, 7)).toBe(0n);
  });

  it("배당: 가문 계정 몫은 그 가문 돈 금고로(체제와 상관없이)", () => {
    const book = setup();
    issueShares(
      book,
      7,
      [
        { owner: 1, amount: 600n },
        { owner: 2, amount: 400n },
      ],
      0,
    );
    moveSharesToHouse(book, 7, 1, "npc:5:", 600n, 1);
    const cash = book.systemAccount("issue:coin", "coin");
    book.post({
      kind: "issue",
      atMs: 1,
      entries: [
        { account: book.ownerAccount(1, "coin"), amount: 1000n },
        { account: cash, amount: -1000n },
      ],
    });
    const paid = payCityProfit(book, {
      city: 7,
      asset: "coin",
      regime: "dictatorship",
      treasury: 1,
      rulingFamily: 1,
      profit: 100n,
      atMs: 2,
    });
    expect(paid).toBe(100n);
    expect(book.balance(book.systemAccount(houseMoneyCode("npc:5:", "coin"), "coin"))).toBe(60n);
    expect(book.balanceOf(2, "coin")).toBe(40n);
    expect(book.balanceOf(1, "coin")).toBe(900n);
  });

  it("점령(지분 유지): 옛 통치자 지배 가문 계정만 몰수하고 다른 가문(세운 가문) 지분은 남긴다(질문 2431 나)", () => {
    const book = setup();
    issueShares(
      book,
      7,
      [
        { owner: 1, amount: 700n },
        { owner: 3, amount: 300n },
      ],
      0,
    );
    // 옛 통치자 지배 가문 npc:5: 500주, 세운 가문 npc:6: 200주
    moveSharesToHouse(book, 7, 1, "npc:5:", 500n, 1);
    moveSharesToHouse(book, 7, 1, "npc:6:", 200n, 1);
    const decided = settleShares(
      book,
      7,
      1,
      { treasury: 9, regime: "capitalism", rulingFamily: 9 },
      "keep",
      2,
      TEST_SOCIETY_COEFFICIENTS,
      ["npc:5:"],
    );
    expect(decided).toBe("keep");
    expect(houseHoldingsOf(book, 7).map((h) => [h.house, h.amount])).toEqual([["npc:6:", 200n]]);
    expect(holdingsOf(book, 7)).toEqual([
      { owner: 3, amount: 300n },
      { owner: 9, amount: 500n },
    ]);
    expect(totalShares(book, 7)).toBe(1000n);
  });

  it("점령: 옛 통치자 가문을 모르면(시뮬) 가문 계정은 그대로 남는다", () => {
    const book = setup();
    issueShares(book, 7, [{ owner: 1, amount: 1000n }], 0);
    moveSharesToHouse(book, 7, 1, "npc:5:", 400n, 1);
    settleShares(
      book,
      7,
      1,
      { treasury: 9, regime: "democracy", rulingFamily: 9 },
      "keep",
      2,
      TEST_SOCIETY_COEFFICIENTS,
    );
    expect(houseHoldingsOf(book, 7).map((h) => h.amount)).toEqual([400n]);
    expect(holdingsOf(book, 7)).toEqual([{ owner: 9, amount: 600n }]);
  });

  it("독재 점령국: 남은 세운 가문 몫 때문에 과반이 안 되면 상장폐지(D-346)", () => {
    const book = setup();
    issueShares(book, 7, [{ owner: 1, amount: 1000n }], 0);
    moveSharesToHouse(book, 7, 1, "npc:5:", 200n, 1);
    moveSharesToHouse(book, 7, 1, "npc:6:", 600n, 1);
    const decided = settleShares(
      book,
      7,
      1,
      { treasury: 9, regime: "dictatorship", rulingFamily: 9 },
      "keep",
      2,
      TEST_SOCIETY_COEFFICIENTS,
      ["npc:5:"],
    );
    // 몰수 = 국고 200 + 지배 가문 200 = 400 < 600(세운 가문) → 상장폐지 후 재발행(점령국 지배 가문)
    expect(decided).toBe("delist");
    expect(houseHoldingsOf(book, 7)).toEqual([]);
    expect(holdingsOf(book, 7).map((h) => h.owner)).toEqual([9]);
  });
});
