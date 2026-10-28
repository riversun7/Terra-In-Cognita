import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { isqrt, isqrtRound } from "./isqrt.ts";

// 정의로 확인한다(BigInt, 구현과 다른 계산): r² ≤ n < (r+1)²
function isFloorSqrt(n: number, r: number): boolean {
  const big = BigInt(n);
  const root = BigInt(r);
  return root * root <= big && big < (root + 1n) * (root + 1n);
}

// 가장 가까운 정수: (2r-1)² ≤ 4n ≤ (2r+1)² (n이 정수라 같을 수는 없다)
function isNearestSqrt(n: number, r: number): boolean {
  const four = 4n * BigInt(n);
  const root = BigInt(r);
  const low = 2n * root - 1n;
  const high = 2n * root + 1n;
  return (r === 0 || low * low <= four) && four <= high * high;
}

describe("isqrt (내림 정수 제곱근)", () => {
  it("알려진 값", () => {
    expect([0, 1, 2, 3, 4, 15, 16, 17, 99, 100].map(isqrt)).toEqual([0, 1, 1, 1, 2, 3, 4, 4, 9, 10]);
    expect(isqrt(2 ** 52)).toBe(67_108_864);
    expect(isqrt(Number.MAX_SAFE_INTEGER)).toBe(94_906_265);
    // 대각선 1칸의 길이 제곱(2 × 1024²)
    expect(isqrt(2_097_152)).toBe(1448);
  });

  it("0 ~ 2^20 전 범위에서 정의와 같다", () => {
    for (let n = 0; n <= 1 << 20; n++) {
      const r = isqrt(n);
      if (!(r * r <= n && n < (r + 1) * (r + 1))) throw new Error(`isqrt(${n}) = ${r}`);
    }
  });

  it("안전 정수 끝까지 제곱수 경계에서 정의와 같다", () => {
    const rng = createRng(20261028);
    const maxRoot = 94_906_265;
    for (let i = 0; i < 20_000; i++) {
      const k = 1 + rng.nextInt(maxRoot);
      for (const n of [k * k - 1, k * k, k * k + 2 * k]) {
        if (n > Number.MAX_SAFE_INTEGER) continue;
        const r = isqrt(n);
        if (!isFloorSqrt(n, r)) throw new Error(`isqrt(${n}) = ${r}`);
      }
    }
    for (let n = Number.MAX_SAFE_INTEGER - 1000; n <= Number.MAX_SAFE_INTEGER; n++) {
      expect(isFloorSqrt(n, isqrt(n))).toBe(true);
    }
  });

  it("음수·소수·안전 범위 밖은 거부한다", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => isqrt(bad)).toThrow(RangeError);
    }
  });
});

describe("isqrtRound (가장 가까운 정수 제곱근)", () => {
  it("알려진 값", () => {
    // √2=1.41, √3=1.73, √6=2.45, √7=2.65, √12=3.46, √13=3.61
    expect([0, 1, 2, 3, 6, 7, 12, 13].map(isqrtRound)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    // 대각선 1칸: √2 × 1024 = 1448.15 → 1448, 대각선 2칸: 2896.31 → 2896
    expect(isqrtRound(2_097_152)).toBe(1448);
    expect(isqrtRound(8_388_608)).toBe(2896);
  });

  it("넓은 범위에서 정의와 같다", () => {
    const rng = createRng(7);
    for (let n = 0; n <= 100_000; n++) {
      const r = isqrtRound(n);
      if (!isNearestSqrt(n, r)) throw new Error(`isqrtRound(${n}) = ${r}`);
    }
    for (let i = 0; i < 20_000; i++) {
      const n = rng.nextU32() * 2 ** 21 + rng.nextInt(2 ** 21);
      const r = isqrtRound(n);
      if (!isNearestSqrt(n, r)) throw new Error(`isqrtRound(${n}) = ${r}`);
    }
  });
});
