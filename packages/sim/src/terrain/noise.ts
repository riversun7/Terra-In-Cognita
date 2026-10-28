// 정수 값 노이즈 — 초월함수 없이 정수 해시와 정수 보간만 쓴다(엔진과 무관하게 같은 값).
import { hashCoords } from "../math/hash.ts";

/** 노이즈 값 상한(0 ~ 65535) */
export const NOISE_MAX = 0xffff;
const WEIGHT_ONE = 0x1_0000;

/** 부드러운 가중치 3t² − 2t³ (t = f ÷ spacing)를 0 ~ 65536 정수로. 분자는 2^53 안이라 정확하다 */
function smoothWeight(f: number, spacing: number): number {
  return Math.floor((f * f * (3 * spacing - 2 * f) * WEIGHT_ONE) / (spacing * spacing * spacing));
}

/** a에서 b로 가중치 w(0 ~ 65536)만큼. 내림이라 결과는 항상 a와 b 사이다 */
function lerp(a: number, b: number, weight: number): number {
  return a + Math.floor(((b - a) * weight) / WEIGHT_ONE);
}

/**
 * 값 노이즈: 간격 2^spacingLog2인 격자점마다 해시 값(0 ~ 65535), 사이는 3t² − 2t³ 가중치로 보간한다.
 * x, y는 0 이상 2^31 미만 정수, spacingLog2는 0 ~ 10.
 */
export function valueNoise(seed: number, x: number, y: number, spacingLog2: number): number {
  const spacing = 1 << spacingLog2;
  const ix = x >> spacingLog2;
  const iy = y >> spacingLog2;
  const wx = smoothWeight(x & (spacing - 1), spacing);
  const wy = smoothWeight(y & (spacing - 1), spacing);
  const v00 = hashCoords(seed, ix, iy) >>> 16;
  const v10 = hashCoords(seed, ix + 1, iy) >>> 16;
  const v01 = hashCoords(seed, ix, iy + 1) >>> 16;
  const v11 = hashCoords(seed, ix + 1, iy + 1) >>> 16;
  return lerp(lerp(v00, v10, wx), lerp(v01, v11, wx), wy);
}
