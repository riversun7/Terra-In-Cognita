// 반복·단조로움 검사의 측정 도우미 — 격자 자료와 출력 필드에서 지표 하나씩을 잰다(testVariety.ts가 모아 쓴다).
// 시험·측정 전용이다. 결정성 검사 밖(파일 이름이 test로 시작)이지만 위도는 생성기와 같은 detAsin으로 구한다.
// Math.log·Math.log2는 엔트로피·JS 거리·상자 차원·로그 강수에만 쓴다(보고 수치, 결정적 로그 함수가 없다).
import { detAsin } from "@terra/shared";
import { type PlanetFields, WATER_COAST, WATER_LAKE, WATER_OCEAN, WATER_RIVER } from "../tiles/fields.ts";
import {
  NEIGHBOR_DI,
  NEIGHBOR_DJ,
  type PlanetGrid,
  areaOf,
  buildGrid,
  chordBetween,
  neighbors8,
} from "./grid.ts";
import { CELL_DRY } from "./hydrology.ts";
import { distanceField } from "./queues.ts";
import { VERTICAL_SCALE } from "./surface.ts";
import { REFERENCE_RADIUS_KM, clamp, km } from "./util.ts";

const DEGREES_PER_RADIAN = 180 / Math.PI;
/** 수평 축척(D-055): 게임 km = 실제 환산 km ÷ 12 */
export const GAME_SCALE = 12;
/** 4이웃(위·왼쪽·오른쪽·아래)의 neighbors8 위치 */
const FOUR_NEIGHBORS: readonly number[] = [1, 3, 4, 6];
/** 가파른 곳(1차맵 특징): 이웃 사이 실제 환산 기울기 m/km */
const STEEP_M_PER_KM = 20;

/** 한 면 레벨에서 시드마다 다시 쓰는 격자 자료 */
export interface VarietyContext {
  readonly grid: PlanetGrid;
  /** 칸 × 8: neighbors8 순서의 이웃(없으면 -1) */
  readonly neighbors: Int32Array;
  /** 칸 면적(스테라디안) */
  readonly area: Float64Array;
  /** 위도(도, 북 +) */
  readonly latitude: Float64Array;
  /** 평균 칸 크기(실제 환산 km) */
  readonly cellKm: number;
}

export function varietyContext(faceLevel: number): VarietyContext {
  const grid = buildGrid(faceLevel);
  const count = grid.cellCount;
  const neighbors = new Int32Array(count * 8);
  const area = new Float64Array(count);
  const latitude = new Float64Array(count);
  const out = new Int32Array(8);
  for (let c = 0; c < count; c++) {
    neighbors8(grid, c, out);
    neighbors.set(out, c * 8);
    area[c] = areaOf(grid, c);
    latitude[c] = detAsin(clamp(grid.z[c] ?? 0, -1, 1)) * DEGREES_PER_RADIAN;
  }
  return { grid, neighbors, area, latitude, cellKm: grid.meanCellAngle * REFERENCE_RADIUS_KM };
}

/** 칸마다 바람(동쪽 u, 북쪽 v) */
export type CellWind = (c: number) => { readonly u: number; readonly v: number };

export const waterOf = (fields: PlanetFields, c: number): number => fields.water[c] ?? 0;

/** 땅: 바다도 호수도 아닌 칸 */
export function isLandCell(fields: PlanetFields, c: number): boolean {
  return (waterOf(fields, c) & (WATER_OCEAN | WATER_LAKE)) === 0;
}

export function isOceanCell(fields: PlanetFields, c: number): boolean {
  return (waterOf(fields, c) & WATER_OCEAN) !== 0;
}

/** 위도(도) → bins개로 나눈 남 → 북 띠 번호 */
function signedBand(latitude: number, bins: number): number {
  return Math.min(bins - 1, Math.max(0, Math.floor(((latitude + 90) / 180) * bins)));
}

