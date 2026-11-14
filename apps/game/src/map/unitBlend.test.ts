import type { NeighbourPlacement, UnitPath } from "@terra/engine";
import { describe, expect, it } from "vitest";
import {
  BLEND_MAX_SPEEDUP,
  blendPath,
  directionThroughPlacement,
  pathEnd,
  pathThroughPlacement,
  pointThroughPlacement,
} from "./unitBlend.ts";

/** 동쪽 이웃(돌림 없음): 이웃 칸 → 지금 칸 = +128 지형 칸(= 배치 칸 256) */
const EAST: NeighbourPlacement = { a: 1, b: 0, cc: 0, d: 1, tx: 128, tz: 0 };
/** 90° 돌아간 이웃 */
const TURNED: NeighbourPlacement = { a: 0, b: -1, cc: 1, d: 0, tx: 256, tz: 0 };

const path = (points: number[], departAtMs = 0, speedCellsPerSec = 1): UnitPath => ({
  points,
  departAtMs,
  speedCellsPerSec,
});

describe("틀 옮기기", () => {
  it("점·방향·경로를 놓는 자리로 옮긴다(배치 칸)", () => {
    expect(pointThroughPlacement({ x: 0.5, y: 100 }, EAST)).toEqual({ x: 256.5, y: 100 });
    expect(pointThroughPlacement({ x: 10, y: 0 }, TURNED)).toEqual({ x: 512, y: 10 });
    expect(directionThroughPlacement({ x: 1, y: 0 }, TURNED)).toEqual({ x: 0, y: 1 });
    const moved = pathThroughPlacement(path([0.5, 100, 20.5, 100], 7, 3), EAST);
    expect(Array.from(moved.points)).toEqual([256.5, 100, 276.5, 100]);
    expect(moved.departAtMs).toBe(7);
    expect(moved.speedCellsPerSec).toBe(3);
  });

  it("경로 끝", () => {
    expect(pathEnd(path([1, 2, 3, 4]))).toEqual({ x: 3, y: 4 });
    expect(pathEnd(path([]))).toBeNull();
  });
});

describe("blendPath", () => {
  it("서 있는 유닛: 보이던 자리에서 그 자리까지 제 속도로 걷는다", () => {
    const blended = blendPath({ x: 255.5, y: 100 }, path([256.5, 100], 1_000, 0.5), 1_000);
    expect(Array.from(blended.points)).toEqual([255.5, 100, 256.5, 100]);
    expect(blended.departAtMs).toBe(1_000);
    expect(blended.speedCellsPerSec).toBe(0.5);
  });

  it("걷는 유닛: 서버의 지금 자리로 간 뒤 남은 경로를 따르고 도착 시각에 맞게 빨라진다", () => {
    // 2초 전에 출발해 1칸/초 → 지금 (2, 0). 남은 길이 8 + 10 = 18, 보이던 자리와 1칸 차이
    const blended = blendPath({ x: 2, y: 1 }, path([0, 0, 10, 0, 10, 10], 0, 1), 2_000);
    expect(Array.from(blended.points)).toEqual([2, 1, 2, 0, 10, 0, 10, 10]);
    expect(blended.departAtMs).toBe(2_000);
    expect(blended.speedCellsPerSec).toBeCloseTo(19 / 18, 6);
    // 도착 시각 = 2초 + 19 ÷ (19/18) = 20초 = 서버 도착(총 길이 20 ÷ 1)
    expect(2 + 19 / blended.speedCellsPerSec).toBeCloseTo(20, 6);
  });

  it("남은 길이가 짧으면 빨라지는 것은 상한까지", () => {
    const blended = blendPath({ x: 0, y: 2 }, path([0, 0, 0.5, 0], 0, 1), 0);
    expect(blended.speedCellsPerSec).toBe(BLEND_MAX_SPEEDUP);
  });

  it("거의 같은 자리·너무 먼 자리·속도 0이면 그대로", () => {
    const original = path([5, 5, 9, 5], 0, 1);
    expect(blendPath({ x: 5, y: 5.001 }, original, 0)).toBe(original);
    expect(blendPath({ x: 50, y: 5 }, original, 0)).toBe(original);
    const still = path([5, 5], 0, 0);
    expect(blendPath({ x: 5.5, y: 5 }, still, 0)).toBe(still);
  });

  it("이미 다 간 경로: 도착점까지 제 속도로", () => {
    const blended = blendPath({ x: 9, y: 6 }, path([5, 5, 9, 5], 0, 1), 60_000);
    expect(Array.from(blended.points)).toEqual([9, 6, 9, 5]);
    expect(blended.speedCellsPerSec).toBe(1);
  });

  it("구간 걸음 배율(프로토콜 29): 지금 자리를 배율로 찾고 남은 구간 배율을 이어, 서버 도착 시각에 닿는다", () => {
    // (0,0)→(10,0) 1000, (10,0)→(10,10) 2000. 1칸/초 → 첫 구간 10초, 둘째 20초, 도착 30초
    const paced: UnitPath = { ...path([0, 0, 10, 0, 10, 10], 0, 1), paces: [1000, 2000] };
    // 14초: 둘째 구간 4초 ÷ 20초 = 0.2 → (10, 2)
    const blended = blendPath({ x: 9, y: 2 }, paced, 14_000);
    expect(Array.from(blended.points)).toEqual([9, 2, 10, 2, 10, 10]);
    expect(Array.from(blended.paces ?? [])).toEqual([1000, 2000]);
    // 남은 시간 거리 = 8칸 × 2 = 16, 틈 1칸 → 빨라짐 17 ÷ 16
    expect(blended.speedCellsPerSec).toBeCloseTo(17 / 16, 9);
    // 서버 도착(30초)에 닿는다
    const remainingMs = ((1 + 16) / blended.speedCellsPerSec) * 1000;
    expect(14_000 + remainingMs).toBeCloseTo(30_000, 3);
  });
});
