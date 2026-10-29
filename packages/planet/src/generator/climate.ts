// 생성 4단계: 기후 — 연평균 기온·강수 (ADR 31 순서, ADR 36)
// - 위도: 단위 구 위 점의 z = sin(위도). 위도(도)는 결정적 아크사인(@terra/shared detAsin).
// - 기후 위도·바람·바람이 오는 이웃: climateWind.ts(출력 판 3). 띠 식은 모두 기후 위도(흔든 위도)를 쓴다.
// - 기온: 해수면 기온 = 적도 − (적도 − 극) × (|기후 위도|/90)^1.5, 고도에 따라 6.5°C/km(실제 환산 고도 = 게임 m × 12).
//   여기에 변이를 더한다(출력 판 3, 다양성 고침 2단계, climateVariation): 중간 크기(주파수 3, 격자 약 2,100km ~
//   5옥타브 약 130km) 표준편차 바다 2°C·내륙 3.5°C, 땅만 잔 변이(주파수 40, 격자 약 160km ~ 40km) 1.2°C.
//   그래서 기후 띠 경계가 굽이치고, 경계 둘레에 덩어리·섞이는 띠가 생긴다.
// - 습기: 바람길을 따라 바다 위에서 차고, 땅 위에서 비로 빠지며, 오르막에서 크게 빠진다(비그늘). 오르막은 바람길
//   약 75km(칸 하나 이상) 위와 견준다. 칸이 작은 굽기 해상도에서도 75km보다 짧은 잔 기복마다 습기가 빠지지 않는다.
//   길이 2^K칸의 바람길을 포인터 두 배 뛰기(doubling)로 한 번에 접는다(칸마다 일차식 m → a·m + b를 합성).
// - 강수 = 위도 띠 기본값 × 습기 × (1 + 바람받이 오르막) × 설정 배율 × 변이 배율. 바다까지 거리로 해안 습기를 보탠다.
//   변이 배율 = e^(0.4 × 중간 크기 채널 B + 0.3 × 잔 변이 채널 B(땅만), 채널은 표준편차 1로 맞춘 값). 중간 크기만으로
//   로그 표준편차 0.4(5~95%가 약 ×0.5 ~ ×1.9).
// - 변이는 저장하는 기온·강수에 들어간다(바이옴은 여전히 저장한 기온·습도·고도로만 판정한다). 노이즈 세기는 해상도와
//   무관하게 가장 많은 옥타브의 세기 합으로 나눈다: 낮은 면 레벨(미리보기)은 잔 옥타브만 빠지고 큰 모양은 같다.
//   잔 변이는 칸이 그 격자의 반보다 크면(F ≤ 6) 끈다(미리보기가 얼룩지지 않게).
// 모든 길이는 구 위 각도(라디안)다. 수치는 S2 임시값이다(지구 연평균 분포를 대략 따른다).
import { detAsin, detExp } from "@terra/shared";
import type { PlanetSettings } from "@terra/shared";
import { upwindNeighbors } from "./climateWind.ts";
import { type PlanetGrid, neighbors8 } from "./grid.ts";
import { NOISE_JITTER, type NoiseSetup, amplitudeSum, octavesFor, offsetFbm3Pair } from "./noise.ts";
import { distanceField } from "./queues.ts";
import { STREAM_CLIMATE, STREAM_WIND, streamSeed } from "./random.ts";
import { REFERENCE_RADIUS_KM, clamp, km } from "./util.ts";

const DEGREES_PER_RADIAN = 180 / Math.PI;
const REFERENCE_RADIUS_M = REFERENCE_RADIUS_KM * 1000;

