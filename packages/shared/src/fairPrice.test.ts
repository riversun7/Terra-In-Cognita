// 적정가 셈(기획 D-570 1822) 시험
import { describe, expect, it } from "vitest";
import { incomeTaxOf } from "./businessBooks.ts";
import { fairPrice, fairPriceView, laborCostOf, serviceFeeOf } from "./fairPrice.ts";

describe("적정가(D-570 1822)", () => {
  it("재료비 + 인건비에 수수료를 붙이고, 소득세를 낸 뒤 원가 + 수수료가 남는 가장 작은 값", () => {
    const value = fairPrice({ materials: 600n, labor: 400n, feePm: 200, taxBp: 1000 });
    expect(value.fee).toBe(200n);
    // 1,200 ÷ 0.9 = 1,333.3 → 1,334(세금 133 내림 → 남는 돈 1,201)이 아니라 남는 돈이 1,200 이상인 가장 작은 값
    expect(value.price - incomeTaxOf(value.price, 1000)).toBeGreaterThanOrEqual(1200n);
    expect(value.price - 1n - incomeTaxOf(value.price - 1n, 1000)).toBeLessThan(1200n);
    expect(value.materials + value.labor + value.fee + value.tax).toBe(value.price);
  });

  it("세금·수수료가 없으면 원가 그대로, 음수는 0", () => {
    expect(fairPrice({ materials: 5n, labor: 7n, feePm: 0, taxBp: 0 }).price).toBe(12n);
    expect(fairPrice({ materials: -5n, labor: 0n, feePm: 100, taxBp: 500 }).price).toBe(0n);
  });

  it("응답 꼴은 글자", () => {
    expect(fairPriceView(fairPrice({ materials: 1n, labor: 0n, feePm: 0, taxBp: 0 }))).toEqual({
      materials: "1",
      labor: "0",
      fee: "0",
      tax: "0",
      price: "1",
    });
  });

  it("시간당 값 × 시간(올림)", () => {
    expect(laborCostOf(600n, 360_000)).toBe(60n);
    expect(laborCostOf(1n, 1)).toBe(1n);
    expect(laborCostOf(0n, 360_000)).toBe(0n);
    expect(serviceFeeOf(600n, 0)).toBe(0n);
  });
});
