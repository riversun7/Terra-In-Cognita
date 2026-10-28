import { describe, expect, it } from "vitest";
import { LONG_FRAME_MS, summarizeFrames } from "./frameStats.ts";

describe("프레임 요약", () => {
  it("빈 구간은 모두 0", () => {
    expect(summarizeFrames([])).toEqual({
      frames: 0,
      elapsedMs: 0,
      fps: 0,
      p50Ms: 0,
      p95Ms: 0,
      maxMs: 0,
      longFrames: 0,
    });
  });

  it("고른 60fps", () => {
    const summary = summarizeFrames(Array.from({ length: 60 }, () => 1000 / 60));
    expect(summary.fps).toBeCloseTo(60, 5);
    expect(summary.p95Ms).toBeCloseTo(16.67, 2);
    expect(summary.longFrames).toBe(0);
  });

  it("p95와 끊김 수: 100프레임 중 5개만 느리면 p95는 빠른 쪽, 6개면 느린 쪽", () => {
    const fast = Array.from({ length: 95 }, () => 16);
    expect(summarizeFrames([...fast, 60, 70, 80, 90, 100]).p95Ms).toBe(16);
    const six = summarizeFrames([...Array.from({ length: 94 }, () => 16), 60, 70, 80, 90, 100, 110]);
    expect(six.p95Ms).toBe(60);
    expect(six.longFrames).toBe(6);
    expect(six.maxMs).toBe(110);
  });

  it("정렬은 문자열 순서가 아니라 숫자 순서 (9 < 10)", () => {
    expect(summarizeFrames([10, 9]).p50Ms).toBe(9);
  });

  it(`정확히 ${LONG_FRAME_MS}ms는 끊김이 아니다`, () => {
    expect(summarizeFrames([LONG_FRAME_MS]).longFrames).toBe(0);
  });
});
