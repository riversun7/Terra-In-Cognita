// 결정적 수학 함수 시험 — 정확도(엔진의 Math 함수와 비교)와 골든 비트(값이 바뀌면 바로 잡는다)
import { describe, expect, it } from "vitest";
import { detAsin, detAtan, detAtan2, detCos, detExp, detSin, detTan } from "./detMath.ts";

const view = new DataView(new ArrayBuffer(8));

/** 64비트 실수의 비트(16진수 16자리) */
function bitsOf(value: number): string {
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}

/** |value|에서 바로 위 실수까지의 간격 (마지막 자리 1의 크기, ulp) */
function ulpOf(value: number): number {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude)) return Number.NaN;
  view.setFloat64(0, magnitude);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0) - magnitude;
}

/** 기준값과의 차이(ulp). 기준값이 0 근처면 가장 작은 정규수 간격을 쓴다 */
function ulpError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.max(ulpOf(expected), 2 ** -1074);
}

/** [from, to]를 count칸으로 나눈 점마다 최대 오차(ulp)와 그 위치 */
function maxError(
  fn: (x: number) => number,
  reference: (x: number) => number,
  from: number,
  to: number,
  count: number,
): { ulps: number; at: number } {
  let worst = { ulps: 0, at: from };
  for (let k = 0; k <= count; k++) {
    const x = from + ((to - from) * k) / count;
    const ulps = ulpError(fn(x), reference(x));
    if (ulps > worst.ulps) worst = { ulps, at: x };
  }
  return worst;
}

