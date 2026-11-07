import { averageCellEdgeMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import { type Viewport, globeLimits } from "./globeCamera.ts";
import { EARTH_RADIUS_M } from "./testSupport.ts";
import {
  atFarEdge,
  atNearEdge,
  stageDistance,
  zoomStageOf,
  zoomStages,
  zoomStepTarget,
} from "./zoomStages.ts";

const R = EARTH_RADIUS_M;
const PHONE: Viewport = { width: 390, height: 844 };
const limits = globeLimits(R, averageCellEdgeMeters(9, R), PHONE);
const stages = zoomStages(limits);

describe("1차맵 확대 단계", () => {
  it("거리 한계를 로그 눈금으로 다섯 등분한다(멀수록 경계가 크다, 띠 비율이 같다)", () => {
    expect(stages.below).toHaveLength(4);
    const ratio = (limits.maxDistance / limits.minDistance) ** (1 / 5);
    expect(limits.maxDistance / (stages.below[0] ?? 1)).toBeCloseTo(ratio, 9);
    for (let i = 1; i < stages.below.length; i++) {
      expect((stages.below[i - 1] ?? 0) / (stages.below[i] ?? 1)).toBeCloseTo(ratio, 9);
    }
    expect((stages.below[3] ?? 0) / limits.minDistance).toBeCloseTo(ratio, 9);
  });

  it("가장 멀면 1단계, 가장 가까우면 5단계, 대표 거리는 그 단계로 판정된다", () => {
    expect(zoomStageOf(limits.maxDistance, stages)).toBe(1);
    expect(zoomStageOf(limits.minDistance, stages)).toBe(5);
    for (let stage = 1; stage <= 5; stage++) {
      const distance = stageDistance(stage, stages);
      expect(zoomStageOf(distance, stages)).toBe(stage);
      expect(distance).toBeGreaterThanOrEqual(limits.minDistance);
      expect(distance).toBeLessThanOrEqual(limits.maxDistance);
    }
    expect(stageDistance(1, stages)).toBe(limits.maxDistance);
    expect(stageDistance(0, stages)).toBe(limits.maxDistance);
    expect(stageDistance(9, stages)).toBe(stageDistance(5, stages));
  });

  it("[+]는 다음 단계, 5단계에서는 가장 가까이까지, 거기서 한 번 더면 끝(null)", () => {
    let distance = limits.maxDistance;
    const seen: number[] = [zoomStageOf(distance, stages)];
    for (let i = 0; i < 10; i++) {
      const next = zoomStepTarget(distance, 1, stages);
      if (next === null) break;
      expect(next).toBeLessThan(distance);
      distance = next;
      seen.push(zoomStageOf(distance, stages));
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 5]);
    expect(atNearEdge(distance, stages)).toBe(true);
    expect(zoomStepTarget(distance, 1, stages)).toBeNull();
  });

  it("[−]는 앞 단계, 1단계는 가장 멀리, 거기서 한 번 더면 끝(null)", () => {
    let distance = limits.minDistance;
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = zoomStepTarget(distance, -1, stages);
      if (next === null) break;
      expect(next).toBeGreaterThan(distance);
      distance = next;
      seen.push(zoomStageOf(distance, stages));
    }
    expect(seen).toEqual([4, 3, 2, 1]);
    expect(atFarEdge(distance, stages)).toBe(true);
    expect(zoomStepTarget(distance, -1, stages)).toBeNull();
  });

  it("1단계 중간이면 [−]는 가장 멀리, 5단계 중간이면 [+]는 가장 가까이", () => {
    const middleFirst = Math.sqrt(limits.maxDistance * (stages.below[0] ?? 1));
    expect(zoomStepTarget(middleFirst, -1, stages)).toBe(limits.maxDistance);
    const middleLast = stageDistance(5, stages);
    expect(zoomStepTarget(middleLast, 1, stages)).toBe(limits.minDistance);
  });
});
