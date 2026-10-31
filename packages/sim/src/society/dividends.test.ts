import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "../ledger/audit.ts";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import { payCityProfit, profitRecipient, settleCityTaxes } from "./dividends.ts";
import { issueShares } from "./shares.ts";

describe("도시 세금 정산(D-304): 이자 소각 → 운영비 → 남은 이익", () => {
  it("기간 이자를 도시 세금 비례로 먼저 빼고, 운영비를 뺀 나머지가 이익이다", () => {
    const out = settleCityTaxes(
      [
        { city: 1, revenue: 100n, operating: 20n },
        { city: 2, revenue: 50n, operating: 60n },
        { city: 3, revenue: 0n, operating: 5n },
      ],
      30n,
    );
    expect(out.cities).toEqual([
      { city: 1, revenue: 100n, interest: 20n, operating: 20n, profit: 60n },
      { city: 2, revenue: 50n, interest: 10n, operating: 40n, profit: 0n },
      { city: 3, revenue: 0n, interest: 0n, operating: 0n, profit: 0n },
    ]);
    expect(out.interestShortfall).toBe(0n);
  });

  it("이자가 세금보다 크면 세금이 모두 이자로 가고 모자란 몫은 국고가 낸다(가장 큰 나머지로 나눈다)", () => {
    const out = settleCityTaxes(
      [
        { city: 2, revenue: 50n, operating: 0n },
        { city: 1, revenue: 100n, operating: 10n },
      ],
      200n,
    );
    // 나눔: 200 × 100/150 = 133.3, 200 × 50/150 = 66.7 → 남는 1은 나머지가 큰 도시 2로(133·67), 세금까지만 낸다
    expect(out.cities.map((c) => [c.city, c.interest, c.operating, c.profit])).toEqual([
      [1, 100n, 0n, 0n],
      [2, 50n, 0n, 0n],
    ]);
    expect(out.interestShortfall).toBe(50n);
  });
});

function setup() {
  let account = 0;
  let tx = 0;
  const audit = createLedgerAudit();
  const book = createLedgerBook({ nextAccountId: () => ++account, nextTxId: () => ++tx, hooks: audit.hooks });
  const give = (owner: number, asset: string, amount: bigint) =>
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`issue:${asset}`, asset), amount: -amount },
        { account: book.ownerAccount(owner, asset), amount },
      ],
    });
  // 도시 5: 국고(1) 600주, 7번 300주, 8번 100주. 국고에 화폐 5000
  issueShares(
    book,
    5,
    [
      { owner: 1, amount: 600n },
      { owner: 7, amount: 300n },
      { owner: 8, amount: 100n },
    ],
    0,
  );
  give(1, "cur:a", 5000n);
  return { book, audit };
}

describe("남은 이익 나누기(D-304·D-338)", () => {
  it("받는 곳: 자본주의·독재 = 주주, 민주주의 = 국고", () => {
    expect(profitRecipient("capitalism")).toBe("shareholders");
    expect(profitRecipient("dictatorship")).toBe("shareholders");
    expect(profitRecipient("democracy")).toBe("treasury");
  });

  it("자본주의: 지분 비례, 국고 몫은 국고에 남는다", () => {
    const { book, audit } = setup();
    const paid = payCityProfit(book, {
      city: 5,
      asset: "cur:a",
      regime: "capitalism",
      treasury: 1,
      rulingFamily: 1,
      profit: 1000n,
      atMs: 1,
    });
    expect(paid).toBe(400n);
    expect([1, 7, 8].map((owner) => book.balanceOf(owner, "cur:a"))).toEqual([4600n, 300n, 100n]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("민주주의: 남은 이익은 국고로(아무것도 옮기지 않는다)", () => {
    const { book } = setup();
    const paid = payCityProfit(book, {
      city: 5,
      asset: "cur:a",
      regime: "democracy",
      treasury: 1,
      rulingFamily: 1,
      profit: 1000n,
      atMs: 1,
    });
    expect(paid).toBe(0n);
    expect([1, 7, 8].map((owner) => book.balanceOf(owner, "cur:a"))).toEqual([5000n, 0n, 0n]);
  });

  it("독재: 국고가 가진 몫은 지배 가문 금고로, 나머지 주주는 지분대로", () => {
    const { book, audit } = setup();
    const paid = payCityProfit(book, {
      city: 5,
      asset: "cur:a",
      regime: "dictatorship",
      treasury: 1,
      rulingFamily: 50,
      profit: 1000n,
      atMs: 1,
    });
    expect(paid).toBe(1000n);
    expect([1, 50, 7, 8].map((owner) => book.balanceOf(owner, "cur:a"))).toEqual([4000n, 600n, 300n, 100n]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("국고에 있는 만큼만 나눈다(내림, 남는 몫은 국고)", () => {
    const { book } = setup();
    const paid = payCityProfit(book, {
      city: 5,
      asset: "cur:a",
      regime: "capitalism",
      treasury: 1,
      rulingFamily: 1,
      profit: 9999n,
      atMs: 1,
    });
    // 국고 5000까지만: 7번 1500, 8번 500
    expect(paid).toBe(2000n);
    expect(book.balanceOf(7, "cur:a")).toBe(1500n);
    const odd = setup();
    expect(
      payCityProfit(odd.book, {
        city: 5,
        asset: "cur:a",
        regime: "capitalism",
        treasury: 1,
        rulingFamily: 1,
        profit: 9n,
        atMs: 1,
      }),
    ).toBe(2n);
  });
});
