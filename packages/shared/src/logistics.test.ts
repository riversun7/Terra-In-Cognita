// 물류센터 요금 셈 시험 — 기획 D-576·질문 2213 요금 단위 나, docs/adr/2026-11-16-logistics-center.md
import { describe, expect, it } from "vitest";
import { cheapestCenter, haulFeeOf, haulUnits } from "./logistics.ts";

describe("물류센터 요금 단위(무게 × 거리)", () => {
  it("단위 수 = ⌈무게 ÷ 단위 무게⌉ × ⌈칸 ÷ 단위 칸⌉, 짐이 있으면 적어도 1, 짐이 없으면 0", () => {
    expect(haulUnits(100_000n, 10, 100_000, 10)).toBe(1n);
    expect(haulUnits(100_001n, 10, 100_000, 10)).toBe(2n);
    expect(haulUnits(250_000n, 31, 100_000, 10)).toBe(12n);
    expect(haulUnits(1n, 0, 100_000, 10)).toBe(1n);
    expect(haulUnits(0n, 50, 100_000, 10)).toBe(0n);
    // 단위 값이 1보다 작으면 1
    expect(haulUnits(3n, 2, 0, -5)).toBe(6n);
  });

  it("요금 = 한 단위 요금 × 단위 수, 요금 0 이하면 0", () => {
    expect(haulFeeOf(40n, 150_000n, 25, 100_000, 10)).toBe(240n);
    expect(haulFeeOf(0n, 150_000n, 25, 100_000, 10)).toBe(0n);
  });

  it("자동으로 맡길 곳 = 받는 곳 가운데 가장 싼 곳, 같으면 건물 ID가 작은 곳", () => {
    expect(
      cheapestCenter([
        { buildingId: 9, perUnit: 30n },
        { buildingId: 4, perUnit: 30n },
        { buildingId: 2, perUnit: 0n },
        { buildingId: 7, perUnit: 50n },
      ])?.buildingId,
    ).toBe(4);
    expect(cheapestCenter([{ buildingId: 1, perUnit: 0n }])).toBeUndefined();
  });
});
