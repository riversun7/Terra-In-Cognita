import { describe, expect, it } from "vitest";
import { pickNearest, rayHitsTerrain } from "./picking.ts";

describe("pickNearest", () => {
  const xs = [10, 50, 52, 200];
  const ys = [10, 50, 50, 200];
  const visible = [1, 1, 1, 1];

  it("반경 안에서 가장 가까운 점", () => {
    expect(pickNearest(xs, ys, visible, 4, { x: 53, y: 51 }, 22)).toBe(2);
    expect(pickNearest(xs, ys, visible, 4, { x: 49, y: 50 }, 22)).toBe(1);
  });

  it("반경 밖이거나 안 보이는 점은 고르지 않는다", () => {
    expect(pickNearest(xs, ys, visible, 4, { x: 120, y: 120 }, 22)).toBe(-1);
    expect(pickNearest(xs, ys, [1, 0, 0, 1], 4, { x: 51, y: 50 }, 22)).toBe(-1);
    // count 밖은 보지 않는다
    expect(pickNearest(xs, ys, visible, 3, { x: 200, y: 200 }, 22)).toBe(-1);
  });

  it("크게 보이는 유닛은 반경을 더 넓힌다", () => {
    expect(pickNearest(xs, ys, visible, 4, { x: 200, y: 240 }, 22)).toBe(-1);
    expect(pickNearest(xs, ys, visible, 4, { x: 200, y: 240 }, 22, [0, 0, 0, 30])).toBe(3);
  });
});

/** x ≥ 50은 높이 60m인 언덕 */
const hillAt = (x: number): number => (x >= 50 ? 60 : 0);

describe("rayHitsTerrain", () => {
  it("평평한 땅(5m)에 45°로 닿는 점", () => {
    const hit = rayHitsTerrain({ x: 0, y: 100, z: 0 }, { x: 1, y: -1, z: 0 }, () => 5, 5, 5, 2);
    expect(hit?.x).toBeCloseTo(95, 3);
    expect(hit?.y).toBeCloseTo(5, 3);
    expect(hit?.z).toBeCloseTo(0, 6);
  });

  it("언덕 옆면에 먼저 닿는다", () => {
    // x ≥ 50은 높이 60m인 언덕 — 시선(y = 100 − x)은 x = 50에서 y = 50이라 옆면에 닿는다
    const hit = rayHitsTerrain({ x: 0, y: 100, z: 0 }, { x: 1, y: -1, z: 0 }, hillAt, 0, 60, 1);
    expect(hit?.x).toBeCloseTo(50, 1);
    expect(hit?.y).toBeCloseTo(50, 1);
    // 언덕이 40m면 옆면 위로 지나 꼭대기(x = 60)에 닿는다
    const low = rayHitsTerrain(
      { x: 0, y: 100, z: 0 },
      { x: 1, y: -1, z: 0 },
      (x) => (x >= 50 ? 40 : 0),
      0,
      40,
      1,
    );
    expect(low?.x).toBeCloseTo(60, 1);
  });

  it("위로 가는 시선, 땅 범위를 지나간 시선은 null", () => {
    expect(rayHitsTerrain({ x: 0, y: 10, z: 0 }, { x: 1, y: 0.1, z: 0 }, () => 0, 0, 0, 1)).toBeNull();
    expect(rayHitsTerrain({ x: 0, y: -10, z: 0 }, { x: 0, y: -1, z: 0 }, () => 0, 0, 0, 1)).toBeNull();
  });
});
