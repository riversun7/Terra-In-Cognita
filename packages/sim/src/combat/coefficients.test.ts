import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS, affinityRatePm, regenOnTick } from "./coefficients.ts";

const c = TEST_COMBAT_COEFFICIENTS;
const sumTicks = (perMinute: number, ticks: number, scale: number): number => {
  let sum = 0;
  for (let tick = 0; tick < ticks; tick++) sum += regenOnTick(perMinute, tick, scale, c);
  return sum;
};

describe("분당 회복을 틱에 나눠 준다(스태미나·MP 회복, 쉴드 재생 D-458)", () => {
  it("1분(600틱)을 모으면 분당 값 그대로: 쉴드 재생 35/분은 틱마다 1 미만이어도 35", () => {
    expect(sumTicks(35, 600, 1)).toBe(35);
    expect(sumTicks(180, 600, 1000)).toBe(180_000);
    // 30초면 반
    expect(sumTicks(35, 300, 1)).toBe(17);
    expect(sumTicks(180, 300, 1000)).toBe(90_000);
  });

  it("음수·0은 회복하지 않고, 아주 큰 값도 안전 정수 안이다", () => {
    expect(regenOnTick(0, 10, 1000, c)).toBe(0);
    expect(regenOnTick(-50, 10, 1000, c)).toBe(0);
    const big = regenOnTick(6_000_000_000, 18_000, 1000, c);
    expect(Number.isSafeInteger(big)).toBe(true);
    expect(big).toBe(10_000_000_000);
  });
});

describe("계열 상성 rate(C10, 50 §2.1)", () => {
  it("유리 +50, 불리 −50, 보통 0, 같은 계열 −30(D-459)", () => {
    // 물 → 불 유리, 물 → 땅 불리, 물 → 바람 보통, 불 → 불 같은 계열
    expect(affinityRatePm(0, 1, c)).toBe(50);
    expect(affinityRatePm(0, 3, c)).toBe(-50);
    expect(affinityRatePm(0, 2, c)).toBe(0);
    expect(affinityRatePm(1, 1, c)).toBe(-30);
    // 큰 고리: 어둠 → 4원소 유리, 4원소 → 빛 유리, 빛 → 어둠 유리
    expect(affinityRatePm(5, 2, c)).toBe(50);
    expect(affinityRatePm(3, 4, c)).toBe(50);
    expect(affinityRatePm(4, 5, c)).toBe(50);
    expect(affinityRatePm(4, 0, c)).toBe(-50);
  });
});
