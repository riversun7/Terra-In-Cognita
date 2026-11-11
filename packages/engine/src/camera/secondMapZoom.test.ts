import { describe, expect, it } from "vitest";
import { CLOSE_VIEW_SPAN_M, cameraLimitsFor, distanceForSpan, spanForDistance } from "./cameraMath.ts";
import {
  LOCAL_ZOOM_STAGES,
  localStageDistance,
  localZoomStage,
  localZoomStepTarget,
} from "./secondMapZoom.ts";

// 휴대폰 세로, 2차맵 한 변 128칸 × 11.7m
const PHONE = { width: 390, height: 844 };
const limits = cameraLimitsFor(128 * 11.7, PHONE);

describe("2차맵 확대 단계", () => {
  it("가장 멀면 1단계, 가장 가까우면 6단계, 대표 거리는 그 단계로 판정되고 한계 안이다", () => {
    expect(localZoomStage(limits.maxDistance, limits)).toBe(1);
    expect(localZoomStage(limits.minDistance, limits)).toBe(LOCAL_ZOOM_STAGES);
    for (let stage = 1; stage <= LOCAL_ZOOM_STAGES; stage++) {
      const distance = localStageDistance(stage, limits);
      expect(localZoomStage(distance, limits)).toBe(stage);
      expect(distance).toBeGreaterThanOrEqual(limits.minDistance);
      expect(distance).toBeLessThanOrEqual(limits.maxDistance);
    }
    // 띠 비율이 같다(로그 눈금): 이웃 대표 거리 비가 같다
    const r23 = localStageDistance(2, limits) / localStageDistance(3, limits);
    const r34 = localStageDistance(3, limits) / localStageDistance(4, limits);
    expect(r23).toBeCloseTo(r34, 9);
  });

  it("[−]를 거듭 누르면 1단계(가장 멀리)를 지나 끝(null), [+]는 6단계를 지나 가장 가까이에서 끝", () => {
    const out: number[] = [];
    let distance = limits.minDistance * 1.75;
    for (let i = 0; i < 10; i++) {
      const next = localZoomStepTarget(distance, -1, limits);
      if (next === null) break;
      distance = next;
      out.push(localZoomStage(distance, limits));
    }
    expect(distance).toBe(limits.maxDistance);
    expect(out.at(-1)).toBe(1);
    expect(out.toSorted((a, b) => b - a)).toEqual(out);
    expect(localZoomStepTarget(limits.maxDistance, -1, limits)).toBeNull();

    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = localZoomStepTarget(distance, 1, limits);
      if (next === null) break;
      distance = next;
      seen.push(localZoomStage(distance, limits));
    }
    expect(distance).toBe(limits.minDistance);
    expect(seen).toEqual([2, 3, 4, 5, 6, 6]);
    expect(localZoomStepTarget(limits.minDistance, 1, limits)).toBeNull();
  });

  it("보기 범위로 가장 멀리가 줄면 단계도 그 한계로 나눈다, 한계가 한 점이면 가장 가까운 단계·양쪽 끝", () => {
    const bounded = { minDistance: limits.minDistance, maxDistance: limits.minDistance * 8 };
    expect(localZoomStage(bounded.maxDistance, bounded)).toBe(1);
    expect(localZoomStage(localStageDistance(3, bounded), bounded)).toBe(3);
    const point = { minDistance: 100, maxDistance: 100 };
    expect(localZoomStage(100, point)).toBe(LOCAL_ZOOM_STAGES);
    expect(localZoomStepTarget(100, 1, point)).toBeNull();
    expect(localZoomStepTarget(100, -1, point)).toBeNull();
  });

  it("여섯 단계, 가장 가까이 = 화면 짧은 변 15m, 옛 가장 가까이(40m)는 5단계 — 플레이어(보기 범위)·운영자 모두(962 나)", () => {
    expect(LOCAL_ZOOM_STAGES).toBe(6);
    expect(spanForDistance(limits.minDistance, PHONE)).toBeCloseTo(CLOSE_VIEW_SPAN_M, 9);
    expect(CLOSE_VIEW_SPAN_M).toBe(15);
    // 플레이어: 내 유닛 원 반지름 40칸(약 234m) → 가장 멀리 = 지름 × 2가 짧은 변(cameraArea·엔진 computeLimits와 같은 식)
    const player = { minDistance: limits.minDistance, maxDistance: distanceForSpan(40 * 5.85 * 4, PHONE) };
    for (const range of [limits, player]) {
      expect(localZoomStage(distanceForSpan(40, PHONE), range)).toBe(5);
      expect(localZoomStage(distanceForSpan(CLOSE_VIEW_SPAN_M, PHONE), range)).toBe(6);
    }
    // 휴대폰 가장 가까이(들어올 때)에서 키 1.8m는 약 47px(옛 가장 가까이 약 18px)
    const ppm = PHONE.width / spanForDistance(limits.minDistance, PHONE);
    expect(1.8 * ppm).toBeCloseTo(46.8, 6);
  });
});
