// 주민세(D-579) 규칙 시험 — residentTax.ts
import { describe, expect, it } from "vitest";
import { unitPurseLocation } from "@terra/shared/businessBooks";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import {
  cancelResidentDebts,
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

  it("과세 단위(D-581): 사는 주인마다 사업장 몫 + 사는 유닛마다 집 몫 — 같은 주머니(그 나라 자신)는 빼고, 도시·주인·유닛 차례", () => {
    const homes = new Map([
      [
        7,
        [
          { unit: 9, owner: NATION, housing: 500n },
          { unit: 12, owner: 50, housing: 30n },
          { unit: 11, owner: 40, housing: 20n },
          { unit: 10, owner: 40, housing: 0n },
        ],
      ],
      [3, [{ unit: 5, owner: 40, housing: 7n }]],
    ]);
    const out = residentAssessments(
      NATION,
      [7, 3],
      (city) => homes.get(city) ?? [],
      (payer, city) => BigInt(payer * 1000 + city),
    );
    expect(out).toEqual([
      { city: 3, payer: 40, property: 40_003n },
      { city: 3, payer: 40, unit: 5, property: 7n },
      { city: 7, payer: 40, property: 40_007n },
      { city: 7, payer: 40, unit: 10, property: 0n },
      { city: 7, payer: 40, unit: 11, property: 20n },
      { city: 7, payer: 50, property: 50_007n },
      { city: 7, payer: 50, unit: 12, property: 30n },
    ]);
  });

  it("집 몫은 사는 유닛 지갑에서 내고, 못 낸 몫은 유닛 빚 계정(u<유닛>)에 적는다", () => {
    const book = bookWith({});
    const purse = book.ownerAccount(40, CUR, unitPurseLocation(11));
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`issue:${CUR}`, CUR), amount: -3n },
        { account: purse, amount: 3n },
      ],
    });
    const out = collectResidentTax(book, {
      nation: NATION,
      asset: CUR,
      assessments: [{ city: 7, payer: 40, unit: 11, property: 1000n }],
      ratePm: 10,
      nationSharePm: 0,
      atMs: 1,
    });
    expect(out.arrears).toEqual([{ city: 7, payer: 40, unit: 11, owed: 7n, added: 7n }]);
    expect(book.balance(purse)).toBe(0n);
    expect(book.balanceOf(NATION, CUR)).toBe(3n);
    expect(book.balance(book.systemAccount(residentDebtCode(NATION, 7, 40, CUR, 11), CUR))).toBe(-7n);
  });

  it("도시가 넘어가면 그 도시의 옛 나라 빚이 사라진다(D-581 2375 다) — 다른 도시 빚은 그대로", () => {
    const book = bookWith({});
    collectResidentTax(book, {
      nation: NATION,
      asset: CUR,
      assessments: [
        { city: 7, payer: 40, property: 1000n },
        { city: 7, payer: 40, unit: 11, property: 500n },
        { city: 3, payer: 40, property: 2000n },
      ],
      ratePm: 10,
      nationSharePm: 0,
      atMs: 1,
    });
    const claim = book.systemAccount(residentClaimCode(NATION, CUR), CUR);
    expect(book.balance(claim)).toBe(35n);
    const gone = cancelResidentDebts(book, NATION, 7, 2);
    expect(gone.get(CUR)).toBe(15n);
    expect(book.balance(claim)).toBe(20n);
    expect(book.balance(book.systemAccount(residentDebtCode(NATION, 7, 40, CUR), CUR))).toBe(0n);
    expect(book.balance(book.systemAccount(residentDebtCode(NATION, 3, 40, CUR), CUR))).toBe(-20n);
    // 지울 빚이 없으면 거래도 없다
    expect(cancelResidentDebts(book, NATION, 7, 3).size).toBe(0);
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
    expect(parseResidentDebtCode(residentDebtCode(2, 7, 40, CUR, 11), 2, CUR)).toEqual({
      city: 7,
      payer: 40,
      unit: 11,
    });
  });
});
