// 2차맵 생성기 시험 — 골든 해시(출력이 한 칸이라도 바뀌면 실패 → SECOND_MAP_GENERATOR_VERSION을 올리고 고친다), 결과 모양·상식 검사.
// 행성: S2 시험 행성 F6(testPlanetValues), 소품 규칙: 팩 map_props 사본(testPropRules). 칸: 땅(사막)·강(초지)·호수·깊은 바다·해안.
import { MAP_PROP_ARTS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { cellKey } from "../cellKey.ts";
import { WATER_LAKE, WATER_OCEAN, WATER_RIVER } from "../tiles/fields.ts";
import { NO_WATER, generateSecondMap } from "./generate.ts";
import { SM_PLACEMENT, SM_TERRAIN, SM_VERTICES } from "./layout.ts";
import { emptyPropRules } from "./props.ts";
import { SM_SURFACE } from "./surfaces.ts";
import { testPlanetValues, testPropRules } from "./testPlanetValues.ts";
import { SECOND_MAP_GENERATOR_VERSION } from "./version.ts";

const values = testPlanetValues(6);
/** 장식 소품 그림 번호의 시작(선인장) */
const DECOR_ART_MIN = MAP_PROP_ARTS.indexOf("cactus");
const rules = testPropRules();
const MAPS = {
  desert: cellKey(0, 6, 7, 7),
  river: cellKey(0, 6, 8, 15),
  lake: cellKey(0, 6, 60, 27),
  ocean: cellKey(0, 6, 0, 0),
  coast: cellKey(0, 6, 47, 1),
} as const;

/**
 * 골든 해시(SECOND_MAP_GENERATOR_VERSION 1, 행성 생성기 출력 판 3, S2 시험 행성 F6, 시험 소품 규칙 = 팩 map_props 사본).
 * 2026-11-12 소품 규칙(팩 core@77 지형별 장식·물 위 소품, 기획 D-536)이 바뀌어 고쳤다 — 생성기 코드는 앞 규칙에서 같은 해시를 낸다(작업 기록)
 */
const GOLDEN: Record<keyof typeof MAPS, string> = {
  desert: "d818ec09",
  river: "0f227059",
  lake: "0ac58d89",
  ocean: "e69e35a6",
  coast: "22ddfbb0",
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
      Object.entries(MAPS).map(([name, key]) => [name, generateSecondMap(values, key, rules).hash]),
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
      const map = generateSecondMap(values, key, rules);
      expect(map.heightsCm.length).toBe(SM_VERTICES * SM_VERTICES);
      expect(map.waterLevelCm.length).toBe(SM_VERTICES * SM_VERTICES);
      expect(map.surface.length).toBe(SM_TERRAIN * SM_TERRAIN);
      expect(map.cover.length).toBe(SM_PLACEMENT * SM_PLACEMENT);
      expect(map.art.length).toBe(SM_PLACEMENT * SM_PLACEMENT);
      expect(map.propRulesHash).toBe(rules.hash);
      for (let i = 0; i < map.cover.length; i++) {
        const cover = map.cover[i] ?? 0;
        const art = map.art[i] ?? 0;
        expect(cover).toBeLessThanOrEqual(2);
        expect(art).toBeLessThan(MAP_PROP_ARTS.length);
        // 판정 소품(숲·바위·덤불·갈대·쓰러진 나무, 그림 1~7)은 엄폐 1·2라 그림이 있으면 엄폐가 있다(숲 칸에 그림 항목이 없을 때만
        // 엄폐만 있다). 2026-11-11 장식 소품(그림 8~)은 엄폐 0이다
        if (art !== 0) expect(cover > 0).toBe(art < DECOR_ART_MIN);
      }
      const codes: readonly number[] = Object.values(SM_SURFACE);
      for (const code of map.surface) expect(codes.includes(code)).toBe(true);
      expect(map.cellSizeMm).toBeGreaterThan(10_500);
      expect(map.cellSizeMm).toBeLessThan(12_900);
    }
  });

  it("상식: 깊은 바다는 모두 물, 사막·강 칸은 거의 땅, 호수 칸은 반 넘게 물, 강 칸에는 얕은 물길이 있다", () => {
    const ocean = generateSecondMap(values, MAPS.ocean, rules);
    expect(wetShare(ocean.heightsCm, ocean.waterLevelCm)).toBe(1);
    expect([...ocean.surface].every((code) => code === SM_SURFACE.water)).toBe(true);
    const desert = generateSecondMap(values, MAPS.desert, rules);
    expect([...desert.surface].filter((code) => code === SM_SURFACE.sand).length).toBeGreaterThan(
      SM_TERRAIN * SM_TERRAIN * 0.4,
    );
    const river = generateSecondMap(values, MAPS.river, rules);
    expect(wetShare(river.heightsCm, river.waterLevelCm)).toBeLessThan(0.1);
    expect(
      [...river.surface].some((code) => code === SM_SURFACE.shallowWater || code === SM_SURFACE.water),
    ).toBe(true);
    const lake = generateSecondMap(values, MAPS.lake, rules);
    expect(wetShare(lake.heightsCm, lake.waterLevelCm)).toBeGreaterThan(0.5);
  });

  it("면 레벨이 다른 2차맵 키는 거절한다", () => {
    expect(() => generateSecondMap(values, cellKey(0, 7, 1, 1), rules)).toThrow(RangeError);
    // 다른 바이옴 표로 만든 소품 규칙
    expect(() => generateSecondMap(values, MAPS.desert, emptyPropRules(["desert"]))).toThrow(RangeError);
  });
});
