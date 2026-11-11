import { describe, expect, it } from "vitest";
import {
  type BuildingFootprint,
  footprintCells,
  footprintInside,
  footprintMask,
  footprintOutsideCells,
  footprintRect,
  frontDirection,
  outsideCellKey,
} from "./footprint.ts";

const base: BuildingFootprint = { id: 1, cellX: 10, cellY: 20, width: 4, depth: 2, rotation: 0, heightM: 6 };

describe("footprint", () => {
  it("회전 0·2는 가로 × 세로, 1·3은 바뀐다. 기준 칸은 늘 왼쪽 위", () => {
    expect(footprintRect(base)).toEqual({ x0: 10, y0: 20, x1: 14, y1: 22 });
    expect(footprintRect({ ...base, rotation: 2 })).toEqual({ x0: 10, y0: 20, x1: 14, y1: 22 });
    expect(footprintRect({ ...base, rotation: 1 })).toEqual({ x0: 10, y0: 20, x1: 12, y1: 24 });
    expect(footprintRect({ ...base, rotation: 3 })).toEqual({ x0: 10, y0: 20, x1: 12, y1: 24 });
  });

  it("차지한 칸 번호(행 × 크기 + 열), 2차맵 밖은 뺀다", () => {
    const cells = footprintCells({ ...base, cellX: 0, cellY: 0, width: 2, depth: 2 }, 256);
    expect(cells).toEqual([0, 1, 256, 257]);
    expect(footprintCells({ ...base, cellX: 254 }, 256)).toHaveLength(2 * 2);
    expect(footprintCells({ ...base, rotation: 1 }, 256)).toHaveLength(8);
  });

  it("2차맵 안에 다 들어가는지", () => {
    expect(footprintInside(base, 256)).toBe(true);
    expect(footprintInside({ ...base, cellX: 253 }, 256)).toBe(false);
    expect(footprintInside({ ...base, cellX: -1 }, 256)).toBe(false);
    expect(footprintInside({ ...base, width: 0 }, 256)).toBe(false);
  });

  it("앞면 방향: 0 남, 1 서, 2 북, 3 동(시계 방향)", () => {
    expect(frontDirection(0)).toEqual({ x: 0, y: 1 });
    expect(frontDirection(1)).toEqual({ x: -1, y: 0 });
    expect(frontDirection(2)).toEqual({ x: 0, y: -1 });
    expect(frontDirection(3)).toEqual({ x: 1, y: 0 });
  });

  it("차지한 칸 표: 건물 칸만 1, 밖은 뺀다", () => {
    const mask = footprintMask([base, { ...base, id: 2, cellX: 254, cellY: 0, width: 4, depth: 1 }], 256);
    expect(mask.reduce((sum, value) => sum + value, 0)).toBe(4 * 2 + 2);
    expect(mask[20 * 256 + 10]).toBe(1);
    expect(mask[22 * 256 + 10]).toBe(0);
    expect(mask[255]).toBe(1);
  });

  it("2차맵 밖 칸(옆 2차맵 건물): 밖에 걸친 칸만 모으고, 안에만 있으면 null", () => {
    expect(footprintOutsideCells([base], 256)).toBeNull();
    // 오른쪽 변에 걸친 건물(254~257, 가로 4): 밖은 256·257 두 칸, 옆 2차맵 건물(266~269 × 20~21)은 모두 밖
    const cells = footprintOutsideCells(
      [
        { ...base, id: 2, cellX: 254, cellY: 0, width: 4, depth: 1 },
        { ...base, id: 3, cellX: 266 },
        { ...base, id: 4, cellX: -3, cellY: -2, width: 1, depth: 1 },
      ],
      256,
    );
    expect(cells?.size).toBe(2 + 8 + 1);
    expect(cells?.has(outsideCellKey(256, 0))).toBe(true);
    expect(cells?.has(outsideCellKey(255, 0))).toBe(false);
    expect(cells?.has(outsideCellKey(269, 21))).toBe(true);
    expect(cells?.has(outsideCellKey(-3, -2))).toBe(true);
  });
});
