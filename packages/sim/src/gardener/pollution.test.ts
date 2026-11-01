import { describe, expect, it } from "vitest";
import { TEST_GARDENER_COEFFICIENTS as c } from "./coefficients.ts";
import {
  addPollution,
  dailyPollutionStep,
  facilityPollution,
  humanPollution,
  influenceCells,
  influenceSum,
  purify,
  squareGrid,
} from "./pollution.ts";

const HOUR = 3_600_000;
const grid = squareGrid(64);
const at = (x: number, y: number): number => grid.cellOf(x, y);
const byCell = (x: [number, number], y: [number, number]): number => x[0] - y[0];

describe("오염 층(D-460 200, P15)", () => {
  it("더하기는 칸마다 0~10,000 안에 머물고, 0이 된 칸은 지운다", () => {
    const layer = new Map<number, number>();
    expect(addPollution(layer, at(5, 5), 9_900, c)).toBe(9_900);
    expect(addPollution(layer, at(5, 5), 500, c)).toBe(10_000);
    expect(addPollution(layer, at(5, 5), -20_000, c)).toBe(0);
    expect(layer.has(at(5, 5))).toBe(false);
  });

  it("휴먼 100명당 하루 +10(내림), 시설은 레벨 × 오염 값 × 일한 시간", () => {
    expect(humanPollution(1_000, c)).toBe(100);
    expect(humanPollution(99, c)).toBe(9);
    expect(humanPollution(9, c)).toBe(0);
    // 광산 Lv2(오염 값 6)가 하루 24시간 일함 = 288, 반 시간은 내림
    expect(facilityPollution(2 * 6 * 24 * HOUR)).toBe(288);
    expect(facilityPollution(6 * (HOUR / 2) - 1)).toBe(2);
  });

  it("하루: 1% 자연 감소(올림) 뒤 2%가 이웃 8칸으로 고르게 퍼진다", () => {
    const layer = new Map([[at(10, 10), 10_000]]);
    const next = dailyPollutionStep(layer, grid, c);
    // 감소 100 → 9,900, 퍼짐 ⌊9,900 × 2%⌋ = 198 → 이웃마다 ⌊198 ÷ 8⌋ = 24, 남는 6은 제자리
    expect(next.get(at(10, 10))).toBe(9_900 - 24 * 8);
    expect(next.get(at(11, 11))).toBe(24);
    expect(next.get(at(9, 10))).toBe(24);
    expect(next.size).toBe(9);
    // 원본은 그대로
    expect(layer.get(at(10, 10))).toBe(10_000);
  });

  it("작은 값도 자연 감소로 결국 0이 된다(최소 1)", () => {
    let layer = new Map([[at(3, 3), 3]]);
    for (let day = 0; day < 3; day++) layer = dailyPollutionStep(layer, grid, c);
    expect(layer.size).toBe(0);
  });

  it("숲 칸은 하루 20 더 준다, 정화는 설정값만큼", () => {
    const layer = new Map([
      [at(1, 1), 1_000],
      [at(20, 20), 1_000],
    ]);
    const next = dailyPollutionStep(layer, grid, c, (cell) => cell === at(1, 1));
    expect((next.get(at(20, 20)) ?? 0) - (next.get(at(1, 1)) ?? 0)).toBe(20);
    // 1,000 − 감소 10 − 퍼짐 2 × 8 = 974, 정화 50
    expect(purify(next, at(20, 20), c)).toBe(924);
    expect(next.get(at(20, 20))).toBe(924);
  });

  it("상한 칸이 퍼짐을 받아도 상한을 넘지 않는다", () => {
    const layer = new Map([
      [at(10, 10), 10_000],
      [at(11, 10), 10_000],
    ]);
    const next = dailyPollutionStep(layer, grid, c);
    for (const value of next.values()) expect(value).toBeLessThanOrEqual(10_000);
  });

  it("넣은 차례가 달라도 결과가 같다(결정성)", () => {
    const a = new Map([
      [at(4, 4), 5_000],
      [at(5, 4), 7_000],
      [at(30, 2), 900],
    ]);
    const b = new Map([...a].toReversed());
    expect([...dailyPollutionStep(a, grid, c)].toSorted(byCell)).toEqual(
      [...dailyPollutionStep(b, grid, c)].toSorted(byCell),
    );
  });

  it("영향권 = 도시 칸 + 반경 안 칸(반경 1이면 9칸), 합은 그 칸 값의 합", () => {
    expect(influenceCells(at(10, 10), grid, 1)).toHaveLength(9);
    expect(influenceCells(at(10, 10), grid, 0)).toEqual([at(10, 10)]);
    expect(influenceCells(at(0, 0), grid, 1)).toHaveLength(4);
    const layer = new Map([
      [at(10, 10), 3_000],
      [at(11, 11), 500],
      [at(12, 12), 400],
    ]);
    expect(influenceSum(layer, at(10, 10), grid, 1)).toBe(3_500);
    expect(influenceSum(layer, at(10, 10), grid, 2)).toBe(3_900);
  });
});
