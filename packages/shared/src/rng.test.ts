import { describe, expect, it } from "vitest";
import { createRng } from "./rng.ts";

describe("createRng", () => {
  it("같은 시드는 같은 수열을 만든다", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 5 }, () => a.nextU32());
    const seqB = Array.from({ length: 5 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it("고정 시드의 첫 값이 바뀌지 않는다 (골든 값)", () => {
    // 표준 mulberry32 참조 구현(seed=1)의 출력과 같다.
    // 이 값이 바뀌면 판정 재현성이 깨진 것이다. 의도한 변경이면 simVersion을 올린다.
    const rng = createRng(1);
    expect([rng.nextU32(), rng.nextU32(), rng.nextU32()]).toEqual([2693262067, 11749833, 2265367787]);
  });

  it("nextInt는 범위 안의 정수만 낸다", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.nextInt(6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });

  it("잘못된 범위는 거부한다", () => {
    const rng = createRng(7);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
  });
});
