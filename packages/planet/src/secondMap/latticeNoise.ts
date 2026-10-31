// 면 격자 정수 값 노이즈 — ADR 46 3절(선택지 A1). 사칙연산·정수 해시만 쓴다(판정 자료에 써도 된다).
// - 격자점 값 = 정수 해시(그 격자점의 정육면체 점 Q, 격자 레벨, 소금). 같은 격자점은 어느 면·어느 2차맵에서 계산해도 같다.
// - 칸 안은 축마다 정수 smoothstep(3f² − 2f³)으로 잇는다. 그래서 면 경계 위 점은 경계 위 격자점 둘로만 정해지고,
//   맞닿은 두 면이 같은 값을 낸다(축 순서·방향이 달라도 같다: smoothstep(1 − f) = 1 − smoothstep(f)가 정수에서도 정확하다).
// - 값은 0 ~ 65535. 중간 계산은 2^53 안이다(차이 ≤ 65535 × 가중치 ≤ 2^24).
import { mix32 } from "../generator/random.ts";
import type { Face } from "../faces.ts";
import { pow2 } from "../levels.ts";
import { cubePoint, floorDiv } from "./layout.ts";

/** 노이즈 층 소금(행성 시드와 층 번호를 섞는다). 층 번호는 generate.ts·placement.ts가 정한다 */
export function layerSalt(seed: number, layer: number): number {
  return mix32((seed ^ mix32(Math.imul(layer + 0x51ed, 0x9e3779b9))) >>> 0);
}

/** 노이즈 값의 상한 + 1 */
export const NOISE_RANGE = 65536;

/** 격자점 하나의 값(0 ~ 65535): 정육면체 점·레벨·소금의 해시 */
export function latticeValue(face: Face, level: number, p: number, q: number, salt: number): number {
  const [x, y, z] = cubePoint(face, level, p, q);
  let h = mix32((salt ^ Math.imul(level + 1, 0x27d4eb2d)) >>> 0);
  h = mix32((h ^ x) >>> 0);
  h = mix32((h ^ Math.imul(y, 0x165667b1)) >>> 0);
  h = mix32((h ^ Math.imul(z, 0x9e3779b1)) >>> 0);
  return h >>> 16;
}

/** 정수 smoothstep 가중치: 칸 안 위치 f = x / 2^k → s × 2^(3k) = x²(3·2^k − 2x) */
export function smoothWeight(x: number, k: number): number {
  return x * x * (3 * pow2(k) - 2 * x);
}

/**
 * a에서 b로 정수 가중치 w(분모 2^(3k))만큼. 내림이라 lerp(a, b, w) = lerp(b, a, 2^(3k) − w)가 정확히 같다.
 * 분모가 2의 거듭제곱이라 나눗셈이 정확하고(지수만 바뀐다) Math.floor가 floorDiv와 같은 값을 더 빨리 낸다(곱 < 2^53).
 */
function lerpInt(a: number, b: number, w: number, k: number): number {
  return a + Math.floor(((b - a) * w) / pow2(3 * k));
}

/**
 * 면 face 위 레벨 gridLevel의 정수 점 (X, Y)에서 격자 레벨 gridLevel − k의 값 노이즈(0 ~ 65535).
 * k = 0이면 격자점 값 그대로다. X·Y는 0 ~ 2^gridLevel.
 */
export function sampleLatticeNoise(
  face: Face,
  gridLevel: number,
  X: number,
  Y: number,
  k: number,
  salt: number,
): number {
  const level = gridLevel - k;
  const step = pow2(k);
  const p = floorDiv(X, step);
  const q = floorDiv(Y, step);
  const fx = X - p * step;
  const fy = Y - q * step;
  const v00 = latticeValue(face, level, p, q, salt);
  if (fx === 0 && fy === 0) return v00;
  const wx = smoothWeight(fx, k);
  const wy = smoothWeight(fy, k);
  const v10 = fx === 0 ? v00 : latticeValue(face, level, p + 1, q, salt);
  const v01 = fy === 0 ? v00 : latticeValue(face, level, p, q + 1, salt);
  const v11 = fx === 0 ? v01 : fy === 0 ? v10 : latticeValue(face, level, p + 1, q + 1, salt);
  const bottom = lerpInt(v00, v10, wx, k);
  const top = lerpInt(v01, v11, wx, k);
  return lerpInt(bottom, top, wy, k);
}

/**
 * 직사각형 범위의 노이즈를 한꺼번에(격자점 값을 한 번씩만 해시한다). 점 (X, Y) = (x0 + a × stride, y0 + b × stride),
 * a < width, b < height. 결과는 행 우선(b × width + a). 값은 sampleLatticeNoise와 비트까지 같다(시험).
 */
