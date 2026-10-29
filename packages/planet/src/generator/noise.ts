// 3차원 그라디언트 노이즈(개선 펄린 방식)와 fBm·능선 노이즈 — 구 위 점(단위 벡터 × 주파수)에서 계산한다.
// 이음매·극 찌그러짐이 없다(PLAN 5.3). 격자점 기울기는 정수 해시로 고르고, 사칙연산과 Math.floor만 쓴다.
// 기울기 12개(정육면체 모서리 방향)와 보간 6t⁵ − 15t⁴ + 10t³은 Ken Perlin의 개선 노이즈(2002) 방식이다.
import { mix32 } from "./random.ts";

const PRIME_X = 0x9e3779b1;
const PRIME_Y = 0x85ebca77;
const PRIME_Z = 0xc2b2ae3d;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// 기울기 표: 해시 아래 4비트(0~15) → 기울기 (GX, GY, GZ). 정육면체 모서리 방향 12개 + 겹치는 4개(12~15 = 0·1·9·11번).
// 분기 없이 표로 읽는다(switch보다 빠르다). 값은 예전 switch와 같아서 결과가 비트까지 같다(골든 해시·실수 지문 시험)
const GRADIENT_X = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, -1, 0, 0]);
const GRADIENT_Y = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, 1, -1, -1]);
const GRADIENT_Z = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 0, 1, -1]);

/** 해시 아래 4비트로 고른 기울기와 (x, y, z)의 내적 */
function gradDot(hash: number, x: number, y: number, z: number): number {
  const k = hash & 15;
  return (GRADIENT_X[k] ?? 0) * x + (GRADIENT_Y[k] ?? 0) * y + (GRADIENT_Z[k] ?? 0) * z;
}

/** 격자점 (x, y, z) 해시의 마지막 단계: 위 4비트만 쓰므로 곱 한 번으로 충분하다 */
function cornerHash(partial: number, iz: number): number {
  return Math.imul(partial ^ Math.imul(iz, PRIME_Z), 0x27d4eb2d) >>> 28;
}

/** 3차원 그라디언트 노이즈. 결과는 대략 -1 ~ 1, 격자점에서 0 */
export function gradientNoise3(seed: number, x: number, y: number, z: number): number {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const dx = x - fx;
  const dy = y - fy;
  const dz = z - fz;
  const u = fade(dx);
  const v = fade(dy);
  const w = fade(dz);
  const hx0 = mix32(seed ^ Math.imul(fx, PRIME_X));
  const hx1 = mix32(seed ^ Math.imul(fx + 1, PRIME_X));
  const h00 = mix32(hx0 ^ Math.imul(fy, PRIME_Y));
  const h10 = mix32(hx1 ^ Math.imul(fy, PRIME_Y));
  const h01 = mix32(hx0 ^ Math.imul(fy + 1, PRIME_Y));
  const h11 = mix32(hx1 ^ Math.imul(fy + 1, PRIME_Y));
  const g000 = gradDot(cornerHash(h00, fz), dx, dy, dz);
  const g100 = gradDot(cornerHash(h10, fz), dx - 1, dy, dz);
  const g010 = gradDot(cornerHash(h01, fz), dx, dy - 1, dz);
  const g110 = gradDot(cornerHash(h11, fz), dx - 1, dy - 1, dz);
  const g001 = gradDot(cornerHash(h00, fz + 1), dx, dy, dz - 1);
  const g101 = gradDot(cornerHash(h10, fz + 1), dx - 1, dy, dz - 1);
  const g011 = gradDot(cornerHash(h01, fz + 1), dx, dy - 1, dz - 1);
  const g111 = gradDot(cornerHash(h11, fz + 1), dx - 1, dy - 1, dz - 1);
  const x00 = g000 + u * (g100 - g000);
  const x10 = g010 + u * (g110 - g010);
  const x01 = g001 + u * (g101 - g001);
  const x11 = g011 + u * (g111 - g011);
  const y0 = x00 + v * (x10 - x00);
  const y1 = x01 + v * (x11 - x01);
  return y0 + w * (y1 - y0);
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
