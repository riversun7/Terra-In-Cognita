// 기후 바람장(생성 4단계 일부, climate.ts가 쓴다) — 위도 띠 바람, 굽이, 기후 위도(흔든 위도), 바람이 오는 이웃
// - 바람(출력 판 3): 위도 띠 바람(무역풍·편서풍·극동풍) + 방향이 천천히 바뀌는 굽이 성분(노이즈 2판 각도, 세기 0.3).
//   어디서도 0.2 밑으로 약해지지 않는다(멈추는 위도가 없다).
// - 기후 위도(출력 판 3, 다양성 고침 2단계): 위도 + 4° × 바람 노이즈 채널 A(표준편차 1로 맞춤). 75°부터 극까지 흔들기를
//   0으로 줄인다(극에서는 흔든 위도가 90°를 넘지 못해 따뜻한 쪽으로만 치우친다). 바람 띠·기온 띠·위도 띠 강수가 모두 이
//   위도를 따라 굽이친다(띠 경계가 위도선이 아니다). 굽이 각도(채널 B)는 1단계 그대로다: 노이즈 한 번으로 둘 다 낸다.
// - 바람이 오는 이웃: 칸마다 바람이 오는 방향을 가장 잘 끼는 이웃 둘 중 하나를 칸 해시로 고른다(두 이웃 방향으로 바람을
//   나눈 몫이 확률). 그래서 바람길이 격자선을 따라 곧게 뻗지 않는다.
import { detCos, detSin } from "@terra/shared";
import { type PlanetGrid, neighbors8 } from "./grid.ts";
import { NOISE_JITTER, type NoiseSetup, offsetFbm3Pair } from "./noise.ts";
import { mix32 } from "./random.ts";
import { clamp, smoothstep } from "./util.ts";

const RADIANS_PER_DEGREE = Math.PI / 180;

/** 바람 굽이 세기(띠 바람 최대 약 1에 더한다) */
const WIND_MEANDER = 0.3;
/** 바람 노이즈: 노이즈 2판 두 채널(A = 위도 흔들기, B = 굽이 각도), 해상도와 무관하게 옥타브 고정 */
export const WIND_NOISE: NoiseSetup = {
  name: "wind",
  frequency: 1.6,
  octaves: 2,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "pair",
};
/** 가장 약한 바람: 이보다 약하면 굽이 방향으로 이 세기 */
const MIN_WIND_SPEED = 0.2;
/** 바람이 오는 이웃: 가장 잘 맞는 이웃의 방향 cos가 이보다 커야 한다(아니면 습기 길이 끊긴다) */
const UPWIND_MIN_SCORE = 0.3;
/** 위도 흔들기: 바람 노이즈 채널 A 표준편차 하나가 이만큼(도). 이 위도부터 극까지 흔들기를 0으로 줄인다 */
const LATITUDE_WARP = 4;
const LATITUDE_WARP_TAPER = 75;
/**
 * 바람 노이즈(WIND_NOISE) 채널의 표준편차: F6 칸(면적 가중) × 시드 64개 × 두 채널로 잰 값 0.2007(흔들기 0),
 * 0.1995(흔들기 0.8)(2026-10-29). 노이즈 식이나 주파수·옥타브를 바꾸면 다시 잰다
 */
const WIND_NOISE_SD = 0.2;

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

/** 바람 노이즈 두 채널(A = 위도 흔들기, B = 굽이 각도). 한 스레드 안에서만 쓰는 임시 칸 */
const windNoise = new Float64Array(2);
/** windAndLatitude 결과 [u, v, 기후 위도]. 한 스레드 안에서만 쓰는 임시 칸 */
const windResult = new Float64Array(3);

/**
 * 칸 위치의 바람과 기후 위도를 windResult에 쓴다. 노이즈 2판 두 채널 한 번(WIND_NOISE: 주파수 1.6, 2옥타브):
 * 기후 위도 = 위도 + LATITUDE_WARP × A ÷ WIND_NOISE_SD × (1 − smoothstep(75°, 90°, |위도|)), ±90°로 자른다.
 * 바람 = 기후 위도의 띠 바람 + WIND_MEANDER × (cos θ, sin θ), θ = 4π × B. 세기가 MIN_WIND_SPEED보다 작으면 θ 방향으로
 * 그 세기다(멈추는 곳이 없다).
 */