/** 기온 감소율(°C/m, 실제 환산 고도) */
export const LAPSE_RATE_PER_M = 0.0065;
/** 바다 위에서 습기가 차는 거리 */
const OCEAN_RECHARGE = km(350);
/** 땅 위에서 습기가 비로 빠지는 거리(숲의 증발산으로 다시 채워지는 몫을 포함한 대략값) */
const LAND_DEPLETION = km(3000);
/** 오르막 1000m(실제 환산)마다 습기가 e^-x배로 빠진다 */
const OROGRAPHIC_DEPLETION_PER_KM = 1.1;
/** 바람받이 오르막(높이 ÷ 거리)이 강수를 늘리는 배율과 상한 */
const OROGRAPHIC_GAIN = 45;
const OROGRAPHIC_MAX = 2.5;
/** 바닷바람이 안쪽까지 들어오는 거리(바람 방향과 무관한 해안 습기) */
const COASTAL_REACH = km(450);
/** 바람길 길이 상한(이만큼을 덮도록 두 배 뛰기 횟수를 고른다) */
const WIND_PATH = km(4500);
/** 오르막을 재는 바람길 길이: 이만큼(칸 수로 반올림, 1칸 이상) 위 칸과 견준다 */
const OROGRAPHIC_SPAN = km(75);

// ── 기후 변이(출력 판 3, 2단계). 표준편차는 F6 칸(면적 가중) × 시드 64개 × 두 채널로 잰 값이다(가장 많은 옥타브의 세기
//    합으로 나눈 노이즈, 2026-10-29. 흔들기 0과 0.8에서 0.1% 안으로 같다). 노이즈 식이나 주파수·옥타브·gain을 바꾸면
//    다시 잰다 ──
/** 중간 크기 변이: 두 채널(A = 기온, B = 강수), 주파수 3(격자 약 2,100km)에서 5옥타브까지 */
const ANOMALY_NOISE: NoiseSetup = {
  name: "climate anomaly",
  frequency: 3,
  octaves: 5,
  gain: 0.65,
  jitter: NOISE_JITTER,
  kind: "pair",
};
const ANOMALY_SD = 0.139;
/** 기온 변이 표준편차(°C): 바다 위, 그리고 내륙에서 더하는 몫(해안에서 600km에 1 − 1/e) */
const ANOMALY_TEMPERATURE_OCEAN = 2;
const ANOMALY_TEMPERATURE_INLAND = 1.5;
const ANOMALY_INLAND_REACH = km(600);
/** 강수 변이: 로그 표준편차 */
const ANOMALY_PRECIPITATION_LOG = 0.4;
/** 잔 변이(땅만): 두 채널, 주파수 40(격자 약 160km)에서 3옥타브까지 */
const ROUGH_NOISE: NoiseSetup = {
  name: "climate roughness",
  frequency: 40,
  octaves: 3,
  gain: 0.6,
  jitter: NOISE_JITTER,
  kind: "pair",
};
const ROUGH_SD = 0.168;
/** 이 파일의 노이즈 2판 설정(반복 검사 "노이즈 격자점"이 잰다) */
export const CLIMATE_NOISES: readonly NoiseSetup[] = [ANOMALY_NOISE, ROUGH_NOISE];
/** 잔 변이 세기: 기온 표준편차(°C), 강수 로그 표준편차 */
const ROUGH_TEMPERATURE = 1.2;
const ROUGH_PRECIPITATION_LOG = 0.3;
/** 변이 노이즈 시드: streamSeed(시드, STREAM_CLIMATE) + 이 값 */
const ANOMALY_SEED_OFFSET = 1;
const ROUGH_SEED_OFFSET = 2;

export interface Climate {
  /** 연평균 기온(°C) */
  readonly temperature: Float32Array;
  /** 연 강수(mm) */
  readonly precipitation: Float32Array;
  /** 바다까지 거리(라디안, 바다 칸은 0) */
  readonly oceanDistance: Float32Array;
}

/** 위도(절댓값, 도) → 위도 띠 기본 강수(mm/년): 적도 수렴대, 아열대 건조대, 중위도 저기압대, 극 건조 */
export function zonalPrecipitation(latitudeDegrees: number): number {
  const a = Math.abs(latitudeDegrees);
  const tropics = a / 18;
  const midLatitude = (a - 50) / 13;
  return 120 + 2300 * detExp(-tropics * tropics) + 900 * detExp(-midLatitude * midLatitude);
}

/**
 * 변이 노이즈를 표준편차 1로 맞추는 배율: 쓰는 옥타브의 세기 합 ÷ 가장 많은 옥타브의 세기 합 ÷ 표준편차.
 * 노이즈 함수는 쓰는 옥타브의 세기 합으로 나누므로, 이것을 곱하면 낮은 옥타브의 세기가 해상도와 무관하게 같다
 */
