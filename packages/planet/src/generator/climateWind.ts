// 기후 바람장(생성 4단계 일부, climate.ts가 쓴다) — 위도 띠 바람, 굽이, 바람이 오는 이웃
// - 바람(출력 판 3): 위도 띠 바람(무역풍·편서풍·극동풍) + 방향이 천천히 바뀌는 굽이 성분(노이즈 2판 각도, 세기 0.3).
//   어디서도 0.2 밑으로 약해지지 않는다(멈추는 위도가 없다).
// - 바람이 오는 이웃: 칸마다 바람이 오는 방향을 가장 잘 끼는 이웃 둘 중 하나를 칸 해시로 고른다(두 이웃 방향으로 바람을
//   나눈 몫이 확률). 그래서 바람길이 격자선을 따라 곧게 뻗지 않는다.
import { detCos, detSin } from "@terra/shared";
import { type PlanetGrid, neighbors8 } from "./grid.ts";
import { offsetFbm3Pair } from "./noise.ts";
import { mix32 } from "./random.ts";

const RADIANS_PER_DEGREE = Math.PI / 180;

/** 바람 굽이: 세기(띠 바람 최대 약 1에 더한다), 각도 노이즈(노이즈 2판 채널 B, 해상도와 무관하게 옥타브 고정) */
const WIND_MEANDER = 0.3;
const WIND_FREQUENCY = 1.6;
const WIND_OCTAVES = 2;
/** 가장 약한 바람: 이보다 약하면 굽이 방향으로 이 세기 */
const MIN_WIND_SPEED = 0.2;
/** 바람이 오는 이웃: 가장 잘 맞는 이웃의 방향 cos가 이보다 커야 한다(아니면 습기 길이 끊긴다) */
const UPWIND_MIN_SCORE = 0.3;

/** 위도(도, 북 +) → 바람(동쪽 성분 u, 북쪽 성분 v). 단위는 상대값(최대 약 1) */
export function windAt(latitudeDegrees: number): { u: number; v: number } {
  const a = Math.abs(latitudeDegrees);
  const toward = latitudeDegrees < 0 ? -1 : 1;
  if (a < 30) {
    // 무역풍: 동쪽에서 불어오고(u < 0) 적도 쪽으로
    return { u: -detCos(3 * a * RADIANS_PER_DEGREE), v: -toward * 0.35 * detSin(6 * a * RADIANS_PER_DEGREE) };
  }
  if (a < 60) {
    // 편서풍: 서쪽에서 불어오고(u > 0) 극 쪽으로
    const s = detSin(6 * (a - 30) * RADIANS_PER_DEGREE);
    return { u: s, v: toward * 0.3 * s };
  }
  // 극동풍
  const s = detSin(6 * (a - 60) * RADIANS_PER_DEGREE);
  return { u: -0.6 * s, v: -toward * 0.2 * s };
}

/** 바람 굽이 노이즈 두 채널(A는 2단계 위도 흔들기에 남겨 둔다, B = 굽이 각도). 한 스레드 안에서만 쓰는 임시 칸 */
const windNoise = new Float64Array(2);

/**
 * 칸 위치의 바람(동쪽 u, 북쪽 v): 위도 띠 바람 + WIND_MEANDER × (cos θ, sin θ), θ = 4π × 노이즈 2판 채널 B.
 * 세기가 MIN_WIND_SPEED보다 작으면 θ 방향으로 그 세기다(멈추는 곳이 없다).
 * @param windSeed streamSeed(시드, STREAM_WIND)
 * @param x 단위 구 위 점(돌리지 않은 좌표, z = 자전축)
 */
export function windVectorAt(
  windSeed: number,
  x: number,
  y: number,
  z: number,
  latitudeDegrees: number,
): { u: number; v: number } {
  offsetFbm3Pair(windSeed, x, y, z, WIND_FREQUENCY, WIND_OCTAVES, 0.5, 0, windNoise);
  const theta = 4 * Math.PI * (windNoise[1] ?? 0);
  const eu = detCos(theta);
  const ev = detSin(theta);
  const band = windAt(latitudeDegrees);
  const u = band.u + WIND_MEANDER * eu;
  const v = band.v + WIND_MEANDER * ev;
  if (u * u + v * v >= MIN_WIND_SPEED * MIN_WIND_SPEED) return { u, v };
  return { u: MIN_WIND_SPEED * eu, v: MIN_WIND_SPEED * ev };
}

