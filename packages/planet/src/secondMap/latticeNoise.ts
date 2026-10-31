// 면 격자 정수 값 노이즈 — ADR 46 3절(선택지 A1). 사칙연산·정수 해시만 쓴다(판정 자료에 써도 된다).
// - 격자점 값 = 정수 해시(그 격자점의 정육면체 점 Q, 격자 레벨, 소금). 같은 격자점은 어느 면·어느 2차맵에서 계산해도 같다.
// - 칸 안은 축마다 정수 smoothstep(3f² − 2f³)으로 잇는다. 그래서 면 경계 위 점은 경계 위 격자점 둘로만 정해지고,
//   맞닿은 두 면이 같은 값을 낸다(축 순서·방향이 달라도 같다: smoothstep(1 − f) = 1 − smoothstep(f)가 정수에서도 정확하다).
// - 값은 0 ~ 65535. 중간 계산은 2^53 안이다(차이 ≤ 65535 × 가중치 ≤ 2^24).
import { mix32 } from "../generator/random.ts";
import type { Face } from "../faces.ts";
import { pow2 } from "../levels.ts";
import { cubePoint, floorDiv } from "./layout.ts";

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

/** a에서 b로 정수 가중치 w(분모 2^(3k))만큼. 내림이라 lerp(a, b, w) = lerp(b, a, 2^(3k) − w)가 정확히 같다 */
function lerpInt(a: number, b: number, w: number, k: number): number {
  return a + floorDiv((b - a) * w, pow2(3 * k));
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
  for (let b = 0; b < height; b++) {
    const Y = y0 + b * stride;
    const q = floorDiv(Y, step);
    const wy = smoothWeight(Y - q * step, k);
    const row0 = (q - qMin) * pw;
    const row1 = row0 + pw;
    for (let a = 0; a < width; a++) {
      const col = px[a] ?? 0;
      const w = wx[a] ?? 0;
      const v00 = lattice[row0 + col] ?? 0;
      const v10 = lattice[row0 + col + 1] ?? 0;
      const v01 = lattice[row1 + col] ?? 0;
      const v11 = lattice[row1 + col + 1] ?? 0;
      const bottom = w === 0 ? v00 : lerpInt(v00, v10, w, k);
      const top = w === 0 ? v01 : lerpInt(v01, v11, w, k);
      out[b * width + a] = wy === 0 ? bottom : lerpInt(bottom, top, wy, k);
    }
  }
  return out;
}
