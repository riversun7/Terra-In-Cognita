// 건물 재료 꺼내기 — 레벨 0 재료 T0~T1 인정(기획 D-562 1563·1564): 받는 아이템(accepts)이 있으면 그 줄 아이템 먼저, 모자라면 같은 원자재 종류
import { createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { goodsStock, grantGoods, hasGoods, spendGoods } from "./materials.ts";

function ledgerWith(stock: Record<string, number>) {
  let account = 0;
  let tx = 0;
  const ledger = createLedgerBook({ nextAccountId: () => ++account, nextTxId: () => ++tx });
  for (const [item, qty] of Object.entries(stock)) grantGoods(ledger, 1, item, qty, 0, 10);
  return ledger;
}

const WOOD = ["pine_log", "birch_log"];
const ORE = ["stone", "rubble"];

describe("레벨 0 재료 받는 아이템", () => {
  it("받는 아이템이 없으면 그 아이템만(옛 규칙)", () => {
    const ledger = ledgerWith({ pine_log: 3, birch_log: 10 });
    expect(hasGoods(ledger, 1, [{ item: "pine_log", qty: 5 }], [10])).toBe(false);
  });

  it("받는 아이템이 있으면 그 줄 아이템 먼저, 모자라면 같은 종류 T0~T1에서 뺀다", () => {
    const ledger = ledgerWith({ pine_log: 3, birch_log: 10, stone: 1, rubble: 9 });
    const materials = [
      { item: "pine_log", qty: 5, accepts: WOOD },
      { item: "stone", qty: 4, accepts: ORE },
    ];
    expect(hasGoods(ledger, 1, materials, [10])).toBe(true);
    expect(spendGoods(ledger, 1, materials, 1, "facility_build", [10])).toBe(true);
    expect(goodsStock(ledger, 1, "pine_log", [10])).toBe(0n);
    expect(goodsStock(ledger, 1, "birch_log", [10])).toBe(8n);
    expect(goodsStock(ledger, 1, "stone", [10])).toBe(0n);
    expect(goodsStock(ledger, 1, "rubble", [10])).toBe(6n);
    // 합이 모자라면 아무것도 빼지 않는다
    expect(
      spendGoods(ledger, 1, [{ item: "pine_log", qty: 9, accepts: WOOD }], 2, "facility_build", [10]),
    ).toBe(false);
    expect(goodsStock(ledger, 1, "birch_log", [10])).toBe(8n);
  });
});
