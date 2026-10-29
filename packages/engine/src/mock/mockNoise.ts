// [임시] 가짜 행성용 3차원 노이즈 — 격자점 기울기 노이즈(개선 펄린 방식) + 겹쳐 쌓기(fBm). 진짜 생성기는 packages/planet이 만든다.
// 덧셈·곱셈·정수 해시(Math.imul)만 쓴다(초월함수 없음): 같은 시드·좌표면 어느 기기에서나 같은 값이다.
// 구 위 방향(x, y, z)에 바로 쓴다(면 이음매·극 찌그러짐이 없다).

/** 격자점 (x, y, z)의 32비트 해시 */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 부드러운 보간 계수 6t⁵ − 15t⁴ + 10t³ */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 해시 아래 4비트로 고른 12방향 기울기와 (x, y, z)의 내적 */
function gradient(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** 기울기 노이즈 한 겹: 약 −1 ~ 1 */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);
  const g = (dx: number, dy: number, dz: number): number =>
    gradient(hash3(xi + dx, yi + dy, zi + dz, seed), xf - dx, yf - dy, zf - dz);
  const x00 = lerp(g(0, 0, 0), g(1, 0, 0), u);
  const x10 = lerp(g(0, 1, 0), g(1, 1, 0), u);
  const x01 = lerp(g(0, 0, 1), g(1, 0, 1), u);
  const x11 = lerp(g(0, 1, 1), g(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/** 여러 겹(주파수 두 배, 세기 gain배)을 더한다. 첫 겹 세기 1로 나눈 값: 약 −1 ~ 1 */
export function fbm3(x: number, y: number, z: number, seed: number, octaves: number, gain = 0.5): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += noise3(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * amplitude;
    total += amplitude;
    amplitude *= gain;
    frequency *= 2;
  }
  return sum / total;
}