function unitScale(gain: number, octaves: number, maxOctaves: number, sd: number): number {
  return amplitudeSum(gain, octaves) / amplitudeSum(gain, maxOctaves) / sd;
}

/**
 * 잔 변이 옥타브 수: 칸이 잔 변이 격자의 반보다 크면(1 ÷ (2 × 칸) < 주파수 40, F ≤ 6) 0(끈다). 그보다 작으면
 * 해상도에 맞게 3옥타브까지(F7 1, F8 2, F9 3)
 */
export function roughnessOctaves(meanCellAngle: number): number {
  if (1 / (2 * meanCellAngle) < ROUGH_NOISE.frequency) return 0;
  return octavesFor(ROUGH_NOISE.frequency, meanCellAngle, ROUGH_NOISE.octaves);
}

/** 기후 변이 두 채널(기온 쪽 A, 강수 쪽 B). 한 스레드 안에서만 쓰는 임시 칸 */
const anomalyNoise = new Float64Array(2);

/**
 * 기온(띠 식 + 고도 냉각 + 변이)과 강수 변이 지수(강수에 곱할 e^x의 x)를 칸마다 쓴다.
 * 중간 크기 변이는 모든 칸, 잔 변이는 땅 칸만(roughnessOctaves가 0이면 없음). 노이즈 2판 두 채널 한 번씩.
 * @param latitude 칸마다 기후 위도(도)
 * @param oceanDistance 바다까지 거리(라디안): 기온 변이가 내륙으로 커진다
 */
function climateVariation(
  grid: PlanetGrid,
  seed: number,
  settings: PlanetSettings,
  latitude: Float32Array,
  elevation: Float32Array,
  seaLevel: number,
  ocean: Uint8Array,
  oceanDistance: Float32Array,
  temperature: Float32Array,
  precipitationLog: Float32Array,
): void {
  const equator = settings.equatorTemperatureC;
  const span = settings.equatorTemperatureC - settings.poleTemperatureC;
  const climateSeed = streamSeed(seed, STREAM_CLIMATE);
  const anomalySeed = climateSeed + ANOMALY_SEED_OFFSET;
  const roughSeed = climateSeed + ROUGH_SEED_OFFSET;
  const anomaly = ANOMALY_NOISE;
  const rough = ROUGH_NOISE;
  const anomalyOctaves = octavesFor(anomaly.frequency, grid.meanCellAngle, anomaly.octaves);
  const anomalyScale = unitScale(anomaly.gain, anomalyOctaves, anomaly.octaves, ANOMALY_SD);
  const roughOctaves = roughnessOctaves(grid.meanCellAngle);
  const roughScale = roughOctaves > 0 ? unitScale(rough.gain, roughOctaves, rough.octaves, ROUGH_SD) : 0;
  for (let c = 0; c < grid.cellCount; c++) {
    const x = grid.x[c] ?? 0;
    const y = grid.y[c] ?? 0;
    const z = grid.z[c] ?? 0;
    const t = Math.min(1, Math.abs(latitude[c] ?? 0) / 90);
    const altitude = Math.max(0, (elevation[c] ?? 0) - seaLevel);
    let value = equator - span * t * Math.sqrt(t) - LAPSE_RATE_PER_M * altitude;
    offsetFbm3Pair(
      anomalySeed,
      x,
      y,
      z,
      anomaly.frequency,
      anomalyOctaves,
      anomaly.gain,
      anomaly.jitter,
      anomalyNoise,
    );
    const isOcean = ocean[c] === 1;
    const inland = isOcean ? 0 : 1 - detExp(-(oceanDistance[c] ?? 0) / ANOMALY_INLAND_REACH);
    const strength = ANOMALY_TEMPERATURE_OCEAN + ANOMALY_TEMPERATURE_INLAND * inland;
    value += strength * anomalyScale * (anomalyNoise[0] ?? 0);
    let logFactor = ANOMALY_PRECIPITATION_LOG * anomalyScale * (anomalyNoise[1] ?? 0);
    if (roughOctaves > 0 && !isOcean) {
      offsetFbm3Pair(
        roughSeed,
        x,
        y,
        z,
        rough.frequency,
        roughOctaves,
        rough.gain,
        rough.jitter,
        anomalyNoise,
      );
      value += ROUGH_TEMPERATURE * roughScale * (anomalyNoise[0] ?? 0);
      logFactor += ROUGH_PRECIPITATION_LOG * roughScale * (anomalyNoise[1] ?? 0);
    }
    temperature[c] = value;
    precipitationLog[c] = logFactor;
  }
}

