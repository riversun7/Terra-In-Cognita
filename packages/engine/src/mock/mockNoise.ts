// [임시] 가짜 행성용 3차원 노이즈 — 격자점 기울기 노이즈(개선 펄린 방식) + 겹쳐 쌓기(fBm). 진짜 생성기는 packages/planet이 만든다.
// 덧셈·곱셈·정수 해시(Math.imul)만 쓴다(초월함수 없음): 같은 시드·좌표면 어느 기기에서나 같은 값이다.
// 구 위 방향(x, y, z)에 바로 쓴다(면 이음매·극 찌그러짐이 없다).
// 가짜 행성은 면 레벨 F의 모든 칸(지구 크기 157만 칸)을 만든다. 그래서 격자점 8개 계산을 풀어 썼다
// (안쪽 함수·호출을 없앴다. 값은 풀기 전과 비트까지 같다 — 같은 해시·기울기·보간 순서).

/** 격자점 (x, y, z)의 32비트 해시 */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

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
  // 부드러운 보간 계수 6t⁵ − 15t⁴ + 10t³
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  const x1 = xi + 1;
  const y1 = yi + 1;
  const z1 = zi + 1;
  const xg = xf - 1;
  const yg = yf - 1;
  const zg = zf - 1;
  const g000 = gradient(hash3(xi, yi, zi, seed), xf, yf, zf);
  const g100 = gradient(hash3(x1, yi, zi, seed), xg, yf, zf);
  const g010 = gradient(hash3(xi, y1, zi, seed), xf, yg, zf);
  const g110 = gradient(hash3(x1, y1, zi, seed), xg, yg, zf);
  const g001 = gradient(hash3(xi, yi, z1, seed), xf, yf, zg);
  const g101 = gradient(hash3(x1, yi, z1, seed), xg, yf, zg);
  const g011 = gradient(hash3(xi, y1, z1, seed), xf, yg, zg);
  const g111 = gradient(hash3(x1, y1, z1, seed), xg, yg, zg);
  const x00 = g000 + (g100 - g000) * u;
  const x10 = g010 + (g110 - g010) * u;
  const x01 = g001 + (g101 - g001) * u;
  const x11 = g011 + (g111 - g011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1v = x01 + (x11 - x01) * v;
  return y0 + (y1v - y0) * w;
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
