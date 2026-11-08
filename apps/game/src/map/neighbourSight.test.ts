// 경계 너머 시야(docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜")
import { describe, expect, it } from "vitest";
import { neighbourSightBits, unionBits } from "./neighbourSight.ts";

const EAST = { a: 1, b: 0, cc: 0, d: 1, tx: 128, tz: 0 };
const bit = (bits: Uint8Array | null, x: number, y: number): boolean => {
  const index = y * 32 + x;
  return ((bits?.[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
};

describe("경계 너머 시야", () => {
  it("동쪽 변 가까이 선 유닛은 동쪽 이웃의 서쪽 칸 몇 줄을 덮는다", () => {
    // 지금 틀 (250, 128) → 이웃 (−6, 128) → 시야 칸 (−1, 16), 반지름 3
    const bits = neighbourSightBits(EAST, [{ x: 250, y: 128 }]);
    expect(bit(bits, 0, 16)).toBe(true);
    expect(bit(bits, 2, 16)).toBe(true);
    expect(bit(bits, 3, 16)).toBe(false);
    expect(bit(bits, 0, 13)).toBe(true);
    expect(bit(bits, 0, 12)).toBe(false);
  });

  it("변에서 먼 유닛은 이웃을 덮지 않는다", () => {
    expect(neighbourSightBits(EAST, [{ x: 100, y: 128 }])).toBeNull();
  });

  it("합", () => {
    const left = new Uint8Array(128);
    left[0] = 1;
    const right = new Uint8Array(128);
    right[0] = 2;
    expect(unionBits(left, right)?.[0]).toBe(3);
    expect(unionBits(null, right)).toBe(right);
    expect(unionBits(null, null)).toBeNull();
  });
});
