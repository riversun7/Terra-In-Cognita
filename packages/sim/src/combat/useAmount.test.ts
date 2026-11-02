// 소모품 효과량 시험(D-501): 기준 × min(상한, 스탯 ÷ 적정 스탯) × (1 ± 오차), 상한 = 무기 효율과 같은 계수표 값, 굴림은 범위 안 균등 정수.
import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { APPROPRIATE_CAP_PM, weaponScaled } from "./formula.ts";
import { rollUseAmount, useAmountRange } from "./useAmount.ts";

const CAP = TEST_COMBAT_COEFFICIENTS.appropriateCapPm;
/** 스탯 20 = 적정 20, ±500‰ */
const atAppropriate = (base: number) => useAmountRange(base, { statValue: 20, appropriate: 20 }, CAP, 500);

describe("소모품 효과량 범위(D-501)", () => {
  it("스탯 = 적정 스탯이면 기준 값 그대로, ±50%: 기준 30·50·100 → 15~45·25~75·50~150(사용자 예)", () => {
    expect(atAppropriate(30)).toEqual({ ratioPm: 1000, scaled: 30, min: 15, max: 45 });
    expect(atAppropriate(50)).toEqual({ ratioPm: 1000, scaled: 50, min: 25, max: 75 });
    expect(atAppropriate(100)).toEqual({ ratioPm: 1000, scaled: 100, min: 50, max: 150 });
  });

  it("적정 스탯이 낮은 기준 30 물약이 스탯 낮은 유닛에게는 적정 스탯이 높은 기준 50 물약보다 낫다", () => {
    // VIT 10 유닛: 기준 30·적정 10 → 1000‰ → 30(15~45), 기준 50·적정 40 → 250‰ → 12(6~18)
    const low = useAmountRange(30, { statValue: 10, appropriate: 10 }, CAP, 500);
    const high = useAmountRange(50, { statValue: 10, appropriate: 40 }, CAP, 500);
    expect(low).toEqual({ ratioPm: 1000, scaled: 30, min: 15, max: 45 });
    expect(high).toEqual({ ratioPm: 250, scaled: 12, min: 6, max: 18 });
    expect(low.scaled).toBeGreaterThan(high.scaled);
    // 스탯이 높은 유닛(VIT 40)은 기준 50이 낫다: 30 × 2(상한) = 60 대 50
    expect(useAmountRange(30, { statValue: 40, appropriate: 10 }, CAP, 500).scaled).toBe(60);
    expect(useAmountRange(50, { statValue: 40, appropriate: 40 }, CAP, 500).scaled).toBe(50);
  });

  it("상한은 무기 효율(D-420)과 같은 값·같은 비율이다: 비율 ≤ 상한, 가운데 값 = weaponScaled", () => {
    expect(CAP).toBe(APPROPRIATE_CAP_PM);
    const over = useAmountRange(40, { statValue: 100, appropriate: 10 }, CAP, 500);
    expect(over.ratioPm).toBe(CAP);
    expect(over.scaled).toBe(80);
    for (const [stat, appropriate] of [
      [7, 13],
      [39, 20],
      [0, 5],
      [1000, 3],
    ] as const)
      expect(useAmountRange(41, { statValue: stat, appropriate }, CAP, 250).scaled).toBe(
        weaponScaled(41, stat, appropriate, CAP),
      );
    // 계수표 상한을 바꾸면 그 값을 쓴다
    expect(useAmountRange(40, { statValue: 100, appropriate: 10 }, 3000, 500).ratioPm).toBe(3000);
  });

  it("비례 칸이 없으면 기준 값 그대로, 오차 250‰ → 40은 30~50", () => {
    expect(useAmountRange(40, null, CAP, 250)).toEqual({ ratioPm: 1000, scaled: 40, min: 30, max: 50 });
  });

  it("정수 내림: 스탯 39·적정 20 → 1950‰ → 40 × 1.95 = 78, ±250‰ → 58~97", () => {
    expect(useAmountRange(40, { statValue: 39, appropriate: 20 }, CAP, 250)).toEqual({
      ratioPm: 1950,
      scaled: 78,
      min: 58,
      max: 97,
    });
  });

  it("음수 기준 값(깎는 효과)도 아래로 내림, 최소 ≤ 최대", () => {
    expect(useAmountRange(-30, { statValue: 7, appropriate: 10 }, CAP, 500)).toEqual({
      ratioPm: 700,
      scaled: -21,
      min: -32,
      max: -11,
    });
  });

  it("스탯이 0 이하면 0, 큰 값은 안전 정수로 자른다", () => {
    expect(useAmountRange(50, { statValue: -5, appropriate: 10 }, CAP, 500).scaled).toBe(0);
    const huge = useAmountRange(
      1_000_000,
      { statValue: 1_000_000_000_000, appropriate: 1 },
      Number.MAX_SAFE_INTEGER,
      500,
    );
    expect([huge.scaled, huge.max]).toEqual([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
  });
});

describe("소모품 효과량 굴림", () => {
  it("[최소, 최대] 안 정수만 나오고 양 끝이 다 나온다(같은 시드면 같은 수열)", () => {
    const range = { min: 15, max: 45 };
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const value = rollUseAmount(range, rng);
      expect(Number.isInteger(value) && value >= 15 && value <= 45).toBe(true);
      seen.add(value);
    }
    expect(seen.size).toBe(31);
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 20 }, () => rollUseAmount(range, a))).toEqual(
      Array.from({ length: 20 }, () => rollUseAmount(range, b)),
    );
  });

  it("폭 1이면 그 값, 2^32를 넘는 폭도 범위 안", () => {
    expect(rollUseAmount({ min: 9, max: 9 }, createRng(1))).toBe(9);
    const wide = { min: -1, max: 0x1_0000_0000 * 3 };
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const value = rollUseAmount(wide, rng);
      expect(value >= wide.min && value <= wide.max).toBe(true);
    }
  });
});
