import { describe, expect, it } from "vitest";
import {
  BODY_TAP_MARGIN_PX,
  BODY_TAP_MIN_HALF_PX,
  WIDE_TAP_RADIUS_PX,
  pickUnit,
  rayBoxDistance,
  rayHitsTerrain,
} from "./picking.ts";

describe("pickUnit", () => {
  const xs = [10, 50, 52, 200];
  const ys = [10, 50, 50, 200];
  const visible = [1, 1, 1, 1];
  const none = [0, 0, 0, 0];
  const allWide = [1, 1, 1, 1];
  const allBody = [0, 0, 0, 0];

  it("넉넉히(내 유닛): 22px 안에서 가장 가까운 유닛", () => {
    expect(pickUnit(xs, ys, visible, 4, { x: 53, y: 51 }, none, none, allWide)).toBe(2);
    expect(pickUnit(xs, ys, visible, 4, { x: 49, y: 50 }, none, none, allWide)).toBe(1);
    expect(pickUnit(xs, ys, visible, 4, { x: 200, y: 200 + WIDE_TAP_RADIUS_PX }, none, none, allWide)).toBe(
      3,
    );
    expect(pickUnit(xs, ys, visible, 4, { x: 200, y: 201 + WIDE_TAP_RADIUS_PX }, none, none, allWide)).toBe(
      -1,
    );
  });

  it("반경 밖이거나 안 보이는 유닛은 고르지 않는다", () => {
    expect(pickUnit(xs, ys, visible, 4, { x: 120, y: 120 }, none, none, allWide)).toBe(-1);
    expect(pickUnit(xs, ys, [1, 0, 0, 1], 4, { x: 51, y: 50 }, none, none, allWide)).toBe(-1);
    // count 밖은 보지 않는다
    expect(pickUnit(xs, ys, visible, 3, { x: 200, y: 200 }, none, none, allWide)).toBe(-1);
  });

  it("넉넉히: 크게 보이는 유닛은 몸 반 높이만큼 반경을 넓힌다", () => {
    expect(pickUnit(xs, ys, visible, 4, { x: 200, y: 240 }, none, none, allWide)).toBe(-1);
    expect(pickUnit(xs, ys, visible, 4, { x: 200, y: 240 }, none, [0, 0, 0, 30], allWide)).toBe(3);
  });

  it("몸(남의 유닛): 몸 상자 + 6px 안만 — 넉넉한 반경이면 걸렸을 빗나간 누르기는 유닛이 아니다", () => {
    // 최대 확대의 휴먼(412×915 화면, 1m ≈ 10.3px, 기울기 30°): 몸 반 너비 3px·반 높이 8px → 가장 작은 상자(반 14px)
    const halfW = [3, 3, 3, 3];
    const halfH = [8, 8, 8, 8];
    expect(pickUnit(xs, ys, visible, 4, { x: 200, y: 200 }, halfW, halfH, allBody)).toBe(3);
    expect(pickUnit(xs, ys, visible, 4, { x: 214, y: 214 }, halfW, halfH, allBody)).toBe(3);
    // 옆으로 15px, 위로 20px: 옛 반경(22 + 8 = 30px) 안이지만 몸 밖 → 땅
    expect(pickUnit(xs, ys, visible, 4, { x: 215, y: 200 }, halfW, halfH, allBody)).toBe(-1);
    expect(pickUnit(xs, ys, visible, 4, { x: 200, y: 180 }, halfW, halfH, allBody)).toBe(-1);
    expect(pickUnit(xs, ys, visible, 4, { x: 200, y: 180 }, halfW, halfH, allWide)).toBe(3);
  });

  it("몸: 점 표시(몸 크기 0)도 가장 작은 상자(28px 네모)로 받는다", () => {
    expect(BODY_TAP_MIN_HALF_PX).toBe(14);
    expect(pickUnit(xs, ys, visible, 4, { x: 10 + 14, y: 10 - 14 }, none, none, allBody)).toBe(0);
    expect(pickUnit(xs, ys, visible, 4, { x: 10 + 15, y: 10 }, none, none, allBody)).toBe(-1);
  });

  it("몸: 큰 유닛은 보이는 몸(너비·높이가 다르다) + 6px", () => {
    expect(BODY_TAP_MARGIN_PX).toBe(6);
    // 큰 탈것: 반 너비 31px, 반 높이 54px
    const halfW = [0, 0, 0, 31];
    const halfH = [0, 0, 0, 54];
    expect(pickUnit(xs, ys, visible, 4, { x: 200 + 37, y: 200 - 60 }, halfW, halfH, allBody)).toBe(3);
    expect(pickUnit(xs, ys, visible, 4, { x: 200 + 38, y: 200 }, halfW, halfH, allBody)).toBe(-1);
    expect(pickUnit(xs, ys, visible, 4, { x: 200, y: 200 + 61 }, halfW, halfH, allBody)).toBe(-1);
  });

  it("내 유닛과 남의 유닛이 섞이면 규칙에 든 것 가운데 가장 가까운 유닛", () => {
    // 1 = 내 유닛(넉넉히), 2 = 남의 유닛(몸) — 2px 떨어져 서 있다
    const wide = [0, 1, 0, 0];
    // 둘 다 걸리는 곳: 더 가까운 쪽
    expect(pickUnit(xs, ys, visible, 4, { x: 54, y: 50 }, none, none, wide)).toBe(2);
    expect(pickUnit(xs, ys, visible, 4, { x: 48, y: 50 }, none, none, wide)).toBe(1);
    // 남의 유닛 몸 밖(52 + 16)이고 내 유닛 반경 안(50 + 18): 남의 유닛이 더 가까워도 내 유닛
    expect(pickUnit(xs, ys, visible, 4, { x: 68, y: 50 }, none, none, wide)).toBe(1);
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

describe("rayBoxDistance", () => {
  const down = { x: 0, y: -1, z: 0 };

  it("위에서 내려다보면 윗면까지 거리, 안에서는 0, 비껴가거나 뒤쪽이면 null", () => {
    expect(rayBoxDistance({ x: 1, y: 10, z: 1 }, down, 0, 0, 0, 2, 4, 2)).toBeCloseTo(6);
    expect(rayBoxDistance({ x: 1, y: 2, z: 1 }, down, 0, 0, 0, 2, 4, 2)).toBe(0);
    expect(rayBoxDistance({ x: 3, y: 10, z: 1 }, down, 0, 0, 0, 2, 4, 2)).toBeNull();
    expect(rayBoxDistance({ x: 1, y: -1, z: 1 }, down, 0, 0, 0, 2, 4, 2)).toBeNull();
  });

  it("비스듬한 시선은 옆면으로 들어간다", () => {
    const dir = { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 };
    // x = -2, y = 4에서 출발: x = 0 면을 y = 2에서 만난다(거리 2√2)
    expect(rayBoxDistance({ x: -2, y: 4, z: 1 }, dir, 0, 0, 0, 2, 3, 2)).toBeCloseTo(2 * Math.SQRT2);
  });
});
