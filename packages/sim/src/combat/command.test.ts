import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { commandCapOf } from "./command.ts";

const primaries = (int: number, wis: number): number[] => [10, 10, 10, 10, int, wis];

describe("지휘관 정원(C7, 사용자 1464 — 3~20, 지휘관 능력·스킬)", () => {
  it("새 사이보그(1차 10)는 아래 끝 3, 지휘 점수가 오르면 파티가 늘고 위 끝 20에서 멈춘다", () => {
    expect(commandCapOf(primaries(10, 10), TEST_COMBAT_COEFFICIENTS)).toBe(3);
    expect(commandCapOf(primaries(0, 0), TEST_COMBAT_COEFFICIENTS)).toBe(3);
    expect(commandCapOf(primaries(40, 40), TEST_COMBAT_COEFFICIENTS)).toBe(6);
    expect(commandCapOf(primaries(180, 180), TEST_COMBAT_COEFFICIENTS)).toBe(20);
    expect(commandCapOf(primaries(900, 900), TEST_COMBAT_COEFFICIENTS)).toBe(20);
  });

  it("덤(스킬·작위 몫)을 더하고, 식이 없는 옛 계수표는 0", () => {
    expect(commandCapOf(primaries(40, 40), TEST_COMBAT_COEFFICIENTS, 2)).toBe(8);
    expect(commandCapOf(primaries(40, 40), {})).toBe(0);
  });
});
