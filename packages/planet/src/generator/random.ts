// 생성기 난수 도우미 — 정수 해시와 시드 난수(@terra/shared createRng)만 쓴다(엔진과 무관하게 같은 값)
import { type Rng, createRng } from "@terra/shared";

/**
 * 32비트 정수 섞기. 결과는 0 이상 2^32 미만.
 * 구성(시프트 16·15·16, 곱 0x7feb352d·0x846ca68b)은 Chris Wellons의 lowbias32다
 * (https://github.com/skeeto/hash-prospector @ 396dbe235c94, Unlicense, THIRD_PARTY_NOTICES.md).
 */
export function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** 생성 단계마다 따로 쓰는 시드 (단계 번호 stream으로 갈라 낸다) */
export function streamSeed(seed: number, stream: number): number {
  return mix32((seed >>> 0) ^ mix32(Math.imul(stream + 1, 0x9e3779b9)));
}

/** 단계별 시드 난수 */
export function streamRng(seed: number, stream: number): Rng {
  return createRng(streamSeed(seed, stream));
}

/** [0, 1) 실수 (32비트 정수 ÷ 2^32, 정확한 나눗셈) */
export function unitFloat(rng: Rng): number {
  return rng.nextU32() / 4_294_967_296;
}

/** [min, max) 실수 */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * unitFloat(rng);
}

/** 구 위 고른 무작위 방향(단위 벡터): 정육면체 안 점을 뽑아 공 안의 것만 쓴다(삼각함수 없이) */
export function randomUnitVector(rng: Rng): [number, number, number] {
  for (;;) {
    const x = 2 * unitFloat(rng) - 1;
    const y = 2 * unitFloat(rng) - 1;
    const z = 2 * unitFloat(rng) - 1;
    const lengthSquared = x * x + y * y + z * z;
    if (lengthSquared > 1e-4 && lengthSquared <= 1) {
      const length = Math.sqrt(lengthSquared);
      return [x / length, y / length, z / length];
    }
  }
}

// 단계 번호 (값을 바꾸면 결과가 바뀐다 → GENERATOR_VERSION)
export const STREAM_PLATES = 1;
export const STREAM_PLATE_WARP = 2;
export const STREAM_CONTINENTS = 3;
export const STREAM_RELIEF = 4;
export const STREAM_MOUNTAINS = 5;
export const STREAM_HOTSPOTS = 6;
export const STREAM_FOREST = 7;
export const STREAM_ROTATION = 8;
// 출력 판 3(생성기 다양성 고침, ADR 2026-10-29-generator-variety)에서 더한 번호
export const STREAM_WIND = 9;
export const STREAM_CLIMATE = 10;
export const STREAM_RELIEF_DETAIL = 11;
export const STREAM_COAST = 12;
export const STREAM_HOTSPOT_SHAPE = 13;
// 대륙 배치(ADR 2026-10-31-continent-layouts)에서 더한 번호: 정의에 대륙 배치가 있을 때만 쓴다(없는 행성은 출력 판 3
// 그대로). 특수 지형은 16부터 쓴다
export const STREAM_CONTINENT_LAYOUT = 14;
export const STREAM_CONTINENT_ROTATION = 15;
