// 주민세(D-579) 규칙 시험 — residentTax.ts
import { describe, expect, it } from "vitest";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import {
  collectResidentTax,
  parseResidentDebtCode,
  residentAssessments,
  residentClaimCode,
  residentDebtCode,
  residentTaxDue,
} from "./residentTax.ts";

const CUR = "cur_test";
const NATION = 2;

function bookWith(money: Record<number, bigint>) {
  let account = 0;
  let tx = 0;
  const book = createLedgerBook({ nextAccountId: () => ++account, nextTxId: () => ++tx });
  const issue = book.systemAccount(`issue:${CUR}`, CUR);
  for (const [owner, amount] of Object.entries(money))
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: issue, amount: -amount },
        { account: book.ownerAccount(Number(owner), CUR), amount },
      ],
    });
  return book;
}

describe("주민세(D-579)", () => {
  it("세금 = ⌊재산 × 세율‰ ÷ 1000⌋, 세율은 0~1000으로 자른다", () => {
    expect(residentTaxDue(12_345n, 10)).toBe(123n);
    expect(residentTaxDue(12_345n, 0)).toBe(0n);
    expect(residentTaxDue(-5n, 10)).toBe(0n);
    expect(residentTaxDue(100n, 5000)).toBe(100n);
  });

  it("과세 단위 = (도시, 사는 유닛의 주인) — 같은 주머니(그 나라 자신)는 빼고, 도시·주인 차례", () => {
    const residents = new Map([
      [7, new Set([NATION, 50, 40])],
      [3, new Set([40])],
    ]);
    const out = residentAssessments(NATION, [7, 3], residents, (payer, city) => BigInt(payer * 1000 + city));
    expect(out).toEqual([
      { city: 3, payer: 40, property: 40_003n },
      { city: 7, payer: 40, property: 40_007n },
      { city: 7, payer: 50, property: 50_007n },
    ]);
  });

  it("국고로 내고 국세 몫을 나눈다, 못 낸 몫은 빚 계정(짝 = 받을 돈)에 적고 다음 주기에 먼저 갚는다", () => {
    const book = bookWith({ 40: 150n, 50: 1000n });
    const first = collectResidentTax(book, {
      nation: NATION,
      asset: CUR,
      assessments: [
        { city: 3, payer: 40, property: 10_000n },
        { city: 7, payer: 40, property: 10_000n },
        { city: 7, payer: 50, property: 5_000n },
        { city: 7, payer: NATION, property: 99_999n },
      ],
      ratePm: 10,
      nationSharePm: 200,
      atMs: 1,
    });
    // 40번: 도시 3에 100, 도시 7에 남은 50만(빚 50). 50번: 도시 7에 50
    expect(first.cities).toEqual([
      { city: 3, due: 100n, paid: 100n, cityPart: 80n, nationPart: 20n },
      { city: 7, due: 150n, paid: 100n, cityPart: 80n, nationPart: 20n },
    ]);
    expect(first.arrears).toEqual([{ city: 7, payer: 40, owed: 50n, added: 50n }]);
    expect(book.balanceOf(NATION, CUR)).toBe(200n);
    expect(book.balance(book.systemAccount(residentDebtCode(NATION, 7, 40, CUR), CUR))).toBe(-50n);
    expect(book.balance(book.systemAccount(residentClaimCode(NATION, CUR), CUR))).toBe(50n);
    // 40번이 도시를 떠났어도(과세 단위 없음) 빚은 갚기를 이어 간다
    book.post({
      kind: "issue",
      atMs: 2,
      entries: [
        { account: book.systemAccount(`issue:${CUR}`, CUR), amount: -30n },
        { account: book.ownerAccount(40, CUR), amount: 30n },
      ],
    });
    const second = collectResidentTax(book, {
      nation: NATION,
      asset: CUR,
      assessments: [],
      ratePm: 10,
      nationSharePm: 0,
      atMs: 3,
    });
    expect(second.cities).toEqual([{ city: 7, due: 0n, paid: 30n, cityPart: 30n, nationPart: 0n }]);
    expect(second.arrears).toEqual([{ city: 7, payer: 40, owed: 20n, added: -30n }]);
    expect(book.balance(book.systemAccount(residentClaimCode(NATION, CUR), CUR))).toBe(20n);
  });

  it("낼 것이 없으면 거래를 만들지 않는다", () => {
    const book = bookWith({ 40: 10n });
    const out = collectResidentTax(book, {
      nation: NATION,
      asset: CUR,
      assessments: [{ city: 3, payer: 40, property: 0n }],
      ratePm: 10,
      nationSharePm: 0,
      atMs: 1,
    });
    expect(out).toEqual({ cities: [], arrears: [] });
    expect([...book.accounts()].some((a) => a.systemCode?.startsWith("debt:") === true)).toBe(false);
  });

  it("빚 계정 코드는 그 나라·화폐만 읽는다", () => {
    expect(parseResidentDebtCode(residentDebtCode(2, 7, 40, CUR), 2, CUR)).toEqual({ city: 7, payer: 40 });
    expect(parseResidentDebtCode(residentDebtCode(3, 7, 40, CUR), 2, CUR)).toBeUndefined();
    expect(parseResidentDebtCode(residentDebtCode(2, 7, 40, "other"), 2, CUR)).toBeUndefined();
  });
});
