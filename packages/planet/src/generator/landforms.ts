// 생성 1단계의 지형 틀(출력 판 3, 다양성 고침 3단계, ADR 2026-10-29-planet-generator-variety) — tectonics.ts가 쓴다.
// 판·대륙 배치를 정하는 1판 노이즈(판 흔들기·대륙성·기복)는 그대로 두고, 그 위에 노이즈 2판(옥타브마다 격자 옮기기·
// 회전·좌표 흔들기 NOISE_JITTER, noise.ts)으로 높이를 더한다. 좌표는 무늬 공간(돌린 격자), 높이는 실제 환산 m, 거리는
// 구 위 각도. 노이즈 설정은 NoiseSetup 하나씩이고(LANDFORM_NOISES) 부르는 곳이 그 값을 그대로 쓴다.
// - 대륙 안쪽 고원·분지: 해안에서 떨어진 대륙 지각에 고원(최대 +1000m, 기온 약 −6.5°C)과 얕은 분지(최대 −250m).
//   더운 대륙 안쪽에 시원한(그래서 습도가 높은) 섬이 생기고, 분지에는 호수·마른 분지가 생긴다.
// - 해안 잔 모양: 해안선을 짧은 파장 노이즈(격자 약 160km, F9에서 약 40km까지)만큼 앞뒤로 옮겨 거칠게 하고
//   만·곶·섬을 만든다. 칸이 그 격자의 반보다 크면(F ≤ 6) 끈다(미리보기가 얼룩지지 않게).
// - 구릉: 대륙 안쪽에 능선 노이즈 2판(격자 약 640km ~ 160km)으로 낮은 구릉(최대 +350m). 지역마다 많고 적다.
// - 산맥 단면: 경계를 따라 바뀌는 두 채널 노이즈(격자 약 1,600km, 2옥타브)로 산맥 앞면 위치, 안데스형 혹의 중심·폭,
//   충돌 산맥의 폭을 바꾼다. 경계를 따라 바뀌는 세기(높은 산괴·낮은 고개)도 출력 판 2보다 크게 바뀐다.
// - 봉우리 다듬기: 8,000m 위는 부드럽게 눌러 10,000m를 넘지 않게(고원·구릉 위에 산맥이 겹쳐도).
import { detExp } from "@terra/shared";
import { type PlanetGrid, neighbors8 } from "./grid.ts";
import {
  NOISE_JITTER,
  type NoiseSetup,
  amplitudeSum,
  octavesFor,
  offsetFbm3,
  offsetFbm3Pair,
  offsetRidged3,
} from "./noise.ts";
import { distanceField } from "./queues.ts";
import { cornerSeaMask, oceanComponents } from "./seaLevel.ts";
import { REFERENCE_RADIUS_KM, areaPercentile, clamp, km, smoothstep } from "./util.ts";

// ── 대륙 안쪽 고원·분지 ──
/** 고원·분지 노이즈: 주파수 3.2(격자 약 2,000km)에서 4옥타브(약 250km), 해상도와 무관하게 고정 */
const HIGHLAND_NOISE: NoiseSetup = {
  name: "highland",
  frequency: 3.2,
  octaves: 4,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "fbm",
};
/** 고원 높이·분지 깊이(실제 환산 m). 노이즈(표준편차 약 0.17)가 0.02 → 0.16이면 고원, −0.05 → −0.2면 분지 */
export const HIGHLAND_RISE_M = 1000;
export const BASIN_DEPTH_M = 250;
/**
 * 극 쪽 고원 줄이기: 자전축 성분 |z|가 0.82(위도 약 55°)에서 0.97(약 76°)로 가며 고원 높이에서 이 몫을 뺀다.
 * 극 쪽 고원은 기온을 낮춰 빙상을 늘린다. F7 시드 1·42·팩 땅 빙상(Verified): 0이면 27.1·15.2·21.0%(출력 판 2
 * 23.9·13.8·13.9%), 0.5면 26.8·13.9·20.1%, 0.7이면 26.5·13.2·19.8%. 줄인 만큼 툰드라가 는다(0.5: +0.4·+1.2·+0.7%p)
 */
const HIGHLAND_POLAR_TAPER = 0.5;
/** 안쪽 정도: 대륙 지각 순위가 해안(대륙붕 끝 순위) + 0.04에서 0, + 0.30에서 1 */
const INLAND_START = 0.04;
const INLAND_FULL = 0.3;

