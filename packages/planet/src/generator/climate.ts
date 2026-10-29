// 생성 4단계: 기후 — 연평균 기온·강수 (ADR 31 순서, ADR 36)
// - 위도: 단위 구 위 점의 z = sin(위도). 위도(도)는 결정적 아크사인(@terra/shared detAsin).
// - 기온: 해수면 기온 = 적도 − (적도 − 극) × (|위도|/90)^1.5, 고도에 따라 6.5°C/km(실제 환산 고도 = 게임 m × 12).
// - 바람: 위도 띠(무역풍·편서풍·극동풍). 칸마다 바람을 거슬러 가는 이웃 하나를 고른다.
// - 습기: 바람길을 따라 바다 위에서 차고, 땅 위에서 비로 빠지며, 오르막에서 크게 빠진다(비그늘).
//   길이 2^K칸의 바람길을 포인터 두 배 뛰기(doubling)로 한 번에 접는다(칸마다 일차식 m → a·m + b를 합성).
// - 강수 = 위도 띠 기본값 × 습기 × (1 + 바람받이 오르막) × 설정 배율. 바다까지 거리로 해안 습기를 보탠다.
// 모든 길이는 구 위 각도(라디안)다. 수치는 S2 임시값이다(지구 연평균 분포를 대략 따른다).
import { detAsin, detCos, detExp, detSin } from "@terra/shared";
import type { PlanetSettings } from "@terra/shared";
import { type PlanetGrid, neighbors8 } from "./grid.ts";
import { distanceField } from "./queues.ts";
import { REFERENCE_RADIUS_KM, clamp, km } from "./util.ts";

const DEGREES_PER_RADIAN = 180 / Math.PI;
const RADIANS_PER_DEGREE = Math.PI / 180;
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

export function computeClimate(
  grid: PlanetGrid,
  elevation: Float32Array,
  seaLevel: number,
  ocean: Uint8Array,
  settings: PlanetSettings,
): Climate {
  const count = grid.cellCount;
  const temperature = new Float32Array(count);
  const latitude = new Float32Array(count);
  const equator = settings.equatorTemperatureC;
  const span = settings.equatorTemperatureC - settings.poleTemperatureC;
  for (let c = 0; c < count; c++) {
    const degrees = detAsin(clamp(grid.z[c] ?? 0, -1, 1)) * DEGREES_PER_RADIAN;
    latitude[c] = degrees;
    const t = Math.abs(degrees) / 90;
    const seaLevelTemperature = equator - span * t * Math.sqrt(t);
    const altitude = Math.max(0, (elevation[c] ?? 0) - seaLevel);
    temperature[c] = seaLevelTemperature - LAPSE_RATE_PER_M * altitude;
  }

  // 바람을 거슬러 가는 이웃(바람이 오는 칸). 바람이 거의 없으면 자기 자신
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
    const { u, v } = windAt(latitude[c] ?? 0);
    // 바람이 오는 쪽 = −바람
    const wx = -(u * ex + v * nx);
    const wy = -(u * ey + v * ny);
    const wz = -v * nz;
    const strength = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (strength < 0.05) continue;
    neighbors8(grid, c, out);
    let best = -1;
    let bestScore = 0.3;
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next < 0) continue;
      const dx = (grid.x[next] ?? 0) - x;
      const dy = (grid.y[next] ?? 0) - y;
      const dz = (grid.z[next] ?? 0) - z;
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const score = (dx * wx + dy * wy + dz * wz) / (length * strength);
      if (score > bestScore) {
        bestScore = score;
        best = next;
      }
    }
    if (best >= 0) upwind[c] = best;
  }

  // 칸마다 습기 일차식: 나가는 습기 = a × 들어온 습기 + b
  let mapA = new Float32Array(count);
  let mapB = new Float32Array(count);
  const rise = new Float32Array(count);
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
      const here = Math.max(seaLevel, elevation[c] ?? 0);
      const there = Math.max(seaLevel, elevation[from] ?? 0);
      const climb = Math.max(0, here - there);
      rise[c] = climb / (step * REFERENCE_RADIUS_M);
      // 열대 숲은 증발산으로 습기를 되살려 더 멀리 간다
      const tropics = (latitude[c] ?? 0) / 14;
      const reach = LAND_DEPLETION * (1 + 1.5 * detExp(-tropics * tropics));
      mapA[c] = detExp(-step / reach - (OROGRAPHIC_DEPLETION_PER_KM * climb) / 1000);
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
  let arriving = new Float32Array(count);
  for (let c = 0; c < count; c++) {
    const from = upwind[c] ?? c;
    arriving[c] = from === c ? (mapB[c] ?? 0) : (mapB[from] ?? 0);
  }
  arriving = blur(grid, arriving, Math.max(1, 2 * (grid.faceLevel - 5)));
  const coast = distanceField(grid, (c) => ocean[c] === 1, km(2500));
  const precipitation = new Float32Array(count);
  const scale = settings.precipitationPercent / 100;
  for (let c = 0; c < count; c++) {
    const coastal = 0.55 * detExp(-(coast.angle[c] ?? 0) / COASTAL_REACH);
    const moisture = Math.max(arriving[c] ?? 0, coastal);
    const lift = ocean[c] === 1 ? 0 : Math.min(OROGRAPHIC_MAX, OROGRAPHIC_GAIN * (rise[c] ?? 0));
    // 습기와 무관한 몫(대류성 비): 적도 근처에서 크다
    const equatorial = (latitude[c] ?? 0) / 12;
    const base = 0.12 + 0.3 * detExp(-equatorial * equatorial);
    const value = scale * zonalPrecipitation(latitude[c] ?? 0) * (base + (1 - base) * moisture) * (1 + lift);
    precipitation[c] = clamp(value, 0, 12_000);
  }
  return { temperature, precipitation, oceanDistance: coast.angle };
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