export function computeClimate(
  grid: PlanetGrid,
  elevation: Float32Array,
  seaLevel: number,
  ocean: Uint8Array,
  settings: PlanetSettings,
  seed: number,
): Climate {
  const count = grid.cellCount;
  // 기후 위도: 먼저 지리 위도를 넣고, 바람이 오는 이웃을 고르면서 같은 배열에 흔든 위도를 덮어쓴다
  const latitude = new Float32Array(count);
  for (let c = 0; c < count; c++) latitude[c] = detAsin(clamp(grid.z[c] ?? 0, -1, 1)) * DEGREES_PER_RADIAN;
  const upwind = upwindNeighbors(grid, latitude, streamSeed(seed, STREAM_WIND), latitude);
  // 습기를 먼저 구한다(두 배 뛰기 배열이 풀린 뒤에 기온·강수·바다까지 거리 배열을 만들어 한꺼번에 들고 있는 메모리를 줄인다)
  const { arriving, rise } = arrivingMoisture(grid, upwind, elevation, seaLevel, ocean, latitude);

  // 바다까지 거리(기온 변이가 내륙으로 커진다, 해안 습기). 가장 가까운 바다 칸 번호는 쓰지 않는다
  const oceanDistance = distanceField(grid, (c) => ocean[c] === 1, km(2500)).angle;
  // 기온과 강수 변이 지수(강수 배열에 먼저 담고, 아래에서 배율로 곱한다)
  const temperature = new Float32Array(count);
  const precipitation = new Float32Array(count);
  climateVariation(
    grid,
    seed,
    settings,
    latitude,
    elevation,
    seaLevel,
    ocean,
    oceanDistance,
    temperature,
    precipitation,
  );
  const scale = settings.precipitationPercent / 100;
  for (let c = 0; c < count; c++) {
    const coastal = 0.55 * detExp(-(oceanDistance[c] ?? 0) / COASTAL_REACH);
    const moisture = Math.max(arriving[c] ?? 0, coastal);
    const lift = ocean[c] === 1 ? 0 : Math.min(OROGRAPHIC_MAX, OROGRAPHIC_GAIN * (rise[c] ?? 0));
    // 습기와 무관한 몫(대류성 비): 적도 근처에서 크다
    const lat = latitude[c] ?? 0;
    const equatorial = lat / 12;
    const base = 0.12 + 0.3 * detExp(-equatorial * equatorial);
    const value =
      scale *
      zonalPrecipitation(lat) *
      (base + (1 - base) * moisture) *
      (1 + lift) *
      detExp(precipitation[c] ?? 0);
    precipitation[c] = clamp(value, 0, 12_000);
  }
  return { temperature, precipitation, oceanDistance };
}

/**
 * 바람길을 따라 칸에 들어오는 습기(0 ~ 1, 이웃 평균으로 누그러뜨림)와 바람받이 오르막(높이 ÷ 거리).
 * 칸마다 습기 일차식(나가는 습기 = a × 들어온 습기 + b)을 2^K칸 바람길로 두 배 뛰기 합성한다
 * @param latitude 칸마다 기후 위도(도)
 */