/** 대륙 칸의 안쪽 정도(0 ~ 1). rank = 대륙성 면적 순위, shelfRank = 대륙붕 몫(그보다 낮으면 바다 밑 대륙붕) */
export function inlandWeight(rank: number, shelfRank: number): number {
  return smoothstep(shelfRank + INLAND_START, shelfRank + INLAND_FULL, rank);
}

/**
 * 고원(+)·분지(−) 높이(실제 환산 m, 안쪽 정도·기복 설정을 곱하기 전). (x, y, z)는 무늬 공간, polarZ는 자전축 성분
 * (돌리지 않은 격자의 z, 기후와 같은 축)
 */
export function interiorRelief(seed: number, x: number, y: number, z: number, polarZ: number): number {
  const { frequency, octaves, gain, jitter } = HIGHLAND_NOISE;
  const n = offsetFbm3(seed, x, y, z, frequency, octaves, gain, jitter);
  const polar = 1 - HIGHLAND_POLAR_TAPER * smoothstep(0.82, 0.97, Math.abs(polarZ));
  return HIGHLAND_RISE_M * polar * smoothstep(0.02, 0.16, n) - BASIN_DEPTH_M * smoothstep(0.05, 0.2, -n);
}

// ── 구릉(중간 크기 기복) ──
/** 구릉 노이즈: 능선 노이즈 2판, 주파수 10(격자 약 640km)에서 3옥타브(약 160km), 능선 쪽만 구릉이 된다 */
const HILL_NOISE: NoiseSetup = {
  name: "hill ridges",
  frequency: 10,
  octaves: 3,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "ridged",
};
/** 구릉 높이(실제 환산 m): 능선 값 0.45 → 0.9에서 0 → 이 값(문턱이 높으면 가는 주름처럼 보인다, 2026-10-29 그림) */
export const HILL_RISE_M = 350;
const HILL_START = 0.45;
const HILL_FULL = 0.9;
/** 구릉이 많은 곳·평평한 곳: 지역 노이즈(주파수 2, 2옥타브, 표준편차 0.2)가 −0.1 → 0.15면 0 → 1 */
const HILL_REGION_NOISE: NoiseSetup = {
  name: "hill region",
  frequency: 2,
  octaves: 2,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "fbm",
};
const HILL_REGION_LOW = -0.1;
const HILL_REGION_HIGH = 0.15;
/** 구릉 노이즈 시드: 고원 시드 + 이 값(지역 노이즈는 + 1 더) */
const HILL_SEED_OFFSET = 2;

/** 구릉 높이(실제 환산 m, 안쪽 정도·기복 설정을 곱하기 전). octaves = hillOctaves(칸 크기) */
export function hillRelief(seed: number, x: number, y: number, z: number, octaves: number): number {
  const region = HILL_REGION_NOISE;
  const regional = offsetFbm3(
    seed + HILL_SEED_OFFSET + 1,
    x,
    y,
    z,
    region.frequency,
    region.octaves,
    region.gain,
    region.jitter,
  );
  const amount = smoothstep(HILL_REGION_LOW, HILL_REGION_HIGH, regional);
  if (!(amount > 0)) return 0;
  const { frequency, gain, jitter } = HILL_NOISE;
  const ridge = offsetRidged3(seed + HILL_SEED_OFFSET, x, y, z, frequency, octaves, gain, jitter);
  return HILL_RISE_M * amount * smoothstep(HILL_START, HILL_FULL, ridge);
}

/** 구릉 노이즈 옥타브 수(해상도에 맞게, 3개까지) */
export function hillOctaves(cellAngle: number): number {
  return octavesFor(HILL_NOISE.frequency, cellAngle, HILL_NOISE.octaves);
}