/** 위도 1° 띠(남 → 북 180개) 평균이 설명하는 분산 몫(면적 가중 R²). 고른 칸이 없으면 NaN, 값이 모두 같으면 1 */
export function latitudeR2(
  ctx: VarietyContext,
  values: ArrayLike<number>,
  include: (c: number) => boolean,
): number {
  const bins = 180;
  const weight = new Float64Array(bins);
  const sum = new Float64Array(bins);
  const count = ctx.grid.cellCount;
  let total = 0;
  let mean = 0;
  for (let c = 0; c < count; c++) {
    if (!include(c)) continue;
    const band = signedBand(ctx.latitude[c] ?? 0, bins);
    const area = ctx.area[c] ?? 0;
    const value = values[c] ?? 0;
    weight[band] = (weight[band] ?? 0) + area;
    sum[band] = (sum[band] ?? 0) + area * value;
    total += area;
    mean += area * value;
  }
  if (!(total > 0)) return Number.NaN;
  mean /= total;
  let squaresTotal = 0;
  let squaresWithin = 0;
  for (let c = 0; c < count; c++) {
    if (!include(c)) continue;
    const band = signedBand(ctx.latitude[c] ?? 0, bins);
    const area = ctx.area[c] ?? 0;
    const value = values[c] ?? 0;
    const bandMean = (sum[band] ?? 0) / (weight[band] ?? 1);
    squaresTotal += area * (value - mean) * (value - mean);
    squaresWithin += area * (value - bandMean) * (value - bandMean);
  }
  return squaresTotal > 0 ? 1 - squaresWithin / squaresTotal : 1;
}

/** 땅 넓이(스테라디안)를 |위도| 1° 띠(90개) × 바이옴으로 모은 표: table[띠 × 바이옴 수 + 바이옴] */
export function latitudeBandTable(
  ctx: VarietyContext,
  fields: PlanetFields,
  biomeCount: number,
): Float64Array {
  const table = new Float64Array(90 * biomeCount);
  for (let c = 0; c < ctx.grid.cellCount; c++) {
    if (!isLandCell(fields, c)) continue;
    const band = Math.min(89, Math.floor(Math.abs(ctx.latitude[c] ?? 0)));
    const at = band * biomeCount + (fields.biome[c] ?? 0);
    table[at] = (table[at] ?? 0) + (ctx.area[c] ?? 0);
  }
  return table;
}

/**
 * 위도 띠 표 → (위도가 설명하는 바이옴 정보 몫 I(바이옴; 띠) ÷ H(바이옴), 띠마다 가장 흔한 바이옴이 차지하는 몫).
 * 둘 다 1이면 위도만 알면 바이옴이 정해진다
 */