function windAndLatitude(windSeed: number, x: number, y: number, z: number, latitudeDegrees: number): void {
  const { frequency, octaves, gain, jitter } = WIND_NOISE;
  offsetFbm3Pair(windSeed, x, y, z, frequency, octaves, gain, jitter, windNoise);
  const taper = 1 - smoothstep(LATITUDE_WARP_TAPER, 90, Math.abs(latitudeDegrees));
  const warp = ((LATITUDE_WARP * (windNoise[0] ?? 0)) / WIND_NOISE_SD) * taper;
  const latitude = clamp(latitudeDegrees + warp, -90, 90);
  const theta = 4 * Math.PI * (windNoise[1] ?? 0);
  const eu = detCos(theta);
  const ev = detSin(theta);
  const band = windAt(latitude);
  let u = band.u + WIND_MEANDER * eu;
  let v = band.v + WIND_MEANDER * ev;
  if (u * u + v * v < MIN_WIND_SPEED * MIN_WIND_SPEED) {
    u = MIN_WIND_SPEED * eu;
    v = MIN_WIND_SPEED * ev;
  }
  windResult[0] = u;
  windResult[1] = v;
  windResult[2] = latitude;
}

/**
 * 칸 위치의 바람(동쪽 u, 북쪽 v): 기후 위도의 띠 바람 + 굽이(windAndLatitude).
 * @param windSeed streamSeed(시드, STREAM_WIND)
 * @param x 단위 구 위 점(돌리지 않은 좌표, z = 자전축)
 * @param latitudeDegrees 지리 위도(도). 흔들기는 이 함수가 한다
 */
export function windVectorAt(
  windSeed: number,
  x: number,
  y: number,
  z: number,
  latitudeDegrees: number,
): { u: number; v: number } {
  windAndLatitude(windSeed, x, y, z, latitudeDegrees);
  return { u: windResult[0] ?? 0, v: windResult[1] ?? 0 };
}

/** 칸 위치의 기후 위도(도): 바람 띠·기온 띠·위도 띠 강수가 쓰는 흔든 위도(windAndLatitude). 인자는 windVectorAt과 같다 */
export function climateLatitudeAt(
  windSeed: number,
  x: number,
  y: number,
  z: number,
  latitudeDegrees: number,
): number {
  windAndLatitude(windSeed, x, y, z, latitudeDegrees);
  return windResult[2] ?? latitudeDegrees;
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
 * @param latitude 칸마다 지리 위도(도)
 * @param climateLatitude 있으면 칸마다 기후 위도(도)를 쓴다. latitude와 같은 배열이어도 된다(칸마다 자기 값만 읽는다)
 */
export function upwindNeighbors(
  grid: PlanetGrid,
  latitude: Float32Array,
  windSeed: number,
  climateLatitude?: Float32Array,
): Int32Array {
  const count = grid.cellCount;
  const upwind = new Int32Array(count);
  const out = new Int32Array(8);
  for (let c = 0; c < count; c++) {
    const x = grid.x[c] ?? 0;
    const y = grid.y[c] ?? 0;
    const z = grid.z[c] ?? 0;
    upwind[c] = c;
    windAndLatitude(windSeed, x, y, z, latitude[c] ?? 0);
    if (climateLatitude) climateLatitude[c] = windResult[2] ?? 0;
    const horizontal = Math.sqrt(x * x + y * y);
    if (horizontal < 1e-6) continue;
    // 동쪽 e = (−y, x, 0)/|·|, 북쪽 n = p × e
    const ex = -y / horizontal;
    const ey = x / horizontal;
    const nx = -z * ey;
    const ny = z * ex;
    const nz = x * ey - y * ex;
    const u = windResult[0] ?? 0;
    const v = windResult[1] ?? 0;
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