// ── 해안 잔 모양 ──
// 해안선을 노이즈만큼 앞뒤로 옮긴다(해안선 흔들기): 임시 해수면(육지 비율 백분위)에서 진짜 바다(classifyOcean과 같은
// 규칙: 넓거나 꼭짓점을 품은 해수면 아래 덩어리)와 그 밖(땅, 바다와 이어지지 않은 낮은 웅덩이 포함)을 나누고, 칸마다
// 해안선까지의 부호 있는 거리(땅 +, 바다 −) + 옮김 거리 × 노이즈의 부호로 새 땅·바다를 정한다. 그래서 만·곶·섬이 노이즈
// 크기의 덩어리로 생기고, 해안이 평평하든 가파르든 같은 거리만큼 굽는다.
// - 옮김 거리는 지역마다 다르다(낮은 주파수 노이즈 × 0.15 ~ 2): 매끈한 해안과 들쭉날쭉한 해안이 섞인다.
// - 바뀌는 칸은 낮은 해안 땅(해수면 + 300m 아래)과 얕은 바다(−300m 위)뿐이다: 산맥 해안·깊은 바다·꼭짓점 둘레는 그대로다.
// - 해안선은 진짜 바다와 맞닿은 곳뿐이다: 웅덩이 가장자리는 흔들지 않는다.
// - 땅 → 바다는 진짜 바다 중 땅이 되지 않는 칸과 (바뀐 칸을 거쳐) 이어질 때만 바꾼다(만·후미). 바다 → 땅은 그대로(곶·섬).
// - 바꾼 뒤 해수면 백분위를 다시 재고 바다를 다시 판정해서, 바다가 되지 못한 새 바다 칸(웅덩이와만 이어지거나 해수면이
//   움직여 끊긴 만)은 원래 높이로 되돌린다. 되돌릴 칸이 없을 때까지 되풀이한다. 그래서 바다 판정(classifyOcean)이 같은
//   높이에서 새 바다 칸을 모두 바다로 본다(시험). 땅 안에 구멍(웅덩이 → 호수)처럼 박힌 새 바다가 없다.
// - 바뀐 칸의 높이는 새 해안선에서 완만하게(0.5m/km) 오르내린다. 그 밖의 칸은 그대로라 해안 평야에 새 웅덩이가 없다.
// 높이에 노이즈를 그대로 더하면 해안선이 거의 움직이지 않거나(가파른 해안), 평평한 해안 평야에 작은 호수가 잔뜩
// 생긴다(Verified: F7·F9 팩 시드, 해안 칸 기울기 중앙값 1.3m/km).
/** 해안 노이즈: 주파수 40(격자 약 160km), 옥타브는 해상도에 맞게 3개까지(F7 1, F8 2, F9 3, F9 가장 잔 격자 약 40km) */
const COAST_NOISE: NoiseSetup = {
  name: "coast",
  frequency: 40,
  octaves: 3,
  gain: 0.65,
  jitter: NOISE_JITTER,
  kind: "fbm",
};
/** 3옥타브 노이즈의 표준편차(F6 칸 × 시드 32개, 잰 값): 노이즈를 표준편차 1로 맞춘다 */
const COAST_SD = 0.165;
/** 해안선을 옮기는 거리(노이즈 표준편차 1당, 실제 환산). 지역 배율과 기복 설정을 곱한다 */
export const COAST_SHIFT = km(100);
/** 지역 배율 노이즈: 주파수 2.5(격자 약 2,500km), 2옥타브, 표준편차 0.2로 나눠 1 + 0.7 × 값, 0.15 ~ 2로 자른다 */
const COAST_REGION_NOISE: NoiseSetup = {
  name: "coast region",
  frequency: 2.5,
  octaves: 2,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "fbm",
};
const COAST_REGION_SD = 0.2;
const COAST_REGION_VARIATION = 0.7;
const COAST_REGION_MIN = 0.15;
const COAST_REGION_MAX = 2;
/** 지역 배율 노이즈 시드: 해안 시드 + 이 값 */
const COAST_REGION_SEED_OFFSET = 1;
/** 해안선에서 (옮김 거리 × 가장 큰 지역 배율)의 이 배수보다 먼 칸은 바뀌지 않는다 */
const COAST_REACH = 2.5;
/** 바뀔 수 있는 칸: 임시 해수면 위 이 높이 아래의 땅, 이 깊이 위의 바다(실제 환산 m) */
const COAST_HEIGHT_LIMIT_M = 300;
const COAST_DEPTH_LIMIT_M = 300;
/**
 * 바뀐 칸의 높이: 새 해안선에서 이 기울기(실제 환산 m/km)로, 해수면에서 적어도 이만큼 떨어지게. 바꾼 뒤 다시 잰 해수면은
 * 임시 해수면에서 몇 m 움직인다(F7 시드 6개에서 +1.2 ~ +4.4m, Verified). 여유가 그보다 커야 바뀐 칸이 제 편에 남는다
 */
const COAST_NEW_SLOPE = 0.5;
const COAST_NEW_MARGIN_M = 20;
/** 바다 다시 판정 → 되돌리기를 되풀이하는 상한(보통 2번이면 되돌릴 칸이 없다) */
const COAST_CHECK_ROUNDS = 8;