function arrivingMoisture(
  grid: PlanetGrid,
  upwind: Int32Array,
  elevation: Float32Array,
  seaLevel: number,
  ocean: Uint8Array,
  latitude: Float32Array,
): { readonly arriving: Float32Array; readonly rise: Float32Array } {
  const count = grid.cellCount;
  let mapA = new Float32Array(count);
  let mapB = new Float32Array(count);
  const rise = new Float32Array(count);
  const orographicSteps = Math.max(1, Math.round(OROGRAPHIC_SPAN / grid.meanCellAngle));
  for (let c = 0; c < count; c++) {
    const from = upwind[c] ?? c;
    if (from === c) {
      mapA[c] = 0;
      mapB[c] = ocean[c] === 1 ? 1 : 0.2;
      continue;
    }
    const step = chord(grid, c, from);
    if (ocean[c] === 1) {
      const keep = detExp(-step / OCEAN_RECHARGE);
      mapA[c] = keep;
      mapB[c] = 1 - keep;
    } else {
      // 오르막: 바람길 orographicSteps칸 위와 견준다. 기울기 = 그 높이 차 ÷ 거리, 칸마다 빠지는 몫은 높이 차 ÷ 칸 수
      // (바람길을 따라 더하면 그 길이로 매끈하게 한 지형의 오르막 합이 된다)
      let far = c;
      for (let k = 0; k < orographicSteps; k++) far = upwind[far] ?? far;
      const here = Math.max(seaLevel, elevation[c] ?? 0);
      const there = Math.max(seaLevel, elevation[far] ?? 0);
      const climb = Math.max(0, here - there);
      const distance = chord(grid, c, far);
      rise[c] = distance > 0 ? climb / (distance * REFERENCE_RADIUS_M) : 0;
      // 열대 숲은 증발산으로 습기를 되살려 더 멀리 간다
      const tropics = (latitude[c] ?? 0) / 14;
      const reach = LAND_DEPLETION * (1 + 1.5 * detExp(-tropics * tropics));
      mapA[c] = detExp(-step / reach - (OROGRAPHIC_DEPLETION_PER_KM * climb) / orographicSteps / 1000);
      mapB[c] = 0;
    }
  }
  // 두 배 뛰기: 2^K칸 바람길을 합성한다(m_far = 0에서 출발)
  let jump = Int32Array.from(upwind);
  let nextA = new Float32Array(count);
  let nextB = new Float32Array(count);
  let nextJump = new Int32Array(count);
  for (let covered = grid.meanCellAngle; covered < WIND_PATH; covered *= 2) {
    for (let c = 0; c < count; c++) {
      const far = jump[c] ?? c;
      const a = mapA[c] ?? 0;
      nextA[c] = a * (mapA[far] ?? 0);
      nextB[c] = a * (mapB[far] ?? 0) + (mapB[c] ?? 0);
      nextJump[c] = jump[far] ?? far;
    }
    [mapA, nextA] = [nextA, mapA];
    [mapB, nextB] = [nextB, mapB];
    [jump, nextJump] = [nextJump, jump];
  }

  // 이 칸에 들어오는 습기 = 바람이 오는 칸에서 나간 습기. 바람길이 칸 단위로 끊겨 생기는 줄무늬를 이웃 평균으로 누그러뜨린다
  const arriving = new Float32Array(count);
  for (let c = 0; c < count; c++) {
    const from = upwind[c] ?? c;
    arriving[c] = from === c ? (mapB[c] ?? 0) : (mapB[from] ?? 0);
  }
  return { arriving: blur(grid, arriving, Math.max(1, 2 * (grid.faceLevel - 5))), rise };
}

/** 이웃 평균(자기 + 8이웃)을 passes번 */
function blur(grid: PlanetGrid, field: Float32Array<ArrayBuffer>, passes: number): Float32Array<ArrayBuffer> {
  let current = field;
  let next = new Float32Array(field.length);
  const out = new Int32Array(8);
  for (let pass = 0; pass < passes; pass++) {
    for (let c = 0; c < grid.cellCount; c++) {
      neighbors8(grid, c, out);
      let sum = current[c] ?? 0;
      let weight = 1;
      for (let k = 0; k < 8; k++) {
        const other = out[k] ?? -1;
        if (other < 0) continue;
        sum += current[other] ?? 0;
        weight++;
      }
      next[c] = sum / weight;
    }
    [current, next] = [next, current];
  }
  return current;
}

function chord(grid: PlanetGrid, a: number, b: number): number {
  const dx = (grid.x[a] ?? 0) - (grid.x[b] ?? 0);
  const dy = (grid.y[a] ?? 0) - (grid.y[b] ?? 0);
  const dz = (grid.z[a] ?? 0) - (grid.z[b] ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