/**
 * 바람이 오는 방향 w를 두 이웃 방향 a·b로 나눈 몫(a를 고를 확률): w ≈ α·a + β·b(2×2 최소제곱)에서 α, β를 0 이상으로
 * 자르고 α ÷ (α + β). 두 방향이 거의 나란하거나 둘 다 0이면 1(a만)
 */
export function upwindShare(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  wx: number,
  wy: number,
  wz: number,
): number {
  const aa = ax * ax + ay * ay + az * az;
  const bb = bx * bx + by * by + bz * bz;
  const ab = ax * bx + ay * by + az * bz;
  const aw = ax * wx + ay * wy + az * wz;
  const bw = bx * wx + by * wy + bz * wz;
  const determinant = aa * bb - ab * ab;
  if (!(determinant > 1e-9 * aa * bb)) return 1;
  const alpha = Math.max(0, (aw * bb - bw * ab) / determinant);
  const beta = Math.max(0, (bw * aa - aw * ab) / determinant);
  return alpha + beta > 0 ? alpha / (alpha + beta) : 1;
}

/**
 * 칸마다 바람이 오는 이웃(습기를 받는 칸). 바람이 오는 방향(−바람)과 방향 cos가 가장 큰 이웃 둘(같으면 앞 번호) 중
 * 첫째를 upwindShare 확률로 고른다(칸 번호 해시 r = mix32(windSeed ^ c·0x9e3779b1) ÷ 2³²). 첫째의 cos가
 * UPWIND_MIN_SCORE 이하이거나 바람이 없으면 자기 자신이다.
 * @param latitude 칸마다 위도(도)
 */
export function upwindNeighbors(grid: PlanetGrid, latitude: Float32Array, windSeed: number): Int32Array {
  const count = grid.cellCount;
  const upwind = new Int32Array(count);
  const out = new Int32Array(8);
  for (let c = 0; c < count; c++) {
    const x = grid.x[c] ?? 0;
    const y = grid.y[c] ?? 0;
    const z = grid.z[c] ?? 0;
    upwind[c] = c;
    const horizontal = Math.sqrt(x * x + y * y);
    if (horizontal < 1e-6) continue;
    // 동쪽 e = (−y, x, 0)/|·|, 북쪽 n = p × e
    const ex = -y / horizontal;
    const ey = x / horizontal;
    const nx = -z * ey;
    const ny = z * ex;
    const nz = x * ey - y * ex;
    const { u, v } = windVectorAt(windSeed, x, y, z, latitude[c] ?? 0);
    // 바람이 오는 쪽 = −바람
    const wx = -(u * ex + v * nx);
    const wy = -(u * ey + v * ny);
    const wz = -v * nz;
    const strength = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (strength < 1e-9) continue;
    neighbors8(grid, c, out);
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let second = -1;
    let secondScore = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next < 0) continue;
      const dx = (grid.x[next] ?? 0) - x;
      const dy = (grid.y[next] ?? 0) - y;
      const dz = (grid.z[next] ?? 0) - z;
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const score = (dx * wx + dy * wy + dz * wz) / (length * strength);
      if (score > bestScore) {
        second = best;
        secondScore = bestScore;
        best = next;
        bestScore = score;
      } else if (score > secondScore) {
        second = next;
        secondScore = score;
      }
    }
    if (best < 0 || !(bestScore > UPWIND_MIN_SCORE)) continue;
    upwind[c] = best;
    if (second < 0 || !(secondScore > 0)) continue;
    const share = upwindShare(
      (grid.x[best] ?? 0) - x,
      (grid.y[best] ?? 0) - y,
      (grid.z[best] ?? 0) - z,
      (grid.x[second] ?? 0) - x,
      (grid.y[second] ?? 0) - y,
      (grid.z[second] ?? 0) - z,
      wx,
      wy,
      wz,
    );
    if (mix32(windSeed ^ Math.imul(c, 0x9e3779b1)) / 4_294_967_296 >= share) upwind[c] = second;
  }
  return upwind;
}
