// 시험 전용 — 작은 결정적 가짜 생성기 출력(PlanetFields). 생성기가 아니라 타일 시험용 무작위 값이다.
// 같은 (면 레벨, 시드)면 늘 같은 값이 나온다. 다른 묶음 의존 없이 작은 난수(mulberry32)를 직접 둔다.
import { cellsPerSide } from "../levels.ts";
import {
  type PlanetFields,
  WATER_COAST,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
} from "./fields.ts";

/** 시험용 생성기 버전 */
export const TEST_GENERATOR_VERSION = 7;

/** 0 이상 2^32 미만 정수를 내는 결정적 난수 */
export function testRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** 모든 칸이 무작위인 가짜 출력 (고도 −1000~999, 기온 −40~39, 물 비트는 바다·호수·강·해안·수심을 섞는다) */
export function randomPlanetFields(faceLevel: number, seed: number): PlanetFields {
  const n = cellsPerSide(faceLevel);
  const count = 6 * n * n;
  const next = testRandom(seed);
  const fields: PlanetFields = {
    elevationM: new Int16Array(count),
    biome: new Uint8Array(count),
    temperatureC: new Int8Array(count),
    precipitationMm: new Uint16Array(count),
    humidity: new Uint8Array(count),
    water: new Uint8Array(count),
    river: new Uint8Array(count),
    forest: new Uint8Array(count),
    meta: {
      generatorVersion: TEST_GENERATOR_VERSION,
      seed,
      faceLevel,
      settings: { test: true },
      hash: "test",
    },
  };
  for (let index = 0; index < count; index++) {
    fields.elevationM[index] = (next() % 2000) - 1000;
    fields.biome[index] = next() % 14;
    fields.temperatureC[index] = (next() % 80) - 40;
    fields.precipitationMm[index] = next() % 4000;
    fields.humidity[index] = next() % 256;
    fields.forest[index] = next() % 256;
    const kind = next() % 4;
    const depth = (next() % 3) + 1;
    let water = 0;
    if (kind === 0) water = WATER_OCEAN | (depth << WATER_DEPTH_SHIFT);
    else if (kind === 1) water = WATER_LAKE;
    if (next() % 5 === 0) water |= WATER_RIVER;
    if (next() % 6 === 0) water |= WATER_COAST;
    fields.water[index] = water;
    fields.river[index] = (water & WATER_RIVER) !== 0 ? (next() % 3) + 1 : 0;
  }
  return fields;
}

/** 모든 칸이 같은 값인 가짜 출력 (큰 면 레벨의 개수·시간 시험용) */
export function flatPlanetFields(faceLevel: number, elevationM: number): PlanetFields {
  const n = cellsPerSide(faceLevel);
  const count = 6 * n * n;
  return {
    elevationM: new Int16Array(count).fill(elevationM),
    biome: new Uint8Array(count),
    temperatureC: new Int8Array(count),
    precipitationMm: new Uint16Array(count),
    humidity: new Uint8Array(count),
    water: new Uint8Array(count),
    river: new Uint8Array(count),
    forest: new Uint8Array(count),
    meta: { generatorVersion: TEST_GENERATOR_VERSION, seed: 0, faceLevel, settings: {}, hash: "flat" },
  };
}

/** FNV-1a 32비트 (시험의 골든 값) */
export function fnv1a(arrays: readonly ArrayLike<number>[]): string {
  let hash = 0x811c9dc5;
  for (const array of arrays) {
    for (let index = 0; index < array.length; index++) {
      // 칸 값은 −32768~65535라 아래 16비트를 두 바이트로 넣는다
      const value = (array[index] ?? 0) & 0xffff;
      hash = Math.imul(hash ^ (value & 0xff), 0x0100_0193);
      hash = Math.imul(hash ^ (value >>> 8), 0x0100_0193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
