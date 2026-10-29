// 레벨별 메모리 추정표 시험 — 생성기 면 레벨 범위를 모두 덮고, 레벨이 오르면 커진다(범위가 바뀌면 다시 재라는 신호)
import { PLANET_GENERATOR_FACE_LEVELS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { MEMORY_ESTIMATES, memoryEstimate } from "./memoryEstimate.ts";

describe("메모리 추정표", () => {
  it("생성기 면 레벨 범위를 모두 덮고 레벨마다 커진다", () => {
    const [lowest, highest] = PLANET_GENERATOR_FACE_LEVELS;
    const levels = MEMORY_ESTIMATES.map((estimate) => estimate.level);
    const expected: number[] = [];
    for (let level = lowest; level <= highest; level++) expected.push(level);
    expect(levels).toEqual(expected);
    MEMORY_ESTIMATES.forEach((estimate, index) => {
      expect(estimate.keptBytes).toBeGreaterThan(0);
      expect(estimate.workerPeakBytes).toBeGreaterThan(estimate.keptBytes);
      const previous = MEMORY_ESTIMATES[index - 1];
      if (previous) {
        expect(estimate.keptBytes).toBeGreaterThan(previous.keptBytes);
        expect(estimate.workerPeakBytes).toBeGreaterThan(previous.workerPeakBytes);
      }
    });
  });

  it("표에 없는 레벨은 null", () => {
    expect(memoryEstimate(PLANET_GENERATOR_FACE_LEVELS[1] + 1)).toBeNull();
    expect(memoryEstimate(7)?.level).toBe(7);
  });
});
