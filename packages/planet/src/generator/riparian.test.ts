// 강가·호숫가 띠 몫 시험: 칸이 띠보다 크든 작든 띠 면적이 같다(해상도와 무관한 습도 가산)
import { describe, expect, it } from "vitest";
import { RIPARIAN_REACH, lakeShare, riverShare } from "./riparian.ts";

// 칸 폭 ÷ 닿는 거리: 띠보다 훨씬 작은 칸(F10 이상)부터 훨씬 큰 칸(F5)까지
const RATIOS = [0.1, 0.37, 0.5, 1, 1.5, 2, 3.3, 6, 12, 24];

describe("강가·호숫가 띠 몫", () => {
  it("곧은 강을 가로지르는 칸 줄: 몫 × 칸 폭의 합 = 띠 폭(닿는 거리 × 2)", () => {
    for (const ratio of RATIOS) {
      const size = RIPARIAN_REACH * ratio;
      let width = 0;
      for (let k = -60; k <= 60; k++) width += riverShare(Math.abs(k) * size, size) * size;
      expect(width / RIPARIAN_REACH, `칸 폭 ${ratio}`).toBeCloseTo(2, 9);
    }
  });

  it("호숫가에서 바깥으로 나가는 칸 줄: 몫 × 칸 폭의 합 = 닿는 거리", () => {
    for (const ratio of RATIOS) {
      const size = RIPARIAN_REACH * ratio;
      let width = 0;
      for (let k = 1; k <= 120; k++) width += lakeShare(k * size, size) * size;
      expect(width / RIPARIAN_REACH, `칸 폭 ${ratio}`).toBeCloseTo(1, 9);
    }
  });

  it("몫은 0~1이고 물에서 멀어질수록 줄며, 띠 밖은 0이다", () => {
    for (const ratio of RATIOS) {
      const size = RIPARIAN_REACH * ratio;
      let previousRiver = 1;
      let previousLake = 1;
      for (let step = 0; step <= 40; step++) {
        const distance = (step * size) / 4;
        const river = riverShare(distance, size);
        const lake = lakeShare(Math.max(distance, size), size);
        for (const value of [river, lake]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        // 반올림 때문에 마지막 자리가 오르내릴 수 있다(1ulp)
        expect(river).toBeLessThanOrEqual(previousRiver + 1e-12);
        expect(lake).toBeLessThanOrEqual(previousLake + 1e-12);
        previousRiver = river;
        previousLake = lake;
      }
      // 띠 끝에 닿은 칸은 (반올림 오차 안에서) 0, 그보다 먼 칸은 정확히 0
      expect(riverShare(RIPARIAN_REACH + size / 2, size)).toBeCloseTo(0, 12);
      expect(lakeShare(RIPARIAN_REACH + size, size)).toBeCloseTo(0, 12);
      expect(riverShare(RIPARIAN_REACH + size, size)).toBe(0);
      expect(lakeShare(RIPARIAN_REACH + 1.5 * size, size)).toBe(0);
    }
    // 강 칸 자신: 칸이 띠보다 넓으면 띠 폭 ÷ 칸 폭, 좁으면 칸 전체
    expect(riverShare(0, RIPARIAN_REACH * 8)).toBeCloseTo(0.25, 12);
    expect(riverShare(0, RIPARIAN_REACH)).toBe(1);
  });
});