export function zonalBiomeMetrics(
  table: Float64Array,
  biomeCount: number,
): { readonly infoShare: number; readonly dominantShare: number } {
  const bands = Math.floor(table.length / biomeCount);
  const biomeTotal = new Float64Array(biomeCount);
  const bandTotal = new Float64Array(bands);
  let total = 0;
  for (let band = 0; band < bands; band++) {
    for (let k = 0; k < biomeCount; k++) {
      const value = table[band * biomeCount + k] ?? 0;
      total += value;
      biomeTotal[k] = (biomeTotal[k] ?? 0) + value;
      bandTotal[band] = (bandTotal[band] ?? 0) + value;
    }
  }
  if (!(total > 0)) return { infoShare: Number.NaN, dominantShare: Number.NaN };
  let entropy = 0;
  for (let k = 0; k < biomeCount; k++) {
    const p = (biomeTotal[k] ?? 0) / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  let information = 0;
  let dominant = 0;
  for (let band = 0; band < bands; band++) {
    let largest = 0;
    const pBand = (bandTotal[band] ?? 0) / total;
    for (let k = 0; k < biomeCount; k++) {
      const value = table[band * biomeCount + k] ?? 0;
      largest = Math.max(largest, value);
      const p = value / total;
      if (p > 0) information += p * Math.log2(p / (((biomeTotal[k] ?? 0) / total) * pBand));
    }
    dominant += largest;
  }
  return { infoShare: entropy > 0 ? information / entropy : 0, dominantShare: dominant / total };
}

/** Jensen–Shannon 거리(비트, 0 ~ 1): 두 분포(합으로 나눠 맞춘다)가 얼마나 다른지. 한쪽이 비면 NaN */
export function jsDivergence(p: ArrayLike<number>, q: ArrayLike<number>): number {
  let sumP = 0;
  let sumQ = 0;
  for (let k = 0; k < p.length; k++) sumP += p[k] ?? 0;
  for (let k = 0; k < q.length; k++) sumQ += q[k] ?? 0;
  if (!(sumP > 0) || !(sumQ > 0)) return Number.NaN;
  let divergence = 0;
  for (let k = 0; k < Math.max(p.length, q.length); k++) {
    const a = (p[k] ?? 0) / sumP;
    const b = (q[k] ?? 0) / sumQ;
    const m = (a + b) / 2;
    if (a > 0) divergence += 0.5 * a * Math.log2(a / m);
    if (b > 0) divergence += 0.5 * b * Math.log2(b / m);
  }
  return divergence;
}

/** 땅 바이옴 덩어리(8이웃으로 이어진 같은 바이옴 칸 묶음, 면 경계를 넘어 센다) */
export interface LandPatches {
  /** 칸 → 덩어리 번호(땅이 아니면 -1) */
  readonly label: Int32Array;
  /** 덩어리마다 넓이(스테라디안) */
  readonly area: readonly number[];
  /** 덩어리마다 바이옴 번호 */
  readonly biome: readonly number[];
}

export function landPatches(ctx: VarietyContext, fields: PlanetFields): LandPatches {
  const count = ctx.grid.cellCount;
  const label = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);
  const area: number[] = [];
  const biome: number[] = [];
  for (let start = 0; start < count; start++) {
    if ((label[start] ?? 0) !== -1 || !isLandCell(fields, start)) continue;
    const id = area.length;
    const kind = fields.biome[start] ?? 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    let sum = 0;
    while (head < tail) {
      const c = queue[head++] ?? 0;
      sum += ctx.area[c] ?? 0;
      for (let k = 0; k < 8; k++) {
        const other = ctx.neighbors[c * 8 + k] ?? -1;
        if (other < 0 || (label[other] ?? 0) !== -1 || !isLandCell(fields, other)) continue;
        if (fields.biome[other] !== kind) continue;
        label[other] = id;
        queue[tail++] = other;
      }
    }
    area.push(sum);
    biome.push(kind);
  }
  return { label, area, biome };
}

/** 큰 것부터 n개 덩어리 넓이 합 ÷ 고른 덩어리 넓이 합 */
export function topShare(areas: readonly number[], n: number): number {
  const sorted = areas.toSorted((a, b) => b - a);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const top = sorted.slice(0, n).reduce((sum, value) => sum + value, 0);
  return total > 0 ? top / total : Number.NaN;
}

/**
 * 면마다 칸 size × size 창으로 나눠, 90% 이상이 땅인 창 중 바이옴이 하나뿐인 창의 몫.
 * 땅 창이 없으면 몫 0
 */
export function singleBiomeWindowShare(
  ctx: VarietyContext,
  isLand: (c: number) => boolean,
  biome: ArrayLike<number>,
  size: number,
): { readonly share: number; readonly windows: number } {
  const { n, faceCells } = ctx.grid;
  const perSide = Math.floor(n / size);
  let full = 0;
  let single = 0;
  for (let face = 0; face < 6; face++) {
    for (let bj = 0; bj < perSide; bj++) {
      for (let bi = 0; bi < perSide; bi++) {
        let landCells = 0;
        let first = -1;
        let uniform = true;
        for (let j = bj * size; j < (bj + 1) * size; j++) {
          for (let i = bi * size; i < (bi + 1) * size; i++) {
            const c = face * faceCells + j * n + i;
            if (!isLand(c)) continue;
            landCells++;
            const kind = biome[c] ?? 0;
            if (first < 0) first = kind;
            else if (kind !== first) uniform = false;
          }
        }
        if (landCells < 0.9 * size * size) continue;
        full++;
        if (uniform) single++;
      }
    }
  }
  return { share: full > 0 ? single / full : 0, windows: full };
}