/** 해안 노이즈 옥타브 수(칸이 그 격자의 반보다 크면 0 = 끈다) */
export function coastOctaves(cellAngle: number): number {
  if (1 / (2 * cellAngle) < COAST_NOISE.frequency) return 0;
  return octavesFor(COAST_NOISE.frequency, cellAngle, COAST_NOISE.octaves);
}

/** 바다 → 땅(1), 땅 → 바다 후보(2), 진짜 바다와 이어진 땅 → 바다(3) */
const FLIP_TO_LAND = 1;
const FLIP_CANDIDATE = 2;
const FLIP_TO_SEA = 3;

/**
 * 해안선을 흔든다(elevation을 고친다). 노이즈 좌표는 무늬 공간(sx, sy, sz), 거리는 8이웃 길(distanceField).
 * 칸이 해안 노이즈 격자의 반보다 크면 아무것도 하지 않는다. 바다 판정(classifyOcean) 바로 앞에 부른다: 끝에서 같은
 * 높이로 해수면·바다를 다시 재어 확인하기 때문이다(그 사이에 높이를 바꾸면 확인이 어긋난다).
 * @param landPercent 육지 비율(%): 임시 해수면 = 고도의 (100 − 이 값) 면적 백분위(seaLevel.ts와 같은 식)
 * @param rugged 기복 설정(1 = 보통): 옮김 거리에 곱한다
 */
