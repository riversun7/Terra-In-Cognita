// 2차맵 생성기 시험 — 골든 해시(출력이 한 칸이라도 바뀌면 실패 → SECOND_MAP_GENERATOR_VERSION을 올리고 고친다), 결과 모양·상식 검사.
// 행성: S2 시험 행성 F6(testPlanetValues). 칸: 땅(사막)·강(초지)·호수·깊은 바다·해안.
import { describe, expect, it } from "vitest";
import { cellKey } from "../cellKey.ts";
import { WATER_LAKE, WATER_OCEAN, WATER_RIVER } from "../tiles/fields.ts";
import { NO_WATER, generateSecondMap } from "./generate.ts";
import { SM_PLACEMENT, SM_TERRAIN, SM_VERTICES } from "./layout.ts";
import { SM_SURFACE } from "./surfaces.ts";
import { testPlanetValues } from "./testPlanetValues.ts";
import { SECOND_MAP_GENERATOR_VERSION } from "./version.ts";

const values = testPlanetValues(6);
const MAPS = {
  desert: cellKey(0, 6, 7, 7),
  river: cellKey(0, 6, 8, 15),
  lake: cellKey(0, 6, 60, 27),
  ocean: cellKey(0, 6, 0, 0),
  coast: cellKey(0, 6, 47, 1),
} as const;

/** 골든 해시(SECOND_MAP_GENERATOR_VERSION 1, 행성 생성기 출력 판 3, S2 시험 행성 F6) */
const GOLDEN: Record<keyof typeof MAPS, string> = {
  desert: "797fad7f",
  river: "7e84928d",
  lake: "02fd95ea",
  ocean: "21192bbd",
  coast: "e962bdad",
};

/** 면 0 칸 (i, j)의 행성 값 배열 번호(F6, n = 64) */
const index = (i: number, j: number): number => j * 64 + i;

const wetShare = (heights: Int32Array, levels: Int32Array): number => {
  let wet = 0;
  for (let k = 0; k < heights.length; k++) if ((levels[k] ?? NO_WATER) > (heights[k] ?? 0)) wet += 1;
  return wet / heights.length;
};

describe("2차맵 생성기", () => {
  it("골든 해시", () => {
    expect(SECOND_MAP_GENERATOR_VERSION).toBe(1);
    const hashes = Object.fromEntries(
      Object.entries(MAPS).map(([name, key]) => [name, generateSecondMap(values, key).hash]),
    );
    expect(hashes).toEqual(GOLDEN);
  });

  it("고른 칸이 뜻한 종류다(시험 자료 확인)", () => {
    expect(values.biomeIds[values.biome[index(7, 7)] ?? 0]).toBe("desert");
    expect((values.water[index(8, 15)] ?? 0) & WATER_RIVER).not.toBe(0);
    expect((values.water[index(60, 27)] ?? 0) & WATER_LAKE).not.toBe(0);
    expect((values.water[index(0, 0)] ?? 0) & WATER_OCEAN).not.toBe(0);
  });

  it("모양: 꼭짓점 129², 지형 칸 128², 엄폐 256², 지표 번호는 정한 것만, 칸 크기 약 11.7m(±10%)", () => {
    for (const key of Object.values(MAPS)) {
      const map = generateSecondMap(values, key);
      expect(map.heightsCm.length).toBe(SM_VERTICES * SM_VERTICES);
      expect(map.waterLevelCm.length).toBe(SM_VERTICES * SM_VERTICES);
      expect(map.surface.length).toBe(SM_TERRAIN * SM_TERRAIN);
      expect(map.cover.length).toBe(SM_PLACEMENT * SM_PLACEMENT);
      const codes: readonly number[] = Object.values(SM_SURFACE);
      for (const code of map.surface) expect(codes.includes(code)).toBe(true);
      expect(map.cellSizeMm).toBeGreaterThan(10_500);
      expect(map.cellSizeMm).toBeLessThan(12_900);
    }
  });

  it("상식: 깊은 바다는 모두 물, 사막·강 칸은 거의 땅, 호수 칸은 반 넘게 물, 강 칸에는 얕은 물길이 있다", () => {
    const ocean = generateSecondMap(values, MAPS.ocean);
    expect(wetShare(ocean.heightsCm, ocean.waterLevelCm)).toBe(1);
    expect([...ocean.surface].every((code) => code === SM_SURFACE.water)).toBe(true);
    const desert = generateSecondMap(values, MAPS.desert);
    expect([...desert.surface].filter((code) => code === SM_SURFACE.sand).length).toBeGreaterThan(
      SM_TERRAIN * SM_TERRAIN * 0.4,
    );
    const river = generateSecondMap(values, MAPS.river);
    expect(wetShare(river.heightsCm, river.waterLevelCm)).toBeLessThan(0.1);
    expect(
      [...river.surface].some((code) => code === SM_SURFACE.shallowWater || code === SM_SURFACE.water),
    ).toBe(true);
    const lake = generateSecondMap(values, MAPS.lake);
    expect(wetShare(lake.heightsCm, lake.waterLevelCm)).toBeGreaterThan(0.5);
  });

  it("면 레벨이 다른 2차맵 키는 거절한다", () => {
    expect(() => generateSecondMap(values, cellKey(0, 7, 1, 1))).toThrow(RangeError);
  });
});
