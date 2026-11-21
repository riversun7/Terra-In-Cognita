// 임금 소득세 원천징수(D-578) 단위 시험 — 원천징수 셈(같은 주머니·끔·세율)과 노동 계약 임금 거래(세후 임금이 지갑으로, 세금은 국고로 같은 거래에서)
import { createLedgerBook, laborAccounts, OLD_LABOR_RULES, openLabor } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { withWageTaxes } from "../labor/wagePurse.ts";
import { attachWageWithhold, createWageWithhold, wageWithholdOf, withheldTax } from "./withhold.ts";

const CUR = "s3_test_credit";
const EMPLOYER = 1;
const WORKER = 2;
const NATION = 9;

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

function book() {
  const ledger = createLedgerBook({ nextAccountId: counter(), nextTxId: counter() });
  ledger.post({
    kind: "issue",
    atMs: 0,
    entries: [
      { account: ledger.systemAccount(`issue:${CUR}`, CUR), amount: -1_000_000n },
      { account: ledger.ownerAccount(EMPLOYER, CUR), amount: 1_000_000n },
    ],
  });
  return ledger;
}

const withholdOf = (ledger: ReturnType<typeof book>, mode = 1, owner = NATION, bp = 500) =>
  createWageWithhold({
    ledger,
    mode: () => mode,
    cityOf: (buildingId) => (buildingId === 700 ? 30 : null),
    tax: (cityId) => (cityId === 30 ? { treasuryOwner: owner, bp } : undefined),
  });

describe("임금 소득세 원천징수(D-578)", () => {
  it("총 임금 × 도시 나라 소득세율(내림)을 그 나라 국고로 — 도시 밖·끔·같은 주머니면 떼지 않는다", () => {
    const ledger = book();
    const withhold = withholdOf(ledger);
    const cut = withhold(700, EMPLOYER, CUR, 1000n);
    expect(cut?.tax).toBe(50n);
    expect(cut?.account).toBe(ledger.ownerAccount(NATION, CUR));
    // 작은 임금은 계약마다 모아서 내린다(누적 내림): 20 × 5%는 한 번에 1, 19는 처음 0이고 21을 낸 뒤에는 1(⌊40 × 5%⌋ − ⌊21 × 5%⌋)
    expect(withhold(700, EMPLOYER, CUR, 19n)).toBeUndefined();
    expect(withhold(700, EMPLOYER, CUR, 19n, 21n)?.tax).toBe(1n);
    expect(withheldTax(20n, 0n, 200)).toBe(0n);
    expect(withheldTax(20n, 40n, 200)).toBe(1n);
    let paid = 0n;
    let taxed = 0n;
    for (let i = 0; i < 100; i++) {
      taxed += withheldTax(20n, paid, 200);
      paid += 20n;
    }
    expect(taxed).toBe(40n);
    expect(withhold(701, EMPLOYER, CUR, 1000n)).toBeUndefined();
    expect(withholdOf(ledger, 0)(700, EMPLOYER, CUR, 1000n)).toBeUndefined();
    expect(withholdOf(ledger, 1, EMPLOYER)(700, EMPLOYER, CUR, 1000n)).toBeUndefined();
  });

  it("임금 거래 하나에서 세금은 국고로, 세후 임금은 지갑으로(원장에 붙인 셈을 노동 계약 계정이 찾는다)", () => {
    const ledger = book();
    const accounts = withWageTaxes(ledger, laborAccounts(ledger));
    // 붙이기 전에는 떼지 않는다
    expect(wageWithholdOf(ledger)).toBeUndefined();
    attachWageWithhold(ledger, withholdOf(ledger, 1, NATION, 1000));
    const opened = openLabor(
      {
        id: 1,
        kind: "wage",
        ownerId: EMPLOYER,
        workerOwnerId: WORKER,
        unitId: 70,
        buildingId: 700,
        asset: CUR,
        rate: 200n,
        atMs: 0,
        endsAtMs: null,
      },
      ledger,
      accounts,
      OLD_LABOR_RULES,
    );
    expect(opened.ok).toBe(true);
    // 첫 임금(선불) 200: 소득세 10% = 20 → 국고, 세후 180 → 일꾼 지갑
    expect(ledger.balanceOf(NATION, CUR)).toBe(20n);
    expect(ledger.balanceOf(WORKER, CUR)).toBe(180n);
  });
});
