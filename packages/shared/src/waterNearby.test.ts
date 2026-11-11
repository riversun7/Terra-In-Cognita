// 물가 조건 시험(질문 947 나, docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)") — 물 표·넓힌 네모·돌림·16진수
import { describe, expect, it } from "vitest";
import {
  hasWaterNear,
  isWaterTerrainCell,
  rotatedRect,
  waterMaskFromHex,
  waterMaskFromSurface,
  waterMaskToHex,
} from "./waterNearby.ts";

const SIZE = 16;

/** 지형 칸 16² 땅(풀 1)에 (tx, ty) 칸만 kind */
function surfaceWith(cells: readonly [number, number, number][]): Uint8Array {
  const surface = new Uint8Array(SIZE * SIZE).fill(1);
  for (const [tx, ty, kind] of cells) surface[ty * SIZE + tx] = kind;
  return surface;
}

describe("물 표", () => {
  it("물(0)·얕은 물(10)만 물이다", () => {
    const mask = waterMaskFromSurface(
      surfaceWith([
        [3, 4, 0],
        [5, 4, 10],
        [7, 4, 8],
      ]),
      SIZE,
    );
    expect(isWaterTerrainCell(mask, 3, 4)).toBe(true);
    expect(isWaterTerrainCell(mask, 5, 4)).toBe(true);
    expect(isWaterTerrainCell(mask, 7, 4)).toBe(false);
    expect(isWaterTerrainCell(mask, -1, 4)).toBe(false);
    expect(isWaterTerrainCell(mask, SIZE, 4)).toBe(false);
  });

  it("16진수로 오가도 같고, 길이·글자가 틀리면 undefined", () => {
    const mask = waterMaskFromSurface(surfaceWith([[15, 15, 0]]), SIZE);
    const hex = waterMaskToHex(mask);
    expect(hex).toHaveLength((SIZE * SIZE) / 4);
    expect(waterMaskFromHex(hex, SIZE)).toEqual(mask);
    expect(waterMaskFromHex(hex.slice(2), SIZE)).toBeUndefined();
    expect(waterMaskFromHex(`zz${hex.slice(2)}`, SIZE)).toBeUndefined();
  });
});

describe("건물 칸 둘레 N칸 안에 물", () => {
  // 지형 칸 (10, 5) = 배치 칸 x 20~21, y 10~11
  const mask = waterMaskFromSurface(surfaceWith([[10, 5, 0]]), SIZE);

  it("체비쇼프 거리: 3×3 건물(배치 칸 x 12~14)에서 물(x 20)까지 5칸 = 넓힌 네모 끝 19 → 없음, 6칸이면 있음", () => {
    const rect = { x: 12, y: 10, width: 3, height: 3 };
    expect(hasWaterNear(mask, rect, 5)).toBe(false);
    expect(hasWaterNear(mask, rect, 6)).toBe(true);
    // 바로 붙은 자리(오른쪽 끝 19 → 넓힌 끝 24)
    expect(hasWaterNear(mask, { x: 17, y: 10, width: 3, height: 3 }, 1)).toBe(true);
  });

  it("대각선도 같은 거리로 친다(위아래·옆과 같다)", () => {
    // 건물 오른쪽 아래 끝 (15, 5), 물 칸 (20, 10) — 두 축 모두 5칸
    expect(hasWaterNear(mask, { x: 13, y: 3, width: 3, height: 3 }, 5)).toBe(true);
    expect(hasWaterNear(mask, { x: 13, y: 3, width: 3, height: 3 }, 4)).toBe(false);
  });

  it("2차맵 밖은 자르고, 반경 0 이하는 조건 없음(true)", () => {
    const corner = waterMaskFromSurface(surfaceWith([[0, 0, 10]]), SIZE);
    expect(hasWaterNear(corner, { x: 0, y: 0, width: 3, height: 3 }, 5)).toBe(true);
    expect(hasWaterNear(mask, { x: 0, y: 0, width: 3, height: 3 }, 0)).toBe(true);
    const dry = waterMaskFromSurface(surfaceWith([]), SIZE);
    expect(hasWaterNear(dry, { x: 0, y: 0, width: 3, height: 3 }, 64)).toBe(false);
  });

  it("90·270도 돌리면 가로·세로가 바뀐다(@terra/sim footprintRect와 같다)", () => {
    expect(rotatedRect(4, 6, { width: 4, height: 2 }, 0)).toEqual({ x: 4, y: 6, width: 4, height: 2 });
    expect(rotatedRect(4, 6, { width: 4, height: 2 }, 90)).toEqual({ x: 4, y: 6, width: 2, height: 4 });
    expect(rotatedRect(4, 6, { width: 4, height: 2 }, 180)).toEqual({ x: 4, y: 6, width: 4, height: 2 });
    expect(rotatedRect(4, 6, { width: 4, height: 2 }, 270)).toEqual({ x: 4, y: 6, width: 2, height: 4 });
  });
});