export function roughenCoasts(
  grid: PlanetGrid,
  seed: number,
  sx: Float64Array,
  sy: Float64Array,
  sz: Float64Array,
  elevation: Float32Array,
  landPercent: number,
  rugged: number,
): void {
  const octaves = coastOctaves(grid.meanCellAngle);
  const shift = COAST_SHIFT * rugged;
  if (octaves === 0 || !(shift > 0)) return;
  const count = grid.cellCount;
  const below = 1 - landPercent / 100;
  const seaLevel = areaPercentile(grid, elevation, below);
  // 노이즈를 표준편차 1로(가장 많은 옥타브 기준: 낮은 면 레벨은 잔 옥타브만 빠진다)
  const coast = COAST_NOISE;
  const region = COAST_REGION_NOISE;
  const scale = amplitudeSum(coast.gain, octaves) / amplitudeSum(coast.gain, coast.octaves) / COAST_SD;
  const reach = COAST_REACH * COAST_REGION_MAX * shift;
  const half = grid.meanCellAngle / 2;
  // 진짜 바다(꼭짓점 둘레는 classifyOcean이 바다로 누르므로 미리 바다로 본다)와 그 밖(땅 1)
  const forced = cornerSeaMask(grid);
  const sea = oceanComponents(grid, (c) => forced[c] === 1 || (elevation[c] ?? 0) < seaLevel, forced);
  const land = new Uint8Array(count);
  const movable = new Uint8Array(count);
  for (let c = 0; c < count; c++) {
    const h = elevation[c] ?? 0;
    const isLand = sea[c] !== 1;
    land[c] = isLand ? 1 : 0;
    if (forced[c] === 1) continue;
    movable[c] = (isLand ? h - seaLevel <= COAST_HEIGHT_LIMIT_M : seaLevel - h <= COAST_DEPTH_LIMIT_M)
      ? 1
      : 0;
  }
  // 해안선까지 거리: 해안선 양쪽 칸(진짜 바다와 그 밖이 맞닿은 칸)에서 시작해 바뀔 수 있는 칸으로만 퍼진다(한 번에,
  // 높은 땅·깊은 바다로는 퍼지지 않아 싸다). 해안선 양쪽 칸 가운데는 해안선에서 반 칸이다
  const out = new Int32Array(8);
  const edge = (c: number): boolean => {
    if (movable[c] !== 1) return false;
    neighbors8(grid, c, out);
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next >= 0 && land[next] !== land[c]) return true;
    }
    return false;
  };
  const toCoast = distanceField(grid, edge, reach, (_from, to) => movable[to] === 1);
  // 바뀔 칸과 새 해안선까지의 부호 있는 거리
  const flip = new Uint8Array(count);
  const warpedDistance = new Float32Array(count);
  const regionSeed = seed + COAST_REGION_SEED_OFFSET;
  for (let c = 0; c < count; c++) {
    if ((toCoast.source[c] ?? -1) < 0) continue;
    const isLand = land[c] === 1;
    const distance = (toCoast.angle[c] ?? 0) + half;
    if (distance >= reach) continue;
    const x = sx[c] ?? 0;
    const y = sy[c] ?? 0;
    const z = sz[c] ?? 0;
    const regional =
      offsetFbm3(regionSeed, x, y, z, region.frequency, region.octaves, region.gain, region.jitter) /
      COAST_REGION_SD;
    const local = shift * clamp(1 + COAST_REGION_VARIATION * regional, COAST_REGION_MIN, COAST_REGION_MAX);
    if (distance >= COAST_REACH * local) continue;
    const noise = offsetFbm3(seed, x, y, z, coast.frequency, octaves, coast.gain, coast.jitter);
    const warped = (isLand ? distance : -distance) + local * scale * noise;
    if (warped > 0 === isLand) continue;
    flip[c] = isLand ? FLIP_CANDIDATE : FLIP_TO_LAND;
    warpedDistance[c] = warped;
  }
  // 땅 → 바다 후보는 진짜 바다 중 땅이 되지 않는 칸과 이어진 것만(8이웃, 후보 칸을 거쳐): 그런 바다 칸 옆 후보에서
  // 시작해 후보로만 퍼진다
  const queue = new Int32Array(count);
  let tail = 0;
  for (let c = 0; c < count; c++) {
    if (flip[c] !== FLIP_CANDIDATE) continue;
    neighbors8(grid, c, out);
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next >= 0 && sea[next] === 1 && flip[next] !== FLIP_TO_LAND) {
        flip[c] = FLIP_TO_SEA;
        queue[tail++] = c;
        break;
      }
    }
  }
  for (let head = 0; head < tail; head++) {
    neighbors8(grid, queue[head] ?? 0, out);
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next < 0 || flip[next] !== FLIP_CANDIDATE) continue;
      flip[next] = FLIP_TO_SEA;
      queue[tail++] = next;
    }
  }
  // 바꾸기: 새 땅·이어진 새 바다. 원래 높이는 warpedDistance 자리에 남긴다(되돌릴 때 쓴다). 웅덩이 칸이 새 바다가
  // 되면 원래 깊이를 지킨다(min)
  const slope = COAST_NEW_SLOPE * REFERENCE_RADIUS_KM;
  for (let c = 0; c < count; c++) {
    const kind = flip[c] ?? 0;
    if (kind !== FLIP_TO_LAND && kind !== FLIP_TO_SEA) continue;
    const original = elevation[c] ?? 0;
    const offset = Math.max(COAST_NEW_MARGIN_M, slope * Math.abs(warpedDistance[c] ?? 0));
    elevation[c] = kind === FLIP_TO_LAND ? seaLevel + offset : Math.min(original, seaLevel - offset);
    warpedDistance[c] = original;
  }
  // 확인: 바꾼 높이로 해수면을 다시 재고 바다를 다시 판정한다(고칠 칸이 없을 때까지).
  // - 바다가 못 된 새 바다 칸(웅덩이와만 이어지거나, 해수면이 움직여 끊긴 만)은 원래 높이로 되돌린다.
  // - 원래 바다였는데 새 땅(곶·섬)에 갇혀 바다가 아니게 된 칸(웅덩이 → 호수 후보)은 새 땅 높이로 메운다(메워진 석호)
  for (let round = 0; round < COAST_CHECK_ROUNDS; round++) {
    const level = areaPercentile(grid, elevation, below);
    const ocean = oceanComponents(grid, (c) => forced[c] === 1 || (elevation[c] ?? 0) < level, forced);
    const filledHeight = Math.max(seaLevel, level) + COAST_NEW_MARGIN_M;
    let fixed = 0;
    for (let c = 0; c < count; c++) {
      if (ocean[c] === 1) continue;
      if (flip[c] === FLIP_TO_SEA) {
        elevation[c] = warpedDistance[c] ?? 0;
        flip[c] = FLIP_CANDIDATE;
        fixed++;
      } else if (sea[c] === 1 && (elevation[c] ?? 0) < level) {
        elevation[c] = filledHeight;
        flip[c] = FLIP_TO_LAND;
        fixed++;
      }
    }
    if (fixed === 0) break;
  }
}

