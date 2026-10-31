import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "../ledger/audit.ts";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import { type AuctionOrder, clearCallAuction } from "./callAuction.ts";
import { createFxMarket } from "./fxMarket.ts";

let seq = 1;
const o = (owner: number, price: number, lots: number): AuctionOrder => ({
  id: seq,
  owner,
  price: BigInt(price),
  lots: BigInt(lots),
  seq: seq++,
});

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

describe("동시호가 체결가(환전, D-125·D-411 1)", () => {
  it("체결량이 가장 큰 값, 같으면 남는 양이 작은 값, 같으면 기준가에 가까운 값", () => {
    const buys = [o(1, 105, 10), o(2, 100, 5)];
    const sells = [o(3, 98, 8), o(4, 103, 10)];
    const result = clearCallAuction(buys, sells, 100n);
    // 103·105 모두 체결량 10·남는 양 8 → 기준가 100에 가까운 103
    expect(result.price).toBe(103n);
    expect(result.lots).toBe(10n);
    expect(result.fills).toEqual(
      new Map([
        [buys[0]?.id, 10n],
        [sells[0]?.id, 8n],
        [sells[1]?.id, 2n],
      ]),
    );
  });

  it("기준가가 없고 모두 같으면 낮은 값, 엇갈리지 않으면 체결 없음", () => {
    expect(clearCallAuction([o(1, 10, 1)], [o(2, 8, 1)], undefined).price).toBe(8n);
    expect(clearCallAuction([o(1, 7, 1)], [o(2, 8, 1)], 7n)).toEqual({
      price: undefined,
      lots: 0n,
      fills: new Map(),
    });
  });

  it("같은 값이면 먼저 낸 주문이 먼저 받는다(남는 쪽 부분 체결)", () => {
    const first = o(1, 50, 4);
    const second = o(2, 50, 4);
    const result = clearCallAuction([first, second], [o(3, 50, 6)], 50n);
    expect(result.fills.get(first.id)).toBe(4n);
    expect(result.fills.get(second.id)).toBe(2n);
  });
});

describe("환전 시장(동시호가 + 장부 에스크로)", () => {
  const BASE = "cur:base";
  const QUOTE = "cur:qq";
  function setup() {
    const audit = createLedgerAudit();
    const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter(), hooks: audit.hooks });
    const give = (owner: number, asset: string, amount: bigint) =>
      book.post({
        kind: "issue",
        atMs: 0,
        entries: [
          { account: book.systemAccount(`issue:${asset}`, asset), amount: -amount },
          { account: book.ownerAccount(owner, asset), amount },
        ],
      });
    const fx = createFxMarket({ id: 1, base: BASE, quote: QUOTE, lotSize: 100n }, book, counter());
    return { audit, book, give, fx };
  }

  it("회차에 모은 주문을 한 값으로 체결하고, 남은 주문은 회차가 끝나면 돌려준다", () => {
    const { book, give, fx, audit } = setup();
    give(1, BASE, 1_000n);
    give(2, QUOTE, 10_000n);
    // 1: base 10로트(1000) 팔기 하한 90, 2: base 6로트 사기 상한 110 (값 = 로트당 quote)
    expect(fx.place(1, "sell", 90n, 10n, 0).ok).toBe(true);
    expect(fx.place(2, "buy", 110n, 6n, 0).ok).toBe(true);
    expect(book.balanceOf(2, QUOTE)).toBe(10_000n - 660n);
    const result = fx.run(60_000);
    expect(result).toEqual({ price: 90n, lots: 6n });
    expect(book.balanceOf(2, BASE)).toBe(600n);
    expect(book.balanceOf(2, QUOTE)).toBe(10_000n - 540n);
    expect(book.balanceOf(1, QUOTE)).toBe(540n);
    // 팔지 못한 4로트는 돌려받는다
    expect(book.balanceOf(1, BASE)).toBe(400n);
    expect(fx.orders()).toEqual([]);
    expect(fx.checkEscrow()).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("무작위 회차를 돌려도 화폐가 생기거나 사라지지 않는다", () => {
    const { book, give, fx, audit } = setup();
    const rng = createRng(3);
    for (let owner = 1; owner <= 5; owner++) {
      give(owner, BASE, 100_000n);
      give(owner, QUOTE, 100_000n);
    }
    for (let round = 0; round < 200; round++) {
      for (let n = 0; n < 8; n++)
        fx.place(
          1 + rng.nextInt(5),
          rng.nextInt(2) === 0 ? "buy" : "sell",
          BigInt(80 + rng.nextInt(41)),
          BigInt(1 + rng.nextInt(20)),
          round,
        );
      fx.run(round);
      expect(fx.checkEscrow()).toEqual([]);
    }
    let base = 0n;
    let quote = 0n;
    for (let owner = 1; owner <= 5; owner++) {
      base += book.balanceOf(owner, BASE);
      quote += book.balanceOf(owner, QUOTE);
    }
    expect([base, quote]).toEqual([500_000n, 500_000n]);
    expect(fx.lastPrice).toBeDefined();
    expect(audit.check(book.accounts())).toEqual([]);
  });
});
