import { describe, expect, it } from "vitest";
import {
  EARTH_FACE_LEVEL,
  MAX_FACE_LEVEL,
  MAX_LEVEL,
  MIN_FACE_LEVEL,
  PLACEMENT_CELLS_PER_SIDE,
  PRIMARY_MAP_LEVEL_COUNT,
  TERRAIN_CELLS_PER_SIDE,
  cellsPerSide,
  planetLevels,
} from "./levels.ts";

describe("행성 레벨 (ADR 격자 표)", () => {
  it("지구 기본: 면 레벨 9, 1차맵 5단계(면당 32 → 512칸), 지형 레벨 16, 배치 레벨 17", () => {
    expect(EARTH_FACE_LEVEL).toBe(9);
    const earth = planetLevels(EARTH_FACE_LEVEL);
    expect(earth).toEqual({
      faceLevel: 9,
      primaryMapLevels: [5, 6, 7, 8, 9],
      terrainLevel: 16,
      placementLevel: 17,
    });
    expect(earth.primaryMapLevels.map(cellsPerSide)).toEqual([32, 64, 128, 256, 512]);
    expect(PRIMARY_MAP_LEVEL_COUNT).toBe(5);
  });

  it("1차맵 최소 칸 하나 = 지형 128×128칸 = 배치 256×256칸", () => {
    const earth = planetLevels(EARTH_FACE_LEVEL);
    expect(TERRAIN_CELLS_PER_SIDE).toBe(128);
    expect(PLACEMENT_CELLS_PER_SIDE).toBe(256);
    expect(cellsPerSide(earth.terrainLevel) / cellsPerSide(earth.faceLevel)).toBe(128);
    expect(cellsPerSide(earth.placementLevel) / cellsPerSide(earth.faceLevel)).toBe(256);
  });

  it("면 레벨은 4~14: 1차맵 5단계가 레벨 0 위에 있고 배치 칸이 최대 레벨 22 안에 들어가야 한다", () => {
    expect(MIN_FACE_LEVEL).toBe(4);
    expect(MAX_FACE_LEVEL).toBe(14);
    expect(planetLevels(4).primaryMapLevels[0]).toBe(0);
    expect(planetLevels(14).placementLevel).toBe(MAX_LEVEL);
    for (const bad of [3, 15, 9.5, -1]) expect(() => planetLevels(bad)).toThrow(RangeError);
  });

  it("레벨별 면 한 변 칸 수는 2^레벨이고, 레벨 0~22만 받는다", () => {
    expect(cellsPerSide(0)).toBe(1);
    expect(cellsPerSide(9)).toBe(512);
    expect(cellsPerSide(22)).toBe(4_194_304);
    expect(() => cellsPerSide(23)).toThrow(RangeError);
    expect(() => cellsPerSide(1.5)).toThrow(RangeError);
  });
});
