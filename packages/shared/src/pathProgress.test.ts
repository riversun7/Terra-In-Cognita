import { describe, expect, it } from "vitest";
import { pathProgress } from "./pathProgress.ts";

describe("경로 진행 보간(구간 빠르기)", () => {
  const path = { points: [0, 0, 10, 0, 10, 10], departAtMs: 1000, speedCellsPerSec: 2 };

  it("배율이 없으면 길이 ÷ 속도로 간다", () => {
    expect(pathProgress(path, 3500)).toMatchObject({ segment: 0, x: 5, y: 0, travelled: 5, done: false });
    expect(pathProgress(path, 500)).toMatchObject({ x: 0, y: 0, travelled: 0 });
    expect(pathProgress(path, 20_000)).toMatchObject({ x: 10, y: 10, travelled: 20, total: 20, done: true });
  });

  it("배율 1800인 구간은 1.8배 걸리고, 간 길이는 실제 길이다", () => {
    const paced = { ...path, paces: [1000, 1800] };
    // 첫 구간 5초, 둘째 9초 → 1초 + 5초 + 4.5초 = 10.5초에 둘째 구간 절반
    const half = pathProgress(paced, 10_500);
    expect(half.segment).toBe(1);
    expect(half.x).toBeCloseTo(10, 9);
    expect(half.y).toBeCloseTo(5, 9);
    expect(half.travelled).toBeCloseTo(15, 9);
    expect(pathProgress(paced, 14_999).done).toBe(false);
    expect(pathProgress(paced, 15_000).done).toBe(true);
  });

  it("점 하나·속도 0이면 서 있다", () => {
    expect(pathProgress({ ...path, points: [3, 4] }, 9_000)).toMatchObject({ x: 3, y: 4, done: true });
    expect(pathProgress({ ...path, speedCellsPerSec: 0 }, 9_000)).toMatchObject({ x: 0, y: 0, done: true });
  });
});
