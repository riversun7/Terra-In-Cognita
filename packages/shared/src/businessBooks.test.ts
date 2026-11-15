// 사업장 장부 공용 셈 시험 — 기획 D-548·D-555, docs/adr/2026-11-15-business-ledger.md
import { describe, expect, it } from "vitest";
import {
  bookColumnOf,
  businessDebtCode,
  businessLocation,
  countsForProfit,
  incomeTaxOf,
  isReservePm,
  majorHolders,
  parseBusinessDebtCode,
  reserveKeep,
  settleBoundary,
  splitByShares,
} from "./businessBooks.ts";
import { buildingLocation } from "./goodsPlaces.ts";

describe("사업장 장부", () => {
  it("사업장 위치는 건물 위치와 같다", () => {
    expect(businessLocation(42)).toBe(buildingLocation(42));
  });

  it("적자 계정 코드를 만들고 읽는다", () => {
    const code = businessDebtCode(7, "cur:abc");
    expect(code).toBe("debt:business:7:cur:abc");
    expect(parseBusinessDebtCode(code)).toEqual({ buildingId: 7, asset: "cur:abc" });
    expect(parseBusinessDebtCode("escrow:labor:1")).toBeUndefined();
  });

  it("거래 종류를 장부 칸으로 나눈다", () => {
    expect(bookColumnOf("berth_fee", true)).toBe("income");
    expect(bookColumnOf("temple_rebirth", true)).toBe("income");
    expect(bookColumnOf("business_tax", true)).toBe("tax");
    expect(bookColumnOf("labor_deposit", true)).toBe("wages");
    expect(bookColumnOf("business_settle", true)).toBe("settlement");
    expect(bookColumnOf("storage_move", false)).toBe("goods");
    expect(bookColumnOf("something_new", true)).toBe("other");
    expect(countsForProfit("income")).toBe(true);
    expect(countsForProfit("settlement")).toBe(false);
    expect(countsForProfit("debt")).toBe(false);
  });

  it("소득세는 만분율 내림이고 0 이하는 0", () => {
    expect(incomeTaxOf(1000n, 500)).toBe(50n);
    expect(incomeTaxOf(19n, 500)).toBe(0n);
    expect(incomeTaxOf(-5n, 500)).toBe(0n);
    expect(incomeTaxOf(1000n, 0)).toBe(0n);
  });

  it("지분 수대로 나누고 나머지는 큰 나머지부터", () => {
    const split = splitByShares(10n, [
      { ownerId: 3, shares: 1n },
      { ownerId: 1, shares: 1n },
      { ownerId: 2, shares: 1n },
    ]);
    expect([...split.entries()].toSorted((a, b) => a[0] - b[0])).toEqual([
      [1, 4n],
      [2, 3n],
      [3, 3n],
    ]);
    const total = [
      ...splitByShares(1001n, [
        { ownerId: 5, shares: 7n },
        { ownerId: 6, shares: 3n },
      ]).values(),
    ].reduce((a, b) => a + b, 0n);
    expect(total).toBe(1001n);
    expect(splitByShares(0n, [{ ownerId: 1, shares: 1n }]).size).toBe(0);
    expect(splitByShares(5n, []).size).toBe(0);
  });

  it("대주주는 가장 많은 지분(같으면 모두)", () => {
    expect(
      majorHolders([
        { ownerId: 2, shares: 5n },
        { ownerId: 1, shares: 5n },
        { ownerId: 3, shares: 1n },
      ]),
    ).toEqual([1, 2]);
    expect(majorHolders([])).toEqual([]);
  });

  it("정산 주기 시작은 UTC 기준 같은 간격", () => {
    expect(settleBoundary(86_400_000 * 3 + 5, 86_400_000)).toBe(86_400_000 * 3);
    expect(settleBoundary(5, 0)).toBeUndefined();
  });

  it("지급준비금 = 필요액 × (1 + 여유) × 비율, 올림 (D-564 1623)", () => {
    expect(reserveKeep(1000n, 200, 1000)).toBe(1200n);
    expect(reserveKeep(1000n, 200, 500)).toBe(600n);
    expect(reserveKeep(7n, 200, 1000)).toBe(9n);
    expect(reserveKeep(1000n, 200, 0)).toBe(0n);
    expect(reserveKeep(0n, 200, 1000)).toBe(0n);
    expect(isReservePm(0)).toBe(true);
    expect(isReservePm(5000)).toBe(true);
    expect(isReservePm(5001)).toBe(false);
    expect(isReservePm(1.5)).toBe(false);
  });
});
