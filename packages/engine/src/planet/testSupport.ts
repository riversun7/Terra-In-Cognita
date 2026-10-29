// 시험 도우미(시험 파일만 쓴다) — 꼭짓점 높이가 방향만의 함수인 타일을 만든다(같은 꼭짓점 = 같은 높이).
import type { Face } from "@terra/planet";
import { planetRadiusMeters } from "@terra/planet/projection";
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
