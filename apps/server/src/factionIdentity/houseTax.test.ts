// 가문세 시험 — 기획 D-574 2150(가문원 수입의 일부를 가문 금고로), houseTax.ts
import { describe, expect, it } from "vitest";
import { createLedgerBook } from "@terra/sim";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { attachHouseTax, houseTaxAmount, houseTaxerOf } from "./houseTax.ts";
import { houseVaultCode } from "./houseVault.ts";

function setup(maxPm = 300) {
  let accountId = 0;
  let txId = 0;
  const book = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
  const owners = new Map([
    [1, { userId: "u1" }],
    [2, { userId: "u2" }],
    [3, { userId: null }],
  ]);
  const rows = [{ faction_id: "7", tax_pm: 100 }];
  const taxer = attachHouseTax({
    pool: { query: async () => ({ rows }) },
    ledger: book,
    owners,
    ties: () => ({
      houseOfUser: (userId) => (userId === "u1" ? 7 : undefined),
      unitHouseOf: (unitId, userId) => (userId === "u1" && unitId === 50 ? 7 : undefined),
    }),
    maxPm: () => maxPm,
  });
  return { book, taxer };
}

describe("houseTaxAmount", () => {
  it("수입 × 세율 ÷ 1000(내림), 0·음수·세율 0이면 0", () => {
    expect(houseTaxAmount(1000n, 125)).toBe(125n);
    expect(houseTaxAmount(9n, 100)).toBe(0n);
    expect(houseTaxAmount(0n, 500)).toBe(0n);
    expect(houseTaxAmount(-10n, 500)).toBe(0n);
    expect(houseTaxAmount(100n, 0)).toBe(0n);
    expect(houseTaxAmount(100n, 5000)).toBe(100n);
  });
});

describe("attachHouseTax — 가문원 수입에서 가문 금고로", () => {
  it("가문원 사용자의 배당·그 가문 유닛의 임금만 떼고, 계정은 그 가문 금고", async () => {
    const { book, taxer } = setup();
    expect(houseTaxerOf(book)).toBe(taxer);
    expect(taxer.ownerTax(1, ASSET_CREDIT, 1000n)).toBeUndefined();
    await taxer.reload();
    const cut = taxer.ownerTax(1, ASSET_CREDIT, 1000n);
    expect(cut?.tax).toBe(100n);
    expect([...book.accounts()].find((a) => a.id === cut?.account)?.systemCode).toBe(
      houseVaultCode(7, ASSET_CREDIT),
    );
    expect(taxer.unitTax(50, 1, ASSET_CREDIT, 500n)?.tax).toBe(50n);
    // 가문 밖 유닛·가문 없는 사람·사용자 없는 주체·기본 화폐 밖은 떼지 않는다
    expect(taxer.unitTax(51, 1, ASSET_CREDIT, 500n)).toBeUndefined();
    expect(taxer.ownerTax(2, ASSET_CREDIT, 1000n)).toBeUndefined();
    expect(taxer.ownerTax(3, ASSET_CREDIT, 1000n)).toBeUndefined();
    expect(taxer.ownerTax(1, "coin_other", 1000n)).toBeUndefined();
  });

  it("세율은 설정 칸 상한으로 자른다, setRate가 바로 바꾼다", async () => {
    const { taxer } = setup(50);
    await taxer.reload();
    expect(taxer.rateOf(7)).toBe(50);
    taxer.setRate(7, 20);
    expect(taxer.ownerTax(1, ASSET_CREDIT, 1000n)?.tax).toBe(20n);
    taxer.setRate(7, 0);
    expect(taxer.ownerTax(1, ASSET_CREDIT, 1000n)).toBeUndefined();
  });
});
