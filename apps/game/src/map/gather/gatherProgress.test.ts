import { describe, expect, it } from "vitest";
import { cargoFraction, digProgress } from "./gatherProgress.ts";

describe("digProgress", () => {
  it("캐는 중이면 시작~끝 사이 지금 몫과 남은 시간", () => {
    expect(digProgress({ phase: "gathering", phaseAt: 1_000, nextAt: 5_000 }, 2_000)).toEqual({
      fraction: 0.25,
      remainingMs: 3_000,
      totalMs: 4_000,
      elapsedMs: 1_000,
      key: "1000:5000",
    });
  });

  it("끝을 넘으면 1·0, 시작 전이면 0", () => {
    expect(digProgress({ phase: "gathering", phaseAt: 1_000, nextAt: 5_000 }, 9_000)).toMatchObject({
      fraction: 1,
      remainingMs: 0,
    });
    expect(digProgress({ phase: "gathering", phaseAt: 1_000, nextAt: 5_000 }, 500)?.fraction).toBe(0);
  });

  it("캐는 중이 아니거나 시각을 모르면(옛 서버) null", () => {
    expect(digProgress({ phase: "to_object", phaseAt: 1_000, nextAt: 5_000 }, 2_000)).toBeNull();
    expect(digProgress({ phase: "gathering", nextAt: 5_000 }, 2_000)).toBeNull();
    expect(digProgress({ phase: "gathering", phaseAt: 1_000, nextAt: null }, 2_000)).toBeNull();
    expect(digProgress({ phase: "gathering", phaseAt: 5_000, nextAt: 5_000 }, 5_000)).toBeNull();
  });
});

describe("cargoFraction", () => {
  it("화물 몫, 넘치면 1, 상한 0이면 0", () => {
    expect(cargoFraction({ carriedGrams: 20_000, capacityGrams: 80_000 })).toBe(0.25);
    expect(cargoFraction({ carriedGrams: 90_000, capacityGrams: 80_000 })).toBe(1);
    expect(cargoFraction({ carriedGrams: 5, capacityGrams: 0 })).toBe(0);
  });
});
