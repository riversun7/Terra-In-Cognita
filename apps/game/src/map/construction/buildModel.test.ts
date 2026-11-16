import type { BuildingFootprint } from "@terra/engine";
import { describe, expect, it } from "vitest";
import { anchorForTap, nextRotation, placementProblems, rotatedSize } from "./buildModel.ts";

const building = (cellX: number, cellY: number, width: number, depth: number): BuildingFootprint => ({
  id: 1,
  cellX,
  cellY,
  width,
  depth,
  rotation: 0,
  heightM: 3,
});
const base = {
  width: 4,
  depth: 2,
  rotation: 0 as const,
  buildings: [],
  water: "none" as const,
  affordable: true,
  landAllowed: true,
};

describe("건축 모드 자리", () => {
  it("회전은 0 → 90 → 180 → 270 → 0, 90·270이면 가로·세로가 바뀐다", () => {
    expect(nextRotation(0)).toBe(90);
    expect(nextRotation(270)).toBe(0);
    expect(rotatedSize(4, 2, 90)).toEqual({ sx: 2, sy: 4 });
    expect(rotatedSize(4, 2, 180)).toEqual({ sx: 4, sy: 2 });
  });

  it("누른 칸이 건물 가운데가 되게 왼쪽 위 칸을 정한다", () => {
    expect(anchorForTap({ x: 100.7, y: 50.2 }, 4, 2, 0)).toEqual({ x: 98, y: 49 });
    expect(anchorForTap({ x: 100.7, y: 50.2 }, 4, 2, 90)).toEqual({ x: 99, y: 48 });
  });

  it("기기 대략 판정: 안 누름·밖·겹침·물·재료·땅 규칙", () => {
    expect(placementProblems({ ...base, anchor: null })).toEqual(["no_cell"]);
    expect(placementProblems({ ...base, anchor: { x: 10, y: 10 } })).toEqual([]);
    expect(placementProblems({ ...base, anchor: { x: 253, y: 10 } })).toEqual(["out_of_bounds"]);
    expect(placementProblems({ ...base, anchor: { x: -1, y: 10 } })).toEqual(["out_of_bounds"]);
    // 붙어 있으면 겹치지 않고, 한 칸이라도 겹치면 겹침
    expect(
      placementProblems({ ...base, anchor: { x: 14, y: 10 }, buildings: [building(10, 10, 4, 2)] }),
    ).toEqual([]);
    expect(
      placementProblems({ ...base, anchor: { x: 13, y: 11 }, buildings: [building(10, 10, 4, 2)] }),
    ).toEqual(["overlaps_building"]);
    expect(placementProblems({ ...base, anchor: { x: 10, y: 10 }, water: "dry", affordable: false })).toEqual(
      ["needs_water", "insufficient_materials"],
    );
    expect(placementProblems({ ...base, anchor: { x: 10, y: 10 }, landAllowed: false })).toEqual([
      "foreign_city",
    ]);
    expect(placementProblems({ ...base, anchor: { x: 10, y: 10 }, landAllowed: null })).toEqual([]);
  });
});