// ── 산맥 단면 ──
/** 단면 노이즈: 두 채널, 주파수 4(격자 약 1,600km), 2옥타브. 표준편차(잰 값 0.2006·0.2023)로 나눠 쓴다 */
const SHAPE_NOISE: NoiseSetup = {
  name: "mountain shape",
  frequency: 4,
  octaves: 2,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "pair",
};
const SHAPE_SD = 0.2;
/** 표준편차 단위 값의 상한(±): 폭·중심 배율이 0 이하로 가지 않게 */
const SHAPE_LIMIT = 2.5;
/** 산맥 앞면이 경계에서 앞뒤로 움직이는 거리(표준편차) */
export const MOUNTAIN_FRONT_WIGGLE = km(40);

/** 경계를 따라 바뀌는 세기: 주파수 2.5(격자 약 2,500km), 3옥타브, 표준편차(잰 값 0.177)로 나눠 쓴다 */
const ALONG_NOISE: NoiseSetup = {
  name: "mountain along-strength",
  frequency: 2.5,
  octaves: 3,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "fbm",
};
const ALONG_SD = 0.177;
/**
 * 세기 = 1 + 이 값 × 노이즈(표준편차 1), 범위 안으로 자른다(높은 산괴와 낮은 고개). 출력 판 2는 같은 식으로 약 0.115라
 * 산맥이 길이 내내 거의 같은 높이였다(시드 42의 긴 충돌 산맥, 2026-10-29 그림)
 */
const ALONG_VARIATION = 0.3;
const ALONG_MIN = 0.3;
const ALONG_MAX = 1.4;

/** 경계 지형 세기 배율(경계를 따라 바뀐다, 평균 약 1) */
export function alongStrength(seed: number, x: number, y: number, z: number): number {
  const { frequency, octaves, gain, jitter } = ALONG_NOISE;
  const n = offsetFbm3(seed, x, y, z, frequency, octaves, gain, jitter) / ALONG_SD;
  return clamp(1 + ALONG_VARIATION * n, ALONG_MIN, ALONG_MAX);
}

/**
 * 산맥 단면 두 채널(표준편차 1, ±2.5로 자름)을 out[0]·out[1]에 쓴다. out[0]은 안데스형 혹 중심·충돌 산맥 폭,
 * out[1]은 앞면 위치·혹 폭에 쓴다(tectonics.ts)
 */
export function mountainShape(seed: number, x: number, y: number, z: number, out: Float64Array): void {
  const { frequency, octaves, gain, jitter } = SHAPE_NOISE;
  offsetFbm3Pair(seed, x, y, z, frequency, octaves, gain, jitter, out);
  out[0] = clamp((out[0] ?? 0) / SHAPE_SD, -SHAPE_LIMIT, SHAPE_LIMIT);
  out[1] = clamp((out[1] ?? 0) / SHAPE_SD, -SHAPE_LIMIT, SHAPE_LIMIT);
}

/** 이 파일의 노이즈 2판 설정(반복 검사 "노이즈 격자점"이 잰다) */
export const LANDFORM_NOISES: readonly NoiseSetup[] = [
  HIGHLAND_NOISE,
  HILL_NOISE,
  HILL_REGION_NOISE,
  COAST_NOISE,
  COAST_REGION_NOISE,
  SHAPE_NOISE,
  ALONG_NOISE,
];

// ── 봉우리 높이 다듬기 ──
/** 이 높이(실제 환산 m)까지는 그대로, 그 위는 PEAK_ROOM 안으로 부드럽게 눌러 PEAK_START + PEAK_ROOM에 다가간다 */
const PEAK_START_M = 8000;
const PEAK_ROOM_M = 2000;

/**
 * 아주 높은 봉우리를 부드럽게 누른다(elevation을 고친다): h > 8000m면 8000 + 2000 × (1 − e^(−(h − 8000) ÷ 2000)).
 * 늘 증가하는 함수라 높이 순서는 그대로다. 고원·구릉 위에 충돌 산맥이 겹치면 실제 환산 13~15km까지 올라갔다
 * (Verified: F7 시드 3개, 출력 판 2는 9.5~10.9km). 해수면을 정하기 전 절대 높이에 쓴다(해수면은 대개 0 근처)
 */
export function softenPeaks(elevation: Float32Array): void {
  for (let c = 0; c < elevation.length; c++) {
    const h = elevation[c] ?? 0;
    if (h > PEAK_START_M)
      elevation[c] = PEAK_START_M + PEAK_ROOM_M * (1 - detExp(-(h - PEAK_START_M) / PEAK_ROOM_M));
  }
}
