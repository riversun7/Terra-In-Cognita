import { describe, expect, it } from "vitest";
import { STAR_COUNT, starArrays, starRandom } from "./starfield.ts";

describe("우주 배경 별", () => {
  it("방향은 단위 벡터, 크기·색은 범위 안, 같은 시드면 같은 하늘", () => {
    const stars = starArrays();
    expect(stars.directions).toHaveLength(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = stars.directions[i * 3] ?? 0;
      const y = stars.directions[i * 3 + 1] ?? 0;
      const z = stars.directions[i * 3 + 2] ?? 0;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      expect(stars.sizes[i]).toBeGreaterThanOrEqual(1);
      expect(stars.sizes[i]).toBeLessThanOrEqual(2.6 + 1e-6);
      for (let c = 0; c < 3; c++) {
        const value = stars.colors[i * 3 + c] ?? -1;
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
    expect(starArrays().directions).toEqual(stars.directions);
  });

  it("하늘 전체에 고르게 퍼진다(위·아래 반구가 비슷하다)", () => {
    const stars = starArrays();
    let north = 0;
    for (let i = 0; i < STAR_COUNT; i++) if ((stars.directions[i * 3 + 2] ?? 0) > 0) north += 1;
    expect(north / STAR_COUNT).toBeGreaterThan(0.44);
    expect(north / STAR_COUNT).toBeLessThan(0.56);
  });

  it("시드 난수는 0 이상 1 미만이고 시드마다 다르다", () => {
    const a = starRandom(1);
    const b = starRandom(2);
    const first = a();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(b()).not.toBe(first);
  });
});
