// 시험 자리 찾기·칸 값 시험 — S2 시험 행성 F6에서 종류마다 고른 칸이 그 종류의 조건을 만족하는지, 칸 값이 행성 값과 같은지
import { describe, expect, it } from "vitest";
import { cellKey, decodeCellKey, isCellKey } from "../cellKey.ts";
import { cellsPerSide } from "../levels.ts";
import { encodePlanetValues } from "./planetValues.ts";
import { MAP_PRESETS, findMapPreset, planetCellValues, planetCellValuesFromFile } from "./presets.ts";
import { testPlanetValues } from "./testPlanetValues.ts";

const values = testPlanetValues(6);
const n = cellsPerSide(6);

function decode(key: number) {
  if (!isCellKey(key)) throw new Error(`not a cell key: ${key}`);
  return decodeCellKey(key);
}

/** 키의 3×3 묶음 행성 값 배열 번호 */
function block(key: number): number[] {
  const { face, i, j } = decode(key);
  const out: number[] = [];
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) out.push(face * n * n + (j + dj) * n + i + di);
  return out;
}

describe("시험 자리 찾기", () => {
  it("종류마다 면 레벨 F 칸을 하나 고르고, 같은 값이면 늘 같은 칸이다", () => {
    for (const preset of MAP_PRESETS) {
      const key = findMapPreset(values, preset);
      expect(key, preset).not.toBeNull();
      expect(decode(key ?? 0).level).toBe(6);
      expect(findMapPreset(values, preset)).toBe(key);
    }
  });

  it("고른 칸이 조건을 만족한다: 강·호수·바닷가·초지·산", () => {
    const water = (key: number) => block(key).map((c) => values.water[c] ?? 0);
    const river = findMapPreset(values, "river") ?? 0;
    expect(water(river).some((w, k) => w & 4 && (values.river[block(river)[k] ?? 0] ?? 0) >= 2)).toBe(true);
    expect(water(river).every((w) => (w & 1) === 0)).toBe(true);
    const lake = findMapPreset(values, "lake") ?? 0;
    expect(water(lake).some((w) => w & 2)).toBe(true);
    const coast = findMapPreset(values, "coast") ?? 0;
    expect(water(coast).some((w) => w & 1)).toBe(true);
    expect((values.water[block(coast)[4] ?? 0] ?? 0) & 1).toBe(0);
    const grass = findMapPreset(values, "grassland") ?? 0;
    const grassIndex = values.biomeIds.indexOf("grassland");
    expect(block(grass).some((c) => values.biome[c] === grassIndex)).toBe(true);
    // 산: 묶음 높이 차가 행성 전체 3×3 묶음 중앙값보다 크다(대충이 아니라 가장 큰 쪽)
    const relief = (key: number) => {
      const heights = block(key).map((c) => values.elevationM[c] ?? 0);
      return Math.max(...heights) - Math.min(...heights);
    };
    expect(relief(findMapPreset(values, "mountain") ?? 0)).toBeGreaterThan(relief(grass));
  });
});

describe("2차맵 칸 값", () => {
  it("행성 값 배열의 그 칸 값과 같다", () => {
    const key = cellKey(0, 6, 8, 15);
    const c = 15 * n + 8;
    const cell = planetCellValues(values, key);
    expect(cell).toMatchObject({
      mapKey: key,
      face: 0,
      i: 8,
      j: 15,
      faceLevel: 6,
      elevationM: values.elevationM[c],
      temperatureC: values.temperatureC[c],
      humidity: values.humidity[c],
      precipitationMm: values.precipitationMm[c],
      water: values.water[c],
      riverOrder: values.river[c],
      forest: values.forest[c],
      biomeId: values.biomeIds[values.biome[c] ?? 0],
    });
  });

  it("행성 값 파일에서 칸 하나만 읽어도 같다(여러 면·가장자리 칸)", () => {
    const bytes = encodePlanetValues(values);
    for (const key of [
      cellKey(0, 6, 8, 15),
      cellKey(3, 6, 0, 63),
      cellKey(5, 6, 63, 0),
      cellKey(2, 6, 31, 32),
    ]) {
      expect(planetCellValuesFromFile(bytes, key)).toEqual(planetCellValues(values, key));
    }
    expect(() => planetCellValuesFromFile(bytes, cellKey(0, 7, 1, 1))).toThrow(RangeError);
  });

  it("셀 키가 아니거나 레벨이 다르면 RangeError", () => {
    expect(() => planetCellValues(values, 3.5)).toThrow(RangeError);
    expect(() => planetCellValues(values, cellKey(0, 7, 1, 1))).toThrow(RangeError);
  });
});
