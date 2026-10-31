import { describe, expect, it } from "vitest";
import { latticeNoiseGrid, latticeValue, sampleLatticeNoise, smoothWeight } from "./latticeNoise.ts";

describe("면 격자 정수 노이즈", () => {
  it("한꺼번에 낸 값이 하나씩 낸 값과 비트까지 같다", () => {
    for (const k of [0, 2, 3, 6, 9]) {
      const grid = latticeNoiseGrid(1, 13, 4000, 6000, 1, 40, 30, k, 77);
      for (let b = 0; b < 30; b += 7) {
        for (let a = 0; a < 40; a += 5) {
          expect(grid[b * 40 + a]).toBe(sampleLatticeNoise(1, 13, 4000 + a, 6000 + b, k, 77));
        }
      }
    }
  });

  it("격자점에서는 격자점 값, 값은 0 ~ 65535, 소금이 다르면 다른 값", () => {
    expect(sampleLatticeNoise(2, 10, 64, 128, 4, 5)).toBe(latticeValue(2, 6, 4, 8, 5));
    let differ = 0;
    for (let x = 0; x < 200; x++) {
      const v = sampleLatticeNoise(0, 12, x * 13, x * 7, 3, 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(65536);
      if (v !== sampleLatticeNoise(0, 12, x * 13, x * 7, 3, 2)) differ += 1;
    }
    expect(differ).toBeGreaterThan(190);
  });

  it("정수 smoothstep은 거꾸로 해도 정확히 1 − 값이다(맞닿은 면이 반대 방향으로 이어도 같다)", () => {
    for (const k of [1, 4, 8]) {
      for (let x = 0; x <= 2 ** k; x++)
        expect(smoothWeight(2 ** k - x, k)).toBe(2 ** (3 * k) - smoothWeight(x, k));
    }
  });

  it("면 경계 점은 맞닿은 두 면에서 같은 값이다(면 0 i 끝 = 면 1 i 시작, 뒤집힘 없음)", () => {
    const level = 12;
    const N = 2 ** level;
    for (let J = 0; J <= N; J += 97) {
      expect(sampleLatticeNoise(0, level, N, J, 5, 9)).toBe(sampleLatticeNoise(1, level, 0, J, 5, 9));
    }
  });
});