/** 칸 size × size 상자(면마다 격자) 중 고른 칸이 하나라도 든 상자 수 */
function boxCount(grid: PlanetGrid, member: (c: number) => boolean, size: number): number {
  const perSide = Math.floor(grid.n / size);
  const seen = new Uint8Array(6 * perSide * perSide);
  let count = 0;
  for (let c = 0; c < grid.cellCount; c++) {
    if (!member(c)) continue;
    const face = Math.floor(c / grid.faceCells);
    const rest = c - face * grid.faceCells;
    const j = Math.floor(rest / grid.n);
    const i = rest - j * grid.n;
    const bi = Math.floor(i / size);
    const bj = Math.floor(j / size);
    if (bi >= perSide || bj >= perSide) continue;
    const id = (face * perSide + bj) * perSide + bi;
    if (seen[id] === 0) {
      seen[id] = 1;
      count++;
    }
  }
  return count;
}

/** 상자 세기 국소 차원 −log(N(큰 상자) ÷ N(작은 상자)) ÷ log(큰 ÷ 작은): 곧은 선 1, 면을 채우면 2 */
export function boxDimension(
  ctx: VarietyContext,
  member: (c: number) => boolean,
  small: number,
  large: number,
): number {
  const fine = boxCount(ctx.grid, member, small);
  const coarse = boxCount(ctx.grid, member, large);
  if (fine === 0 || coarse === 0) return Number.NaN;
  return -Math.log(coarse / fine) / Math.log(large / small);
}

/** 1차맵 특징 칸: 호수, 강, 해안, 마른 분지, 땅 바이옴 경계, 가파른 곳(이웃까지 실제 환산 20m/km 넘음) */
function isFeatureCell(ctx: VarietyContext, fields: PlanetFields, basinKind: Uint8Array, c: number): boolean {
  const water = waterOf(fields, c);
  if (!isLandCell(fields, c)) return (water & WATER_LAKE) !== 0;
  if ((fields.river[c] ?? 0) > 0 || (water & WATER_COAST) !== 0 || basinKind[c] === CELL_DRY) return true;
  for (let k = 0; k < 8; k++) {
    const other = ctx.neighbors[c * 8 + k] ?? -1;
    if (other < 0) continue;
    if (isLandCell(fields, other) && fields.biome[other] !== fields.biome[c]) return true;
    const distanceKm = chordBetween(ctx.grid, c, other) * REFERENCE_RADIUS_KM;
    const rise = Math.abs((fields.elevationM[other] ?? 0) - (fields.elevationM[c] ?? 0)) * VERTICAL_SCALE;
    if (rise / distanceKm > STEEP_M_PER_KM) return true;
  }
  return false;
}

/** 땅 칸에서 가장 가까운 1차맵 특징까지 거리(8이웃 길)의 90번째 백분위, 게임 km */
export function featureGapP90GameKm(
  ctx: VarietyContext,
  fields: PlanetFields,
  basinKind: Uint8Array,
): number {
  const count = ctx.grid.cellCount;
  const feature = new Uint8Array(count);
  for (let c = 0; c < count; c++) feature[c] = isFeatureCell(ctx, fields, basinKind, c) ? 1 : 0;
  const distance = distanceField(ctx.grid, (c) => feature[c] === 1, km(3000));
  const values: number[] = [];
  for (let c = 0; c < count; c++) {
    if (isLandCell(fields, c)) values.push(((distance.angle[c] ?? 0) * REFERENCE_RADIUS_KM) / GAME_SCALE);
  }
  if (values.length === 0) return Number.NaN;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(0.9 * (sorted.length - 1))] ?? Number.NaN;
}

/**
 * 정수 등온선의 습도 계단(지표 5): 반올림 기온이 다른 4이웃 땅 쌍의 습도 차 평균 ÷ 같은 쌍의 평균.
 * 강·호수 가산이 끼지 않게 강·해안 칸과 강·호수 옆 칸은 뺀다. 위도 띠가 곧으면 이 값도 커진다(위도와 섞여 있다)
 */
