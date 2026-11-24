// 주체의 돈(world/money.ts) — 해석기가 없으면 나라 없는 세계의 돈, 있으면 주체마다 소속 국가 화폐.
import { createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  NO_NATION_MONEY,
  isMoneyAsset,
  moneyBalance,
  moneyIssue,
  moneyOf,
  moneySink,
  setMoneyResolver,
} from "./money.ts";

function book() {
  let accountId = 0;
  let txId = 0;
  return createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
}

describe("주체의 돈", () => {
  it("해석기가 없는 원장(나라 없는 세계)은 모든 주체가 같은 돈을 쓴다", () => {
    const ledger = book();
    expect(moneyOf(ledger, 7)).toBe(NO_NATION_MONEY);
    expect(moneyOf(ledger, undefined)).toBe(NO_NATION_MONEY);
    expect(moneyBalance(ledger, undefined)).toBe(0n);
  });

  it("해석기가 있으면 주체마다 소속 국가 화폐, 모르는 주체는 해석기가 준 기축 통화", () => {
    const ledger = book();
    const other = book();
    setMoneyResolver(ledger, (ownerId) =>
      ownerId === 1 ? "cur:alpha" : ownerId === 2 ? "cur:beta" : "cur:hub",
    );
    expect(moneyOf(ledger, 1)).toBe("cur:alpha");
    expect(moneyOf(ledger, 2)).toBe("cur:beta");
    expect(moneyOf(ledger, 99)).toBe("cur:hub");
    expect(moneyOf(ledger, undefined)).toBe("cur:hub");
    // 해석기는 원장마다 따로다(다른 세계로 새지 않는다)
    expect(moneyOf(other, 1)).toBe(NO_NATION_MONEY);
  });

  it("값을 내면 그 화폐의 소각 계정으로 가고, 잔고는 그 주체의 돈으로 센다", () => {
    const ledger = book();
    setMoneyResolver(ledger, () => "cur:alpha");
    const asset = moneyOf(ledger, 1);
    ledger.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: moneyIssue(ledger, asset), amount: -100n },
        { account: ledger.ownerAccount(1, asset), amount: 100n },
      ],
    });
    ledger.post({
      kind: "fee",
      atMs: 1,
      entries: [
        { account: ledger.ownerAccount(1, asset), amount: -30n },
        { account: moneySink(ledger, asset), amount: 30n },
      ],
    });
    expect(moneyBalance(ledger, 1)).toBe(70n);
    expect(ledger.balance(moneySink(ledger, "cur:alpha"))).toBe(30n);
    // 다른 화폐로 가진 돈은 그 주체의 돈 잔고에 들지 않는다(외환)
    expect(ledger.balanceOf(1, "cur:beta")).toBe(0n);
  });

  it("돈 자산 = 나라 화폐와 나라 없는 세계의 돈(물건·지분은 아니다)", () => {
    expect(isMoneyAsset("cur:alpha")).toBe(true);
    expect(isMoneyAsset(NO_NATION_MONEY)).toBe(true);
    expect(isMoneyAsset("item:wood")).toBe(false);
    expect(isMoneyAsset("share:biz_3")).toBe(false);
    expect(isMoneyAsset("share_1")).toBe(false);
  });
});
