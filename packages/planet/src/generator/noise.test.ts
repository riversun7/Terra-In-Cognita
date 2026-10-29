// 노이즈 2판 시험 — 옥타브마다 옮긴 격자·좌표 흔들기가 격자점 영점을 없애는지, 두 채널 노이즈가 서로 무관하고
// 채널 A가 한 채널 노이즈와 같은지, 1판 노이즈 값이 그대로인지(판·대륙 배치가 바뀌지 않게)
import { describe, expect, it } from "vitest";
import {
  fbm3,
  gradientNoise3,
  noiseOctaveLattice,
  offsetFbm3,
  offsetFbm3Pair,
  offsetRidged3,
  ridged3,
} from "./noise.ts";
import { mix32 } from "./random.ts";
import { latticeRmsRatio } from "./testVarietyUnit.ts";

/** 정수 해시로 고른 [0, size)³의 점 k (결정적 표본) */
function samplePoint(k: number, size: number): [number, number, number] {
  return [
    (mix32(k * 3 + 101) / 4_294_967_296) * size,
    (mix32(k * 3 + 102) / 4_294_967_296) * size,
    (mix32(k * 3 + 103) / 4_294_967_296) * size,
  ];
}

describe("노이즈 1판 (판·대륙·기복·숲이 쓴다: 값이 바뀌면 판·대륙 배치가 바뀐다)", () => {
  it("고정 점의 값이 비트까지 그대로다", () => {
    // 2026-10-29 기록: 출력 판 2(main 25b7ebc, 기울기 switch) 코드로 구한 값. 기울기 표로 바꾼 뒤에도 같다
    expect(gradientNoise3(12345, 1.25, -3.5, 7.75)).toBe(-0.5500421524047852);
    expect(gradientNoise3(4242, -17.3, 0.61, 3.07)).toBe(0.056652832270022976);
    expect(fbm3(99, 0.31, -0.42, 0.53, 5, 6, 0.52)).toBe(0.23382035757402903);
    expect(ridged3(7, 0.1, 0.2, 0.3, 7, 4, 0.55)).toBe(0.3751226848823546);
  });
});

describe("노이즈 2판 (옥타브마다 옮긴 격자 + 회전 + 좌표 흔들기)", () => {
  it("격자점 근처 RMS 비: 1판 약 0.37, 옮기기만 하면 약 0.55, 흔들기 0.6이면 0.8 이상", {
    timeout: 60_000,
  }, () => {
    const [ox, oy, oz] = noiseOctaveLattice(777, 0);
    const legacy = latticeRmsRatio((x, y, z) => fbm3(777, x, y, z, 1, 6, 0.52));
    const shifted = latticeRmsRatio((x, y, z) => offsetFbm3(777, x, y, z, 1, 6, 0.52), [ox, oy, oz]);
    const jittered = latticeRmsRatio((x, y, z) => offsetFbm3(777, x, y, z, 1, 6, 0.52, 0.6), [ox, oy, oz]);
    expect(legacy).toBeLessThan(0.45);
    // 원점만 옮기면 첫 옥타브의 0점이 옮긴 격자에 남는다(흔들기가 있는 까닭)
    expect(shifted).toBeGreaterThan(0.45);
    expect(shifted).toBeLessThan(0.7);
    expect(jittered).toBeGreaterThanOrEqual(0.8);
  });

  it("두 채널: 채널 A는 같은 인자의 offsetFbm3와 비트까지 같고, 두 채널의 상관은 |r| < 0.02", {
    timeout: 60_000,
  }, () => {
    const out = new Float64Array(2);
    let sumA = 0;
    let sumB = 0;
    let sumAB = 0;
    let sumAA = 0;
    let sumBB = 0;
    const samples = 20_000;
    for (let k = 0; k < samples; k++) {
      // 서로 멀리 떨어진 점(격자 1000칸 상자): 표본끼리 무관하다
      const [x, y, z] = samplePoint(k, 1000);
      offsetFbm3Pair(31, x, y, z, 1, 2, 0.5, k % 2 === 0 ? 0 : 0.6, out);
      const a = out[0] ?? 0;
      const b = out[1] ?? 0;
      expect(a).toBe(offsetFbm3(31, x, y, z, 1, 2, 0.5, k % 2 === 0 ? 0 : 0.6));
      sumA += a;
      sumB += b;
      sumAB += a * b;
      sumAA += a * a;
      sumBB += b * b;
    }
    const meanA = sumA / samples;
    const meanB = sumB / samples;
    const covariance = sumAB / samples - meanA * meanB;
    const correlation =
      covariance / Math.sqrt((sumAA / samples - meanA * meanA) * (sumBB / samples - meanB * meanB));
    expect(Math.abs(correlation)).toBeLessThan(0.02);
    // 두 채널의 세기가 비슷하다
    expect(Math.sqrt(sumBB / sumAA)).toBeGreaterThan(0.9);
    expect(Math.sqrt(sumBB / sumAA)).toBeLessThan(1.1);
  });

  it("옥타브 격자 원점은 옥타브·시드마다 다르고 0 ~ 256 격자 단위다", () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 777]) {
      for (let octave = 0; octave < 8; octave++) {
        const [ox, oy, oz, noiseSeed] = noiseOctaveLattice(seed, octave);
        for (const value of [ox, oy, oz]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(256);
        }
        expect(Number.isInteger(noiseSeed)).toBe(true);
        seen.add(`${ox},${oy},${oz}`);
      }
    }
    expect(seen.size).toBe(24);
  });

  it("능선 노이즈 2판은 0 ~ 1이고, 같은 입력이면 같은 값이다", () => {
    for (let k = 0; k < 2000; k++) {
      const [x, y, z] = samplePoint(k, 50);
      const value = offsetRidged3(5, x, y, z, 1, 4, 0.55, 0.5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(offsetRidged3(5, x, y, z, 1, 4, 0.55, 0.5)).toBe(value);
    }
  });
});