export function humidityStepRatio(ctx: VarietyContext, fields: PlanetFields): number {
  const count = ctx.grid.cellCount;
  const plain = new Uint8Array(count);
  const wet = new Uint8Array(count);
  for (let c = 0; c < count; c++) {
    const water = waterOf(fields, c);
    const river = (fields.river[c] ?? 0) > 0;
    plain[c] = isLandCell(fields, c) && (water & (WATER_RIVER | WATER_COAST)) === 0 && !river ? 1 : 0;
    wet[c] = river || (water & WATER_LAKE) !== 0 ? 1 : 0;
  }
  const nearWet = new Uint8Array(count);
  for (let c = 0; c < count; c++) {
    for (let k = 0; k < 8; k++) {
      const other = ctx.neighbors[c * 8 + k] ?? -1;
      if (other >= 0 && wet[other] === 1) nearWet[c] = 1;
    }
  }
  let crossSum = 0;
  let crossCount = 0;
  let sameSum = 0;
  let sameCount = 0;
  for (let c = 0; c < count; c++) {
    if (plain[c] !== 1 || nearWet[c] === 1) continue;
    for (const k of FOUR_NEIGHBORS) {
      const other = ctx.neighbors[c * 8 + k] ?? -1;
      if (other < 0 || plain[other] !== 1 || nearWet[other] === 1) continue;
      const difference = Math.abs((fields.humidity[other] ?? 0) - (fields.humidity[c] ?? 0));
      if (fields.temperatureC[other] !== fields.temperatureC[c]) {
        crossSum += difference;
        crossCount++;
      } else {
        sameSum += difference;
        sameCount++;
      }
    }
  }
  if (crossCount === 0 || sameCount === 0 || !(sameSum > 0)) return Number.NaN;
  return crossSum / crossCount / (sameSum / sameCount);
}

/**
 * 바람 방향으로 k칸 떨어진 땅 쌍의 값 차이(가로/세로) 비. 바람 방향(칸에서 가장 잘 맞는 이웃 방향)을 따라 줄무늬가
 * 있으면 바람을 가로지르는 차이가 커진다. 면 가장자리 k + 1칸 안쪽은 뺀다(면 안 i·j로 옮겨 가므로)
 */
