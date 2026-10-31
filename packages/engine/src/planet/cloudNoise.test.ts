import { describe, expect, it } from "vitest";
import {
  CLOUD_NOISE_SIZE,
  WEATHER_WINDOW_MS,
  cloudNoiseLattice,
  skySeedOfHash,
  weatherOffset,
  weatherWindowIndex,
} from "./cloudNoise.ts";

describe("구름 노이즈 격자", () => {
  it("같은 시드면 같은 값, 다른 시드면 다른 값(모든 기기에서 같은 구름)", () => {
    const a = cloudNoiseLattice(1234);
    expect(a).toHaveLength(CLOUD_NOISE_SIZE ** 3);
    expect(cloudNoiseLattice(1234)).toEqual(a);
    const b = cloudNoiseLattice(1235);
    let same = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same += 1;
    // 무관한 두 수열이면 1/256 안팎만 같다
    expect(same / a.length).toBeLessThan(0.01);
  });

  it("고르게 퍼진다: 평균 약 127.5, 표준편차 약 73.9(0~255 고른 분포)", () => {
    const data = cloudNoiseLattice(20_261_029);
    let sum = 0;
    let squares = 0;
    for (const value of data) {
      sum += value;
      squares += value * value;
    }
    const mean = sum / data.length;
    const sd = Math.sqrt(squares / data.length - mean * mean);
    expect(mean).toBeGreaterThan(126.5);
    expect(mean).toBeLessThan(128.5);
    expect(sd).toBeGreaterThan(73);
    expect(sd).toBeLessThan(75);
  });
});

describe("날씨 창", () => {
  it("창 번호는 3시간마다 하나씩, 경계에서 바뀌고 기원 앞은 음수(내림)", () => {
    expect(weatherWindowIndex(0)).toBe(0);
    expect(weatherWindowIndex(WEATHER_WINDOW_MS - 1)).toBe(0);
    expect(weatherWindowIndex(WEATHER_WINDOW_MS)).toBe(1);
    expect(weatherWindowIndex(-1)).toBe(-1);
    expect(weatherWindowIndex(-WEATHER_WINDOW_MS)).toBe(-1);
    expect(weatherWindowIndex(-WEATHER_WINDOW_MS - 1)).toBe(-2);
    // 2300년(기원 뒤 약 8.6e12ms)도 정확하다(64비트 JS 수)
    expect(weatherWindowIndex(8_622_979_200_000)).toBe(798_424);
  });

  it("오프셋: 같은 시드·창이면 같고, 창이 바뀌면 바뀌고, 각 축 0 이상 격자 한 변 미만", () => {
    const a = weatherOffset(99, 5);
    expect(weatherOffset(99, 5)).toEqual(a);
    expect(weatherOffset(99, 6)).not.toEqual(a);
    expect(weatherOffset(100, 5)).not.toEqual(a);
    for (let window = -50; window < 50; window++) {
      for (const value of weatherOffset(7, window)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(CLOUD_NOISE_SIZE);
      }
    }
  });
});

describe("구름 시드", () => {
  it("정의 해시 앞 8자리(16진수) → u32, 틀리면 0", () => {
    expect(skySeedOfHash(`deadbeef${"0".repeat(56)}`)).toBe(0xdeadbeef);
    expect(skySeedOfHash(`00000001${"f".repeat(56)}`)).toBe(1);
    expect(skySeedOfHash("xyz")).toBe(0);
    expect(skySeedOfHash("")).toBe(0);
  });
});
