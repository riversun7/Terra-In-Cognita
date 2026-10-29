// 3차원 그라디언트 노이즈(개선 펄린 방식)와 fBm·능선 노이즈 — 구 위 점(단위 벡터 × 주파수)에서 계산한다.
// 이음매·극 찌그러짐이 없다(PLAN 5.3). 격자점 기울기는 정수 해시로 고르고, 사칙연산과 Math.floor만 쓴다.
// 기울기 12개(정육면체 모서리 방향)와 보간 6t⁵ − 15t⁴ + 10t³은 Ken Perlin의 개선 노이즈(2002) 방식이다.
import { mix32 } from "./random.ts";

const PRIME_X = 0x9e3779b1;
const PRIME_Y = 0x85ebca77;
const PRIME_Z = 0xc2b2ae3d;

// 해시 섞기 곱(random.ts mix32와 같은 lowbias32 상수)과 격자점 해시 마지막 곱
const MIX_A = 0x7feb352d;
const MIX_B = 0x846ca68b;
const CORNER = 0x27d4eb2d;

// 기울기 표: 해시 아래 4비트(0~15) → 기울기 (GX, GY, GZ). 정육면체 모서리 방향 12개 + 겹치는 4개(12~15 = 0·1·9·11번).
// 분기 없이 표로 읽는다(switch보다 빠르다). 값은 예전 switch와 같아서 결과가 비트까지 같다(골든 해시·실수 지문 시험)
const GRADIENT_X = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, -1, 0, 0]);
const GRADIENT_Y = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, 1, -1, -1]);
const GRADIENT_Z = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 0, 1, -1]);

// 아래 두 함수는 해시(mix32: x ^= x>>>16, ×A, x ^= x>>>15, ×B, x ^= x>>>16)·격자점 해시·기울기 내적·보간
// 6t⁵ − 15t⁴ + 10t³을 손으로 펼쳤다. 작은 함수 호출 25번을 V8이 다 펼치지 않아 3배쯤 느렸다(Verified: 2026-10-29,
// Node 24.22.1, 호출당 약 190ns → 55ns). 연산과 순서는 예전 함수들과 같아 결과가 비트까지 같다(골든 해시·실수 지문 시험).