describe("정확도: 엔진의 Math 함수와 비교 (Math 함수도 1ulp 안팎의 오차가 있다)", () => {
  it("sin·cos: |x| ≤ 100에서 2ulp 이하, |x| ≤ π/4에서 1ulp 이하", () => {
    expect(maxError(detSin, Math.sin, -100, 100, 200_000).ulps).toBeLessThanOrEqual(2);
    expect(maxError(detCos, Math.cos, -100, 100, 200_000).ulps).toBeLessThanOrEqual(2);
    expect(maxError(detSin, Math.sin, -Math.PI / 4, Math.PI / 4, 100_000).ulps).toBeLessThanOrEqual(1);
    expect(maxError(detCos, Math.cos, -Math.PI / 4, Math.PI / 4, 100_000).ulps).toBeLessThanOrEqual(1);
  });

  it("sin·cos 큰 인수(|x| ≤ 1e5)는 절대 오차 1e-11 이하 (인수 줄이기 오차)", () => {
    let worst = 0;
    for (let k = 0; k <= 50_000; k++) {
      const x = -1e5 + (2e5 * k) / 50_000 + 0.123;
      worst = Math.max(worst, Math.abs(detSin(x) - Math.sin(x)), Math.abs(detCos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(1e-11);
  });

  it("tan: |x| ≤ π/4에서 2ulp 이하, |x| ≤ 20(극 근처 |cos x| < 1e-3 제외)에서 4ulp 이하", () => {
    expect(maxError(detTan, Math.tan, -Math.PI / 4, Math.PI / 4, 100_000).ulps).toBeLessThanOrEqual(2);
    let worst = 0;
    for (let k = 0; k <= 200_000; k++) {
      const x = -20 + (40 * k) / 200_000;
      if (Math.abs(Math.cos(x)) < 1e-3) continue;
      worst = Math.max(worst, ulpError(detTan(x), Math.tan(x)));
    }
    expect(worst).toBeLessThanOrEqual(4);
  });

  it("atan: |x| ≤ 1과 1 < |x| ≤ 1e6에서 2ulp 이하, 아주 큰 값(1e300)도", () => {
    expect(maxError(detAtan, Math.atan, -1, 1, 200_000).ulps).toBeLessThanOrEqual(2);
    expect(maxError(detAtan, Math.atan, 1, 50, 200_000).ulps).toBeLessThanOrEqual(2);
    let worst = 0;
    for (let e = -300; e <= 300; e += 0.01) {
      const x = 10 ** e;
      worst = Math.max(worst, ulpError(detAtan(x), Math.atan(x)), ulpError(detAtan(-x), Math.atan(-x)));
    }
    expect(worst).toBeLessThanOrEqual(2);
  });

  it("atan2: 네 사분면 모두 2ulp 이하", () => {
    let worst = 0;
    for (let a = 0; a < 3600; a++) {
      for (const radius of [1e-3, 0.7, 1, 123.4]) {
        const angle = (a / 3600) * 2 * Math.PI - Math.PI + 1e-4;
        const y = radius * Math.sin(angle);
        const x = radius * Math.cos(angle);
        worst = Math.max(worst, ulpError(detAtan2(y, x), Math.atan2(y, x)));
      }
    }
    expect(worst).toBeLessThanOrEqual(2);
  });

  it("asin: [-1, 1]에서 2ulp 이하", () => {
    expect(maxError(detAsin, Math.asin, -1, 1, 200_000).ulps).toBeLessThanOrEqual(2);
  });

  it("exp: [-700, 700]에서 2ulp 이하, [-1, 1]에서 1ulp 이하", () => {
    expect(maxError(detExp, Math.exp, -700, 700, 200_000).ulps).toBeLessThanOrEqual(2);
    expect(maxError(detExp, Math.exp, -1, 1, 100_000).ulps).toBeLessThanOrEqual(1);
  });
});

describe("특별한 값", () => {
  it("0·부호·대칭이 정확하다", () => {
    expect(Object.is(detSin(0), 0)).toBe(true);
    expect(Object.is(detSin(-0), -0)).toBe(true);
    expect(Object.is(detTan(-0), -0)).toBe(true);
    expect(Object.is(detAtan(-0), -0)).toBe(true);
    expect(detCos(0)).toBe(1);
    expect(detExp(0)).toBe(1);
    expect(detAtan(1)).toBe(Math.PI / 4);
    expect(detAtan(Number.POSITIVE_INFINITY)).toBe(Math.PI / 2);
    expect(detAtan(Number.NEGATIVE_INFINITY)).toBe(-Math.PI / 2);
    expect(detAsin(1)).toBe(Math.PI / 2);
    expect(detAsin(-1)).toBe(-Math.PI / 2);
    for (const x of [0.1, 0.7, 1.3, 2.9, 17.5, 1234.5]) {
      expect(detSin(-x)).toBe(-detSin(x));
      expect(detCos(-x)).toBe(detCos(x));
      expect(detTan(-x)).toBe(-detTan(x));
      expect(detAtan(-x)).toBe(-detAtan(x));
    }
  });

  it("정의역 밖·무한·NaN은 Math 함수와 같게 처리한다", () => {
    for (const fn of [detSin, detCos, detTan]) {
      expect(fn(Number.POSITIVE_INFINITY)).toBeNaN();
      expect(fn(Number.NaN)).toBeNaN();
    }
    expect(detAtan(Number.NaN)).toBeNaN();
    expect(detAsin(1.0000001)).toBeNaN();
    expect(detExp(Number.NaN)).toBeNaN();
    expect(detExp(710)).toBe(Number.POSITIVE_INFINITY);
    expect(detExp(-746)).toBe(0);
    expect(detExp(709.78)).toBeLessThan(Number.MAX_VALUE);
    expect(detExp(-745)).toBeGreaterThan(0);
    expect(detExp(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("atan2의 축·0·무한 경우는 명세(ECMA-262 Math.atan2)와 같다", () => {
    const cases: [number, number][] = [
      [0, 1],
      [-0, 1],
      [0, -1],
      [-0, -1],
      [0, 0],
      [-0, 0],
      [0, -0],
      [-0, -0],
      [1, 0],
      [-1, 0],
      [1, -0],
      [1, Number.POSITIVE_INFINITY],
      [1, Number.NEGATIVE_INFINITY],
      [-1, Number.NEGATIVE_INFINITY],
      [Number.POSITIVE_INFINITY, 1],
      [Number.NEGATIVE_INFINITY, 1],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [Number.NaN, 1],
      [1, Number.NaN],
    ];
    for (const [y, x] of cases) {
      expect(Object.is(detAtan2(y, x), Math.atan2(y, x)), `atan2(${y}, ${x})`).toBe(true);
    }
  });
});

describe("골든 비트: 결과가 한 자리라도 바뀌면 실패한다 (바꾸면 이 값을 쓰는 생성기 GENERATOR_VERSION도 올린다)", () => {
  it("고정 입력의 출력 비트", () => {
    const outputs = {
      sin: [0.5, 2, -3.7, 100].map(detSin),
      cos: [0.5, 2, -3.7, 100].map(detCos),
      tan: [0.3, Math.PI / 8, 1.2, -2.5].map(detTan),
      atan: [0.05, 0.3, 0.9, 3, -1e7].map(detAtan),
      atan2: [detAtan2(1, -2), detAtan2(-0.3, 0.4), detAtan2(-5, -5)],
      asin: [0.3, -0.999, 0.5].map(detAsin),
      exp: [1, -2.5, 0.123, 300].map(detExp),
    };
    const bits = Object.fromEntries(
      Object.entries(outputs).map(([name, values]) => [name, values.map(bitsOf)]),
    );
    // 2026-10-29 기록. 4배 정밀도 기준과 비교: sin(0.5)·cos(0.5)·atan(0.3)은 정확히 반올림한 값, exp(1)·tan(0.3)은 1ulp 차이
    expect(bits).toEqual({
      sin: ["3fdeaee8744b05f0", "3fed18f6ead1b446", "3fe0f46aec2e1b41", "bfe03425b78c4db8"],
      cos: ["3fec1528065b7d50", "bfdaa22657537205", "bfeb23a2ad7dd937", "3feb981dbf665fe0"],
      tan: ["3fd3cc2a44e29997", "3fda827999fcef33", "400493c43acb164c", "3fe7e79b4e00bb14"],
      atan: [
        "3fa9942597929f27",
        "3fd2a73a661eaf06",
        "3fe77338a80603be",
        "3ff3fc176b7a8560",
        "bff921fb396c3a7e",
      ],
      atan2: ["40056c6e7397f5ae", "bfe4978fa3269ee1", "c002d97c7f3321d2"],
      asin: ["3fd380159e14f6ff", "bff86ac9ad18f803", "3fe0c152382d7366"],
      exp: ["4005bf0a8b14576a", "3fb50385c094f425", "3ff2181a433867e4", "5afc05c0a7166b4a"],
    });
  });
});