export function latticeNoiseGrid(
  face: Face,
  gridLevel: number,
  x0: number,
  y0: number,
  stride: number,
  width: number,
  height: number,
  k: number,
  salt: number,
  out: Int32Array = new Int32Array(width * height),
): Int32Array {
  const level = gridLevel - k;
  const step = pow2(k);
  const pMin = floorDiv(x0, step);
  const qMin = floorDiv(y0, step);
  const pMax = floorDiv(x0 + (width - 1) * stride, step) + 1;
  const qMax = floorDiv(y0 + (height - 1) * stride, step) + 1;
  const pw = pMax - pMin + 1;
  const lattice = new Int32Array(pw * (qMax - qMin + 1));
  for (let q = qMin; q <= qMax; q++) {
    for (let p = pMin; p <= pMax; p++) {
      // 면 밖 격자점(면 끝 너머)은 쓰이지 않는다: 그 자리 가중치가 0이다. 값은 0으로 둔다
      const inside = p >= 0 && q >= 0 && p <= pow2(level) && q <= pow2(level);
      lattice[(q - qMin) * pw + (p - pMin)] = inside ? latticeValue(face, level, p, q, salt) : 0;
    }
  }
  const px = new Int32Array(width);
  const wx = new Float64Array(width);
  for (let a = 0; a < width; a++) {
    const X = x0 + a * stride;
    const p = floorDiv(X, step);
    px[a] = p - pMin;
    wx[a] = smoothWeight(X - p * step, k);
  }
  const denom = pow2(3 * k);
  for (let b = 0; b < height; b++) {
    const Y = y0 + b * stride;
    const q = floorDiv(Y, step);
    const wy = smoothWeight(Y - q * step, k);
    const row0 = (q - qMin) * pw;
    const row1 = row0 + pw;
    const base = b * width;
    for (let a = 0; a < width; a++) {
      const col = px[a] ?? 0;
      const w = wx[a] ?? 0;
      const v00 = lattice[row0 + col] ?? 0;
      const v01 = lattice[row1 + col] ?? 0;
      // lerpInt를 펼쳐 쓴다(같은 식, 가장 많이 도는 곳)
      const bottom = w === 0 ? v00 : v00 + Math.floor((((lattice[row0 + col + 1] ?? 0) - v00) * w) / denom);
      const top = w === 0 ? v01 : v01 + Math.floor((((lattice[row1 + col + 1] ?? 0) - v01) * w) / denom);
      out[base + a] = wy === 0 ? bottom : bottom + Math.floor(((top - bottom) * wy) / denom);
    }
  }
  return out;
}

/**
 * 노이즈 값의 분위 표(1/32 간격, 2026-10-31 측정: 격자 간격 4·8·16, 표본 471만 점). 값 노이즈는 가운데에 몰려서
 * "노이즈 < 35%"가 칸의 35%가 되지 않는다. equalizeNoise가 이 표로 고르게 편다(문턱이 칸 몫과 맞게).
 * 양끝은 0·65536으로 둔다. 표를 바꾸면 2차맵 출력이 바뀐다(SECOND_MAP_GENERATOR_VERSION).
 */
const NOISE_QUANTILES = [
  0, 7962, 10994, 13328, 15336, 17157, 18837, 20429, 21948, 23411, 24821, 26203, 27556, 28888, 30208, 31505,
  32795, 34088, 35391, 36699, 38025, 39368, 40744, 42156, 43605, 45108, 46691, 48363, 50169, 52165, 54486,
  57503, 65536,
] as const;

/** 고르게 펴기 표(처음 쓸 때 한 번 만든다, 65,536칸 × 2바이트) */
let equalizeTable: Uint16Array | undefined;

/** 노이즈 값(0 ~ 65535) → 고르게 편 값(0 ~ 65535, 단조 증가, 정수). 표를 찾아 읽는다 */
export function equalizeNoise(value: number): number {
  if (!equalizeTable) {
    equalizeTable = new Uint16Array(NOISE_RANGE);
    for (let v = 0; v < NOISE_RANGE; v++) equalizeTable[v] = equalizeNoiseExact(v);
  }
  return equalizeTable[value] ?? 0;
}

/** 분위 표로 고르게 편 값(equalizeNoise의 정의) */
export function equalizeNoiseExact(value: number): number {
  // 분위 표에서 값이 든 구간을 찾는다(구간 32개, 이분 탐색)
  let low = 0;
  let high = 32;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (value >= (NOISE_QUANTILES[mid] ?? 0)) low = mid;
    else high = mid;
  }
  const from = NOISE_QUANTILES[low] ?? 0;
  const to = NOISE_QUANTILES[low + 1] ?? NOISE_RANGE;
  return Math.min(NOISE_RANGE - 1, low * 2048 + Math.floor(((value - from) * 2048) / (to - from)));
}