/** 3차원 그라디언트 노이즈. 결과는 대략 -1 ~ 1, 격자점에서 0 */
export function gradientNoise3(seed: number, x: number, y: number, z: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const dx = x - fx;
  const dy = y - fy;
  const dz = z - fz;
  const u = dx * dx * dx * (dx * (dx * 6 - 15) + 10);
  const v = dy * dy * dy * (dy * (dy * 6 - 15) + 10);
  const w = dz * dz * dz * (dz * (dz * 6 - 15) + 10);
  // x 방향 해시 두 개
  let h = (seed ^ Math.imul(fx, PRIME_X)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const hx0 = h >>> 0;
  h = (seed ^ Math.imul(fx + 1, PRIME_X)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const hx1 = h >>> 0;
  // (x, y) 해시 네 개
  const y0 = Math.imul(fy, PRIME_Y);
  const y1 = Math.imul(fy + 1, PRIME_Y);
  h = (hx0 ^ y0) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const h00 = h >>> 0;
  h = (hx1 ^ y0) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const h10 = h >>> 0;
  h = (hx0 ^ y1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const h01 = h >>> 0;
  h = (hx1 ^ y1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const h11 = h >>> 0;
  // 격자점 여덟 개: 해시 위 4비트로 고른 기울기와 내적
  const z0 = Math.imul(fz, PRIME_Z);
  const z1 = Math.imul(fz + 1, PRIME_Z);
  let k = Math.imul(h00 ^ z0, CORNER) >>> 28;
  const g000 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * dz;
  k = Math.imul(h10 ^ z0, CORNER) >>> 28;
  const g100 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * dz;
  k = Math.imul(h01 ^ z0, CORNER) >>> 28;
  const g010 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * dz;
  k = Math.imul(h11 ^ z0, CORNER) >>> 28;
  const g110 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * dz;
  k = Math.imul(h00 ^ z1, CORNER) >>> 28;
  const g001 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  k = Math.imul(h10 ^ z1, CORNER) >>> 28;
  const g101 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  k = Math.imul(h01 ^ z1, CORNER) >>> 28;
  const g011 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  k = Math.imul(h11 ^ z1, CORNER) >>> 28;
  const g111 =
    (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  const x00 = g000 + u * (g100 - g000);
  const x10 = g010 + u * (g110 - g010);
  const x01 = g001 + u * (g101 - g001);
  const x11 = g011 + u * (g111 - g011);
  const v0 = x00 + v * (x10 - x00);
  const v1 = x01 + v * (x11 - x01);
  return v0 + w * (v1 - v0);
}

/**
 * fBm: 옥타브마다 주파수 2배, 세기 gain배. 결과를 세기 합으로 나눠 대략 -1 ~ 1.
 * 옥타브마다 시드를 바꿔 같은 격자 무늬가 겹치지 않게 한다.
 */
export function fbm3(
  seed: number,
  x: number,
  y: number,
  z: number,
  frequency: number,
  octaves: number,
  gain: number,
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let f = frequency;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude * gradientNoise3(mix32(seed + octave * 0x632be5ab), x * f, y * f, z * f);
    total += amplitude;
    amplitude *= gain;
    f *= 2;
  }
  return total > 0 ? sum / total : 0;
}

/** 능선 노이즈: (1 - |노이즈|)²의 fBm. 결과 0 ~ 1, 능선(1 근처)이 가늘게 이어진다 */
export function ridged3(
  seed: number,
  x: number,
  y: number,
  z: number,
  frequency: number,
  octaves: number,
  gain: number,
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let f = frequency;
  for (let octave = 0; octave < octaves; octave++) {
    const ridge = 1 - Math.abs(gradientNoise3(mix32(seed + octave * 0x2c1b3c6d), x * f, y * f, z * f));
    sum += amplitude * ridge * ridge;
    total += amplitude;
    amplitude *= gain;
    f *= 2;
  }
  return total > 0 ? sum / total : 0;
}

// ── 노이즈 2판 (출력 판 3부터 새로 쓰는 노이즈) ──
// 1판 fbm3·ridged3는 옥타브 격자가 정확히 포개진다(주파수 2배, 같은 원점). 그래서 기본 격자점에서 모든 옥타브가 함께
// 0이 되어 격자 간격마다 평평한 점이 생긴다(반복 검사 "노이즈 격자점" 0.37). 2판은 옥타브 k마다
//   h = mix32(seed + k·0x632be5ab), h2 = mix32(h ^ 0x5bd1e995)
//   원점 = (h & 0xffff, h >>> 16, h2 & 0xffff) ÷ 256 격자 단위(0 ~ 256), 노이즈 시드 = h2
// 로 격자를 옮기고, 다음 옥타브 좌표는 p ← 2·R·p다(R: 고정 정규 직교 행렬, 피타고라스 수 성분이라 삼각함수가 없다).
// 옮기기만 하면 첫 옥타브의 0점이 옮긴 격자에 그대로 남는다. jitter > 0이면 입력 좌표를 기본 주파수 노이즈 세 개
// (각자 옮긴 격자)로 흔든다: 격자 단위로 jitter × 노이즈(실제 좌표로는 jitter ÷ 주파수 × 노이즈).
// 1판 함수는 그대로 둔다: 판 흔들기·대륙·회전 고르기·기복·숲이 쓰고, 바꾸면 판·대륙 배치가 바뀐다.

const OCTAVE_SALT = 0x632be5ab;
const OFFSET_SALT = 0x5bd1e995;
/** 좌표 흔들기 노이즈 세 개의 "옥타브" 번호(61·62·63: 옥타브 격자와 겹치지 않게 큰 번호) */
const JITTER_OCTAVE = 61;
// 옥타브 사이 회전 R(행 우선): 행끼리 수직이고 길이 1, 행렬식 1
const R00 = 0;
const R01 = 0.8;
const R02 = 0.6;
const R10 = -0.8;
const R11 = 0.36;
const R12 = -0.48;
const R20 = -0.6;
const R21 = -0.48;
const R22 = 0.64;

/** 옥타브 k의 격자 원점(격자 단위 x·y·z)과 노이즈 시드. 반복 검사가 격자점 위치를 알려고 쓴다 */
export function noiseOctaveLattice(seed: number, octave: number): readonly [number, number, number, number] {
  const h = mix32(seed + octave * OCTAVE_SALT);
  const h2 = mix32(h ^ OFFSET_SALT);
  return [(h & 0xffff) / 256, (h >>> 16) / 256, (h2 & 0xffff) / 256, h2];
}

/** 흔든 기본 주파수 좌표(jitterPoint가 쓴다. 한 스레드 안에서만 쓰는 임시 칸) */
const jittered = new Float64Array(3);

/** (px, py, pz)(기본 주파수 격자 단위)를 흔들어 jittered에 쓴다. jitter ≤ 0이면 그대로 */
function jitterPoint(seed: number, px: number, py: number, pz: number, jitter: number): void {
  jittered[0] = px;
  jittered[1] = py;
  jittered[2] = pz;
  if (!(jitter > 0)) return;
  for (let axis = 0; axis < 3; axis++) {
    const h = mix32(seed + (JITTER_OCTAVE + axis) * OCTAVE_SALT);
    const h2 = mix32(h ^ OFFSET_SALT);
    const g = gradientNoise3(h2, px + (h & 0xffff) / 256, py + (h >>> 16) / 256, pz + (h2 & 0xffff) / 256);
    jittered[axis] = (jittered[axis] ?? 0) + jitter * g;
  }
}

/**
 * fBm 2판: 옥타브마다 격자 원점을 옮기고 좌표를 돌린다(위 설명). 결과는 세기 합으로 나눠 대략 -1 ~ 1.
 * @param jitter 좌표 흔들기 세기(기본 격자 단위, 0이면 끔)
 */
export function offsetFbm3(
  seed: number,
  x: number,
  y: number,
  z: number,
  frequency: number,
  octaves: number,
  gain: number,
  jitter = 0,
): number {
  jitterPoint(seed, x * frequency, y * frequency, z * frequency, jitter);
  let px = jittered[0] ?? 0;
  let py = jittered[1] ?? 0;
  let pz = jittered[2] ?? 0;
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const h = mix32(seed + octave * OCTAVE_SALT);
    const h2 = mix32(h ^ OFFSET_SALT);
    sum +=
      amplitude *
      gradientNoise3(h2, px + (h & 0xffff) / 256, py + (h >>> 16) / 256, pz + (h2 & 0xffff) / 256);
    total += amplitude;
    amplitude *= gain;
    const nx = 2 * (R00 * px + R01 * py + R02 * pz);
    const ny = 2 * (R10 * px + R11 * py + R12 * pz);
    const nz = 2 * (R20 * px + R21 * py + R22 * pz);
    px = nx;
    py = ny;
    pz = nz;
  }
  return total > 0 ? sum / total : 0;
}

/** 능선 노이즈 2판: (1 - |노이즈|)²의 fBm 2판. 결과 0 ~ 1 */
export function offsetRidged3(
  seed: number,
  x: number,
  y: number,
  z: number,
  frequency: number,
  octaves: number,
  gain: number,
  jitter = 0,
): number {
  jitterPoint(seed, x * frequency, y * frequency, z * frequency, jitter);
  let px = jittered[0] ?? 0;
  let py = jittered[1] ?? 0;
  let pz = jittered[2] ?? 0;
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const h = mix32(seed + octave * OCTAVE_SALT);
    const h2 = mix32(h ^ OFFSET_SALT);
    const ridge =
      1 -
      Math.abs(gradientNoise3(h2, px + (h & 0xffff) / 256, py + (h >>> 16) / 256, pz + (h2 & 0xffff) / 256));
    sum += amplitude * ridge * ridge;
    total += amplitude;
    amplitude *= gain;
    const nx = 2 * (R00 * px + R01 * py + R02 * pz);
    const ny = 2 * (R10 * px + R11 * py + R12 * pz);
    const nz = 2 * (R20 * px + R21 * py + R22 * pz);
    px = nx;
    py = ny;
    pz = nz;
  }
  return total > 0 ? sum / total : 0;
}

/** 두 채널 노이즈 한 번의 결과(gradientNoise3Pair가 쓴다) */
const pair = new Float64Array(2);

/**
 * 격자 해시 하나로 두 채널을 낸다: 채널 A는 해시 위 4비트(28~31, gradientNoise3와 비트까지 같다), 채널 B는 그 아래
 * 4비트(24~27). 해시·보간 비용을 나눠 쓴다. 결과는 pair[0]·pair[1]. 해시는 gradientNoise3처럼 손으로 펼쳤다
 */
function gradientNoise3Pair(seed: number, x: number, y: number, z: number): void {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const dx = x - fx;
  const dy = y - fy;
  const dz = z - fz;
  const u = dx * dx * dx * (dx * (dx * 6 - 15) + 10);
  const v = dy * dy * dy * (dy * (dy * 6 - 15) + 10);
  const w = dz * dz * dz * (dz * (dz * 6 - 15) + 10);
  let h = (seed ^ Math.imul(fx, PRIME_X)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const hx0 = h >>> 0;
  h = (seed ^ Math.imul(fx + 1, PRIME_X)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const hx1 = h >>> 0;
  const y0 = Math.imul(fy, PRIME_Y);
  const y1 = Math.imul(fy + 1, PRIME_Y);
  h = (hx0 ^ y0) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const h00 = h >>> 0;
  h = (hx1 ^ y0) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const h10 = h >>> 0;
  h = (hx0 ^ y1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const h01 = h >>> 0;
  h = (hx1 ^ y1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, MIX_A);
  h ^= h >>> 15;
  h = Math.imul(h, MIX_B);
  h ^= h >>> 16;
  const h11 = h >>> 0;
  const z0 = Math.imul(fz, PRIME_Z);
  const z1 = Math.imul(fz + 1, PRIME_Z);
  // 격자점 여덟 개: 채널 A는 해시 위 4비트(28~31), B는 그 아래 4비트(24~27)로 고른 기울기와 내적
  let c = 0;
  let k = 0;
  c = Math.imul(h00 ^ z0, CORNER);
  k = c >>> 28;
  const a000 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * dz;
  k = (c >>> 24) & 15;
  const b000 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * dz;
  c = Math.imul(h10 ^ z0, CORNER);
  k = c >>> 28;
  const a100 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * dz;
  k = (c >>> 24) & 15;
  const b100 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * dz;
  c = Math.imul(h01 ^ z0, CORNER);
  k = c >>> 28;
  const a010 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * dz;
  k = (c >>> 24) & 15;
  const b010 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * dz;
  c = Math.imul(h11 ^ z0, CORNER);
  k = c >>> 28;
  const a110 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * dz;
  k = (c >>> 24) & 15;
  const b110 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * dz;
  c = Math.imul(h00 ^ z1, CORNER);
  k = c >>> 28;
  const a001 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  k = (c >>> 24) & 15;
  const b001 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  c = Math.imul(h10 ^ z1, CORNER);
  k = c >>> 28;
  const a101 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  k = (c >>> 24) & 15;
  const b101 = (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * dy + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  c = Math.imul(h01 ^ z1, CORNER);
  k = c >>> 28;
  const a011 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  k = (c >>> 24) & 15;
  const b011 = (GRADIENT_X[k] ?? 0) * dx + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  c = Math.imul(h11 ^ z1, CORNER);
  k = c >>> 28;
  const a111 =
    (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  k = (c >>> 24) & 15;
  const b111 =
    (GRADIENT_X[k] ?? 0) * (dx - 1) + (GRADIENT_Y[k] ?? 0) * (dy - 1) + (GRADIENT_Z[k] ?? 0) * (dz - 1);
  const ax00 = a000 + u * (a100 - a000);
  const ax10 = a010 + u * (a110 - a010);
  const ax01 = a001 + u * (a101 - a001);
  const ax11 = a011 + u * (a111 - a011);
  const av0 = ax00 + v * (ax10 - ax00);
  const av1 = ax01 + v * (ax11 - ax01);
  pair[0] = av0 + w * (av1 - av0);
  const bx00 = b000 + u * (b100 - b000);
  const bx10 = b010 + u * (b110 - b010);
  const bx01 = b001 + u * (b101 - b001);
  const bx11 = b011 + u * (b111 - b011);
  const bv0 = bx00 + v * (bx10 - bx00);
  const bv1 = bx01 + v * (bx11 - bx01);
  pair[1] = bv0 + w * (bv1 - bv0);
}

/**
 * 두 채널 fBm 2판: 같은 격자(원점·회전·흔들기)에서 서로 다른 기울기로 두 노이즈를 낸다. out[0] = 채널 A
 * (같은 인자의 offsetFbm3와 비트까지 같다), out[1] = 채널 B(A와 거의 무관). 두 노이즈를 따로 부르는 것보다 싸다
 */
export function offsetFbm3Pair(
  seed: number,
  x: number,
  y: number,
  z: number,
  frequency: number,
  octaves: number,
  gain: number,
  jitter: number,
  out: Float64Array,
): void {
  jitterPoint(seed, x * frequency, y * frequency, z * frequency, jitter);
  let px = jittered[0] ?? 0;
  let py = jittered[1] ?? 0;
  let pz = jittered[2] ?? 0;
  let sumA = 0;
  let sumB = 0;
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const h = mix32(seed + octave * OCTAVE_SALT);
    const h2 = mix32(h ^ OFFSET_SALT);
    gradientNoise3Pair(h2, px + (h & 0xffff) / 256, py + (h >>> 16) / 256, pz + (h2 & 0xffff) / 256);
    sumA += amplitude * (pair[0] ?? 0);
    sumB += amplitude * (pair[1] ?? 0);
    total += amplitude;
    amplitude *= gain;
    const nx = 2 * (R00 * px + R01 * py + R02 * pz);
    const ny = 2 * (R10 * px + R11 * py + R12 * pz);
    const nz = 2 * (R20 * px + R21 * py + R22 * pz);
    px = nx;
    py = ny;
    pz = nz;
  }
  out[0] = total > 0 ? sumA / total : 0;
  out[1] = total > 0 ? sumB / total : 0;
}

/** 옥타브 octaves개의 세기 합(1 + gain + gain² + …, fBm 함수들이 나누는 값과 같은 순서로 더한다) */
export function amplitudeSum(gain: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  for (let octave = 0; octave < octaves; octave++) {
    sum += amplitude;
    amplitude *= gain;
  }
  return sum;
}

/**
 * 해상도에 맞는 옥타브 수: 가장 높은 옥타브의 격자 간격이 칸 2개보다 작아지지 않게(그보다 잘면 칸 하나가 못 담는다).
 * 낮은 옥타브는 해상도와 무관하게 같아서, 작은 면 레벨(미리보기)도 큰 모양이 같다.
 */
export function octavesFor(baseFrequency: number, cellAngle: number, maxOctaves: number): number {
  const highest = 1 / (2 * cellAngle);
  let octaves = 1;
  for (let f = baseFrequency * 2; f <= highest && octaves < maxOctaves; f *= 2) octaves++;
  return octaves;
}
