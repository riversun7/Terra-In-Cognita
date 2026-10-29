// 시험 도우미(시험 파일만 쓴다)
// - makeTile: 꼭짓점 높이가 방향만의 함수인 타일(같은 꼭짓점 = 같은 높이, 레벨이 달라도 같다).
// - adrTiles: 진짜 타일과 같은 규칙(ADR 36: 면 레벨 F 칸 → 2×2 모으기 → 꼭짓점 = 나누는 칸 평균)으로 만든 타일.
//   레벨이 다른 이웃 사이 높이 차(치마가 막을 것)를 시험할 때 쓴다.
import { type Face, FACES, type PlanetFields, planetCellCount } from "@terra/planet";
import { planetRadiusMeters } from "@terra/planet/projection";
import { type MockTileMaker, createTileMaker, mockFieldsMeta } from "../mock/mockPlanet.ts";
import type { DecodedTile } from "./planetTypes.ts";
import { faceSTDirection } from "./tileShape.ts";
import type { Vec3 } from "./vec3.ts";

export const EARTH_RADIUS_M = planetRadiusMeters(9);

/** 방향 → 높이(게임 m): 부드러운 언덕과 바다 */
export function sampleHeight(direction: Vec3): number {
  const [x, y, z] = direction;
  return Math.round(400 * x * y + 300 * z - 120 * y * z + 50);
}

export function makeTile(
  face: Face,
  mapLevel: number,
  i0: number,
  j0: number,
  size: number,
  height: (direction: Vec3) => number = sampleHeight,
  faceLevel = 9,
): DecodedTile {
  const n = 2 ** mapLevel;
  const row = size + 1;
  const heightsM = new Int16Array(row * row);
  for (let cj = 0; cj < row; cj++) {
    for (let ci = 0; ci < row; ci++) {
      heightsM[cj * row + ci] = height(faceSTDirection(face, (i0 + ci) / n, (j0 + cj) / n));
    }
  }
  const cells = size * size;
  const biome = new Uint8Array(cells);
  const water = new Uint8Array(cells);
  const temperatureC = new Int8Array(cells);
  const humidity = new Uint8Array(cells);
  const forest = new Uint8Array(cells);
  const river = new Uint8Array(cells);
  for (let c = 0; c < cells; c++) {
    biome[c] = c % 10;
    water[c] = c % 7 === 0 ? 1 | (2 << 4) : 0;
    temperatureC[c] = (c % 60) - 20;
    humidity[c] = c % 256;
    forest[c] = (c * 3) % 256;
    river[c] = c % 4;
  }
  return {
    faceLevel,
    mapLevel,
    face,
    i0,
    j0,
    size,
    heightsM,
    biome,
    water,
    temperatureC,
    humidity,
    forest,
    river,
  };
}

/**
 * 면 레벨 F의 칸 고도를 elevation(면, i, j)으로 정하고(다른 칸 값은 0) 서버 굽기와 같은 코드로 타일을 만든다.
 * 물 비트가 0이라 모두 땅으로 칠하지만, 보이는 높이는 고도만 본다(max(높이, 0) × 과장).
 */
export function adrTiles(
  faceLevel: number,
  elevation: (face: Face, i: number, j: number) => number,
): MockTileMaker {
  return createTileMaker(0, faceLevel, () => {
    const n = 1 << faceLevel;
    const count = planetCellCount(faceLevel);
    const elevationM = new Int16Array(count);
    for (const face of FACES) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) elevationM[face * n * n + j * n + i] = elevation(face, i, j);
      }
    }
    const zeros = (): Uint8Array => new Uint8Array(count);
    const fields: PlanetFields = {
      elevationM,
      biome: zeros(),
      temperatureC: new Int8Array(count),
      precipitationMm: new Uint16Array(count),
      humidity: zeros(),
      water: zeros(),
      river: zeros(),
      forest: zeros(),
      meta: mockFieldsMeta(0, faceLevel),
    };
    return fields;
  });
}
