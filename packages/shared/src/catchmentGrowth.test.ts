// 도시 크기에 따라 넓어지는 배후지·채집 다툼 시험(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)")
import { describe, expect, it } from "vitest";
import {
  type CatchmentGrowthRules,
  type CatchmentSupplyRules,
  type SupplyStock,
  catchmentAreaMilli,
  catchmentNeedPm,
  catchmentRadiusMilli,
  cellRegrow,
  cityPairGapMilli,
  isqrt,
  materialDemand,
  stepCatchmentSupply,
  sustainablePerCell,
} from "./catchment.ts";

const GROWTH: CatchmentGrowthRules = {
  cellsPerHundred: 27,
  gradeNeedBasePm: 700,
  gradeNeedStepPm: 150,
  techNeedPm: 50,
  minRadiusMilli: 1000,
  maxRadiusMilli: 8000,
};
const SUPPLY: CatchmentSupplyRules = { stockPerCell: 1000, regrowPm: 400, regrowFloor: 20, drawPm: 600 };

describe("요구 반경", () => {
  it("정수 제곱근", () => {
    expect(isqrt(0)).toBe(0);
    expect(isqrt(15)).toBe(3);
    expect(isqrt(16)).toBe(4);
    expect(isqrt(3_952_896)).toBe(1988);
  });

  it("인구·등급·기술이 오르면 반경이 넓어진다(아래·위 끝 안)", () => {
    expect(catchmentNeedPm({ grade: 4, tech: 3 }, GROWTH)).toBe(1300);
    expect(catchmentNeedPm({ grade: 9, tech: 0 }, GROWTH)).toBe(700 + 150 * 5);
    // 40명·등급 4·기술 2: 넓이 40 × 27 × 1250 ÷ 100 = 13,500(13.5칸) → 반경 √(13.5 ÷ π) ≈ 2.073칸
    expect(catchmentAreaMilli({ population: 40, grade: 4, tech: 2 }, GROWTH)).toBe(13_500);
    expect(catchmentRadiusMilli({ population: 40, grade: 4, tech: 2 }, GROWTH)).toBe(2072);
    const small = catchmentRadiusMilli({ population: 24, grade: 3, tech: 1 }, GROWTH);
    const big = catchmentRadiusMilli({ population: 90, grade: 5, tech: 3 }, GROWTH);
    const bigger = catchmentRadiusMilli({ population: 90, grade: 6, tech: 3 }, GROWTH);
    expect(small).toBeLessThan(2072);
    expect(big).toBeGreaterThan(3000);
    expect(bigger).toBeGreaterThan(big);
    expect(catchmentRadiusMilli({ population: 0, grade: 1, tech: 0 }, GROWTH)).toBe(1000);
    expect(catchmentRadiusMilli({ population: 100_000, grade: 6, tech: 9 }, GROWTH)).toBe(8000);
  });

  it("두 도시 간격 = 반경 합 × 천분율", () => {
    const rules = { sameGapPm: 1000, foreignGapPm: 1500 };
    expect(cityPairGapMilli(2000, 3000, true, rules)).toBe(5000);
    expect(cityPairGapMilli(2000, 3000, false, rules)).toBe(7500);
    expect(cityPairGapMilli(2000, 2000, true, rules)).toBe(4000);
  });
});

describe("채집 다툼과 고갈", () => {
  const all = (): number => 1000;
  /** 칸 cells개를 가진 도시 하나(작물만 캔다), 요구 넓이 = 칸 수 */
  const city = (id: number, cells: readonly number[], areaCells = cells.length) => ({
    id,
    cells,
    demand: { crop: materialDemand(areaCells * 1000, 1, 1, SUPPLY) },
  });
  const run = (cities: ReturnType<typeof city>[], days: number) => {
    const stock: SupplyStock = new Map();
    let last = new Map<number, number>();
    for (let day = 0; day < days; day++)
      last = new Map([...stepCatchmentSupply(cities, stock, all, SUPPLY)].map(([id, r]) => [id, r.totalPm]));
    return { last, stock };
  };

  it("다시 자람은 재고 반에서 가장 많고, 0에서도 바닥만큼", () => {
    expect(cellRegrow(0, 1000, SUPPLY)).toBe(20);
    expect(sustainablePerCell(SUPPLY)).toBe(120);
    expect(cellRegrow(250, 1000, SUPPLY)).toBeLessThan(120);
    expect(cellRegrow(1000, 1000, SUPPLY)).toBe(20);
    expect(cellRegrow(500, 0, SUPPLY)).toBe(0);
  });

  it("요구 넓이를 혼자 쓰면 60일 뒤에도 다 받는다", () => {
    const { last, stock } = run([city(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], 60);
    expect(last.get(1)).toBe(1000);
    // 재고는 상한 아래 안정점(약 85%)에 머문다
    const crop = stock.get(1)?.[3] ?? 0;
    expect(crop).toBeGreaterThan(700);
    expect(crop).toBeLessThan(1000);
  });

  it("배후지가 겹치면 두 도시 모두 덜 받고, 겹친 칸이 많을수록 더 떨어진다(고갈)", () => {
    const cells = (from: number) => Array.from({ length: 10 }, (_, k) => from + k);
    const alone = run([city(1, cells(0))], 30).last.get(1) ?? 0;
    const half = run([city(1, cells(0)), city(2, cells(5))], 30).last;
    const full = run([city(1, cells(0)), city(2, cells(0))], 30).last;
    expect(alone).toBe(1000);
    expect(half.get(1)).toBeLessThan(1000);
    expect(half.get(2)).toBeLessThan(1000);
    expect(full.get(1) ?? 0).toBeLessThan(half.get(1) ?? 0);
    // 다 겹치면 재고가 바닥나 다시 자라는 바닥만 나눈다
    expect(full.get(1) ?? 0).toBeLessThan(300);
    expect(full.get(1)).toBe(full.get(2));
  });

  it("원자재가 없는 칸은 캘 수 없고, 같은 입력이면 같은 결과", () => {
    const noCrop = (_cell: number, material: string): number => (material === "crop" ? 0 : 1000);
    const stock: SupplyStock = new Map();
    const result = stepCatchmentSupply([city(1, [1, 2, 3])], stock, noCrop, SUPPLY).get(1);
    expect(result?.supplyPm.crop).toBe(0);
    expect(result?.supplyPm.ore).toBe(1000);
    const a = run([city(1, [1, 2, 3, 4]), city(2, [3, 4, 5, 6])], 12);
    const b = run([city(2, [3, 4, 5, 6]), city(1, [1, 2, 3, 4])], 12);
    expect([...a.last]).toEqual([...b.last]);
    expect([...a.stock]).toEqual([...b.stock]);
  });

  it("가장 많이 쓰는 원자재는 버티는 양의 drawPm, 덜 쓰는 원자재는 가중치 비율만큼", () => {
    expect(materialDemand(10_000, 2, 2, SUPPLY)).toBe(10 * 120 * 0.6);
    expect(materialDemand(10_000, 1, 2, SUPPLY)).toBe(10 * 120 * 0.3);
    expect(materialDemand(10_000, 0, 2, SUPPLY)).toBe(0);
  });
});