function streakRatio(
  ctx: VarietyContext,
  fields: PlanetFields,
  wind: CellWind,
  values: Float64Array,
  k: number,
): number {
  const { grid } = ctx;
  const { n, faceCells } = grid;
  let cross = 0;
  let along = 0;
  for (let c = 0; c < grid.cellCount; c++) {
    if (!isLandCell(fields, c)) continue;
    const face = Math.floor(c / faceCells);
    const rest = c - face * faceCells;
    const j = Math.floor(rest / n);
    const i = rest - j * n;
    if (i < k + 1 || j < k + 1 || i > n - k - 2 || j > n - k - 2) continue;
    const { u, v } = wind(c);
    if (Math.sqrt(u * u + v * v) < 0.05) continue;
    const x = grid.x[c] ?? 0;
    const y = grid.y[c] ?? 0;
    const z = grid.z[c] ?? 0;
    const horizontal = Math.sqrt(x * x + y * y) || 1;
    // 동쪽 e = (−y, x, 0)/|·|, 북쪽 = p × e
    const ex = -y / horizontal;
    const ey = x / horizontal;
    const wx = u * ex + v * (-z * ey);
    const wy = u * ey + v * (z * ex);
    const wz = v * (x * ey - y * ex);
    let best = 0;
    let bestScore = -2;
    for (let e = 0; e < 8; e++) {
      const other = ctx.neighbors[c * 8 + e] ?? -1;
      if (other < 0) continue;
      const dx = (grid.x[other] ?? 0) - x;
      const dy = (grid.y[other] ?? 0) - y;
      const dz = (grid.z[other] ?? 0) - z;
      const score = (dx * wx + dy * wy + dz * wz) / Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    const di = NEIGHBOR_DI[best] ?? 0;
    const dj = NEIGHBOR_DJ[best] ?? 0;
    const at = (a: number, b: number) => face * faceCells + (j + b) * n + (i + a);
    const cross1 = at(-k * dj, k * di);
    const cross2 = at(k * dj, -k * di);
    const along1 = at(k * di, k * dj);
    const along2 = at(-k * di, -k * dj);
    if (![cross1, cross2, along1, along2].every((cell) => isLandCell(fields, cell))) continue;
    cross += Math.abs((values[cross1] ?? 0) - (values[cross2] ?? 0));
    along += Math.abs((values[along1] ?? 0) - (values[along2] ?? 0));
  }
  return along > 0 ? cross / along : Number.NaN;
}

/**
 * 바람 방향 줄무늬(지표 6): 위도 0.5° 띠 평균을 뺀 log 강수의 가로/세로 비 − 같은 비의 지면 고도(지형·격자가 원래 가진
 * 방향성을 빼는 기준). 약 54km(실제 환산, 최소 2칸) 떨어진 쌍을 본다
 */
export function windStreakExcess(
  ctx: VarietyContext,
  fields: PlanetFields,
  wind: CellWind,
): { readonly excess: number; readonly raw: number; readonly reference: number } {
  const count = ctx.grid.cellCount;
  const k = Math.max(2, Math.round(54 / ctx.cellKm));
  const bins = 360;
  const weight = new Float64Array(bins);
  const sum = new Float64Array(bins);
  const residual = new Float64Array(count);
  for (let c = 0; c < count; c++) {
    if (!isLandCell(fields, c)) continue;
    const band = signedBand(ctx.latitude[c] ?? 0, bins);
    const value = Math.log((fields.precipitationMm[c] ?? 0) + 1);
    residual[c] = value;
    weight[band] = (weight[band] ?? 0) + (ctx.area[c] ?? 0);
    sum[band] = (sum[band] ?? 0) + (ctx.area[c] ?? 0) * value;
  }
  for (let c = 0; c < count; c++) {
    if (!isLandCell(fields, c)) continue;
    const band = signedBand(ctx.latitude[c] ?? 0, bins);
    residual[c] = (residual[c] ?? 0) - (sum[band] ?? 0) / (weight[band] ?? 1);
  }
  const raw = streakRatio(ctx, fields, wind, residual, k);
  const reference = streakRatio(ctx, fields, wind, Float64Array.from(fields.elevationM), k);
  return { excess: raw - reference, raw, reference };
}

/** 면 경계를 넘는 4이웃 땅 쌍의 바이옴 바뀜 비율 ÷ 면 안쪽 쌍의 비율(이음매가 티 나지 않으면 약 1) */
export function faceSeamChangeRatio(ctx: VarietyContext, fields: PlanetFields): number {
  const { faceCells } = ctx.grid;
  let acrossPairs = 0;
  let acrossChanges = 0;
  let insidePairs = 0;
  let insideChanges = 0;
  for (let c = 0; c < ctx.grid.cellCount; c++) {
    if (!isLandCell(fields, c)) continue;
    const face = Math.floor(c / faceCells);
    for (const k of FOUR_NEIGHBORS) {
      const other = ctx.neighbors[c * 8 + k] ?? -1;
      if (other < 0 || !isLandCell(fields, other)) continue;
      const changed = fields.biome[other] !== fields.biome[c] ? 1 : 0;
      if (Math.floor(other / faceCells) === face) {
        insidePairs++;
        insideChanges += changed;
      } else {
        acrossPairs++;
        acrossChanges += changed;
      }
    }
  }
  if (acrossPairs === 0 || insidePairs === 0 || insideChanges === 0) return Number.NaN;
  return acrossChanges / acrossPairs / (insideChanges / insidePairs);
}

/** 땅 바이옴 경계 칸(4이웃에 다른 바이옴의 땅)이 모든 칸에서 차지하는 몫 */
export function boundaryCellShare(ctx: VarietyContext, fields: PlanetFields): number {
  let boundary = 0;
  for (let c = 0; c < ctx.grid.cellCount; c++) {
    if (!isLandCell(fields, c)) continue;
    for (const k of FOUR_NEIGHBORS) {
      const other = ctx.neighbors[c * 8 + k] ?? -1;
      if (other >= 0 && isLandCell(fields, other) && fields.biome[other] !== fields.biome[c]) {
        boundary++;
        break;
      }
    }
  }
  return boundary / ctx.grid.cellCount;
}
