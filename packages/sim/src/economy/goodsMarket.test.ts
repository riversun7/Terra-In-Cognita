import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "../ledger/audit.ts";
import { type LedgerBook, createLedgerBook } from "../ledger/ledgerBook.ts";
import { createGoodsMarket } from "./goodsMarket.ts";

const CITY = 7;
const GRAIN = "item:grain";
const CUR = "cur:aa";
const TREASURY = 100;

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

function setup(taxBp = 200) {
  const audit = createLedgerAudit();
  const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter(), hooks: audit.hooks });
  const give = (owner: number, asset: string, amount: bigint, location: number | null) =>
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`issue:${asset}`, asset), amount: -amount },
        { account: book.ownerAccount(owner, asset, location), amount },
      ],
    });
  const market = createGoodsMarket(
    { id: 1, location: CITY, item: GRAIN, currency: CUR, taxBp, treasuryOwner: TREASURY },
    book,
    counter(),
  );
  return { audit, book, give, market };
}

const cash = (book: LedgerBook, owner: number) => book.balanceOf(owner, CUR);
const grain = (book: LedgerBook, owner: number) => book.balanceOf(owner, GRAIN, CITY);

describe("물자 거래소(호가창 + 장부 에스크로)", () => {
  it("주문을 걸면 판 쪽 물건·산 쪽 돈을 묶고, 체결하면 옮기며 판 쪽이 거래세를 낸다", () => {
    const { book, give, market, audit } = setup();
    give(1, GRAIN, 50n, CITY);
    give(2, CUR, 10_000n, null);
    const sell = market.place(1, "sell", 100n, 30n, 0, 1000);
    expect(sell.ok).toBe(true);
    expect(grain(book, 1)).toBe(20n);
    const buy = market.place(2, "buy", 120n, 10n, 1, 1000);
    // 체결가 = 걸려 있던 값 100, 산 쪽은 120으로 묶은 차이(20 × 10)를 돌려받는다
    expect(buy.ok && buy.fills.map((f) => `${f.price}x${f.qty}`)).toEqual(["100x10"]);
    expect(grain(book, 2)).toBe(10n);
    expect(cash(book, 2)).toBe(10_000n - 1000n);
    // 1000의 2% = 20은 국고로
    expect(cash(book, 1)).toBe(980n);
    expect(cash(book, TREASURY)).toBe(20n);
    expect(market.lastPrice).toBe(100n);
    expect(market.checkEscrow()).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("묶을 돈·물건이 모자라면 거절하고 아무것도 바꾸지 않는다", () => {
    const { book, give, market } = setup();
    give(2, CUR, 500n, null);
    expect(market.place(2, "buy", 100n, 6n, 0, 10)).toEqual({ ok: false, reason: "insufficient" });
    expect(market.place(3, "sell", 100n, 1n, 0, 10)).toEqual({ ok: false, reason: "insufficient" });
    expect(cash(book, 2)).toBe(500n);
    expect(market.orders()).toEqual([]);
  });

  it("취소·만료하면 남은 묶음을 돌려준다", () => {
    const { book, give, market } = setup();
    give(1, GRAIN, 5n, CITY);
    give(2, CUR, 1_000n, null);
    const sell = market.place(1, "sell", 50n, 5n, 0, 100);
    market.place(2, "buy", 40n, 10n, 0, 50);
    expect(sell.ok && market.cancel(sell.orderId)).toBe(true);
    expect(grain(book, 1)).toBe(5n);
    expect(market.expire(49)).toBe(0);
    expect(market.expire(50)).toBe(1);
    expect(cash(book, 2)).toBe(1_000n);
    expect(market.checkEscrow()).toEqual([]);
  });

  it("값을 정수로 계산하고 세금은 버림이다", () => {
    const { book, give, market } = setup(333);
    give(1, GRAIN, 1n, CITY);
    give(2, CUR, 7n, null);
    market.place(1, "sell", 7n, 1n, 0, 10);
    market.place(2, "buy", 7n, 1n, 0, 10);
    // 7 × 3.33% = 0.2331 → 0
    expect(cash(book, TREASURY)).toBe(0n);
    expect(cash(book, 1)).toBe(7n);
  });

  it("무작위 주문을 많이 섞어도 물건·돈이 생기거나 사라지지 않고 에스크로 = 걸린 주문 합이다", () => {
    const { book, give, market, audit } = setup();
    const rng = createRng(9);
    for (let owner = 1; owner <= 6; owner++) {
      give(owner, GRAIN, 1_000n, CITY);
      give(owner, CUR, 1_000_000n, null);
    }
    const totals = () => {
      let goods = 0n;
      let money = 0n;
      for (const account of book.accounts()) {
        if (account.systemCode?.startsWith("issue:")) continue;
        if (account.asset === GRAIN) goods += account.balance;
        if (account.asset === CUR) money += account.balance;
      }
      return { goods, money };
    };
    const before = totals();
    const placed: number[] = [];
    for (let step = 0; step < 3_000; step++) {
      const roll = rng.nextInt(10);
      if (roll < 7) {
        const result = market.place(
          1 + rng.nextInt(6),
          rng.nextInt(2) === 0 ? "buy" : "sell",
          BigInt(90 + rng.nextInt(21)),
          BigInt(1 + rng.nextInt(40)),
          step,
          step + 1 + rng.nextInt(300),
        );
        if (result.ok) placed.push(result.orderId);
      } else if (roll < 9 && placed.length > 0) {
        market.cancel(placed[rng.nextInt(placed.length)] ?? 0);
      } else {
        market.expire(step);
      }
      if (step % 500 === 0) expect(market.checkEscrow()).toEqual([]);
    }
    expect(market.trades).toBeGreaterThan(100);
    expect(totals()).toEqual(before);
    expect(market.checkEscrow()).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });
});
