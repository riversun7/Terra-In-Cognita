// 움직이는 어군 자리 시험(기획 D-536) — 길 따라 결정적으로 움직이고, 한 바퀴 뒤 같은 자리, 점 하나면 제자리
import { describe, expect, it } from "vitest";
import {
  SCHOOL_POSITION_SCALE,
  schoolCell,
  schoolPeriodMs,
  schoolPosition,
  schoolRouteLength,
  schoolSegmentLength,
} from "./fishSchool.ts";

describe("어군 자리", () => {
  it("구간 길이는 8방향 거리(곧은 1000, 대각 1414)", () => {
    expect(schoolSegmentLength(3, 0)).toBe(3000);
    expect(schoolSegmentLength(-2, 2)).toBe(2828);
    expect(schoolSegmentLength(4, -1)).toBe(3000 + 1414);
    expect(schoolRouteLength([0, 0, 10, 0])).toBe(20_000);
  });

  it("한 바퀴 시간 = 길이 × 60 ÷ 빠르기, 길 위를 차례로 지나 한 바퀴 뒤 제자리", () => {
    const points = [10, 10, 20, 10, 20, 20];
    const length = schoolRouteLength(points);
    const periodMs = schoolPeriodMs(length, 30);
    expect(periodMs).toBe(Math.ceil((length * 60) / 30));
    const route = { points, periodMs, phaseMs: 0 };
    expect(schoolPosition(route, 0)).toEqual({
      x: 10 * SCHOOL_POSITION_SCALE,
      y: 10 * SCHOOL_POSITION_SCALE,
    });
    // 첫 구간(10칸 = 10,000)의 절반
    const half = Math.floor((5000 * periodMs) / length);
    expect(schoolCell(route, half + 1).y).toBe(10);
    expect(schoolCell(route, half + 1).x).toBe(15);
    expect(schoolPosition(route, periodMs * 3 + 1234)).toEqual(schoolPosition(route, 1234));
    // 음수 시각도 같은 바퀴
    expect(schoolPosition(route, -periodMs + 77)).toEqual(schoolPosition(route, 77));
    // 어긋남: phase만큼 앞선 자리
    expect(schoolPosition({ ...route, phaseMs: 500 }, 0)).toEqual(schoolPosition(route, 500));
  });

  it("점 하나·길이 0이면 제자리, 큰 시각에서도 정수 자리", () => {
    expect(schoolPosition({ points: [3, 4], periodMs: 1, phaseMs: 0 }, 1e12)).toEqual({ x: 768, y: 1024 });
    const route = {
      points: [0, 0, 255, 255],
      periodMs: schoolPeriodMs(schoolRouteLength([0, 0, 255, 255]), 7),
      phaseMs: 0,
    };
    const at = schoolPosition(route, 1_763_000_000_123);
    expect(Number.isInteger(at.x) && Number.isInteger(at.y)).toBe(true);
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.x).toBeLessThanOrEqual(255 * SCHOOL_POSITION_SCALE);
  });
});
