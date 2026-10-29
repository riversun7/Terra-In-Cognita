// 생성 5단계: 물 흐름 누적(강수 가중) → 단순 침식 → 강·호수 (ADR 31: 기후 뒤)
// - 유출(mm/년) = P² / (P + 증발 가능량): 비가 증발보다 훨씬 많으면 거의 다, 건조하면 거의 안 흐른다(Budyko식 근사).
// - 누적 유량(km³/년, 실제 환산) = 상류 칸 유출 × 면적의 합. 흐름 방향은 Priority-Flood가 정한다.
// - 웅덩이: 들어온 물이 수면 증발(면적 × 증발량)보다 많으면 넘치는 호수(남는 물만 나간다), 적으면 마른 분지
//   (물이 나가지 않는다: 강이 분지에서 끝난다). 너무 작거나 얕은 웅덩이는 메워진 평지로 보고 물을 그대로 보낸다.
// - 침식: 하천 침식 식 E = K·√Q·S를 Braun·Willett(2013)의 암시적 방법으로(하류부터, 새 웅덩이를 만들지 않는다).
// - 강: 누적 유량이 문턱 이상인 땅 칸. 하천 등급 = Strahler 차수(같은 등급 둘이 만나면 +1).
import { type PlanetGrid, areaOf, chordBetween } from "./grid.ts";
import type { FlowNetwork } from "./flood.ts";
import { REFERENCE_RADIUS_KM } from "./util.ts";

/** mm × 스테라디안 → km³ (실제 환산): 1e-6 km × R² */
const KM3_PER_MM_SR = 1e-6 * REFERENCE_RADIUS_KM * REFERENCE_RADIUS_KM;
/** 스테라디안 → km² (실제 환산) */
const KM2_PER_SR = REFERENCE_RADIUS_KM * REFERENCE_RADIUS_KM;
/** 호수가 되는 웅덩이의 최소 깊이(실제 환산 m)와 최소 면적(km²) */
const LAKE_MIN_DEPTH_M = 35;
const LAKE_MIN_AREA_KM2 = 3000;
/** 강 문턱: 강 밀도 100%일 때 누적 유량(km³/년) */
const RIVER_THRESHOLD_KM3 = 12;

/** 증발 가능량(mm/년): 기온에 비례하는 단순식 (S2 임시값) */
export function potentialEvaporation(temperatureC: number): number {
  return Math.max(80, 45 * (temperatureC + 6));
}

/** 수면 증발(mm/년) */
function lakeEvaporation(temperatureC: number): number {
  return Math.min(1800, Math.max(0, 45 * (temperatureC + 6)));
}

/** 유출(mm/년) */
export function runoffOf(
  precipitation: Float32Array,
  temperature: Float32Array,
  ocean: Uint8Array,
): Float32Array {
  const runoff = new Float32Array(precipitation.length);
  for (let c = 0; c < precipitation.length; c++) {
    if (ocean[c] === 1) continue;
    const p = precipitation[c] ?? 0;
    runoff[c] = (p * p) / (p + potentialEvaporation(temperature[c] ?? 0));
  }
  return runoff;
}

/** 웅덩이 상태 */
const BASIN_FILLED = 0; // 작거나 얕다: 메운 평지, 물은 그대로 지나간다
const BASIN_LAKE = 1; // 넘치는 호수
const BASIN_DRY = 2; // 마른 분지: 물이 나가지 않는다

export interface WaterBalance {
  /** 칸마다 누적 유량(km³/년) */
  readonly discharge: Float64Array;
  /** 웅덩이 번호 → 상태(BASIN_*) */
  readonly basinState: Uint8Array;
}

/**
 * 누적 유량과 웅덩이 물 수지. 하류 → 상류 순서의 반대로 돌며 상류부터 더한다.
 * @param lakePercent 호수 보존(%): 수면 증발을 이 비율로 나눈다(클수록 호수가 잘 남는다)
 */
export function waterBalance(
  grid: PlanetGrid,
  flow: FlowNetwork,
  elevation: Float32Array,
  runoff: Float32Array,
  temperature: Float32Array,
  lakePercent: number,
): WaterBalance {
  const count = grid.cellCount;
  const { receiver, filled, order, orderLength, basin, basinExit, basinCount } = flow;
  // 웅덩이 크기·깊이·증발
  const basinArea = new Float64Array(basinCount);
  const basinEvaporation = new Float64Array(basinCount);
  const basinDepth = new Float32Array(basinCount);
  for (let c = 0; c < count; c++) {
    const b = basin[c] ?? -1;
    if (b < 0) continue;
    const depth = (filled[c] ?? 0) - (elevation[c] ?? 0);
    if (depth <= 0) continue;
    const area = areaOf(grid, c);
    basinArea[b] = (basinArea[b] ?? 0) + area;
    basinEvaporation[b] =
      (basinEvaporation[b] ?? 0) + lakeEvaporation(temperature[c] ?? 0) * area * KM3_PER_MM_SR;
    basinDepth[b] = Math.max(basinDepth[b] ?? 0, depth);
  }
  const exitOf = new Int32Array(count).fill(-1);
  for (let b = 0; b < basinCount; b++) exitOf[basinExit[b] ?? 0] = b;
  const basinState = new Uint8Array(basinCount);
  const basinInflow = new Float64Array(basinCount);
  const evaporationScale = lakePercent > 0 ? 100 / lakePercent : Number.POSITIVE_INFINITY;
  const discharge = new Float64Array(count);
  for (let c = 0; c < count; c++) discharge[c] = (runoff[c] ?? 0) * areaOf(grid, c) * KM3_PER_MM_SR;
  for (let k = orderLength - 1; k >= 0; k--) {
    const c = order[k] ?? 0;
    const exiting = exitOf[c] ?? -1;
    if (exiting >= 0) {
      // 이 칸으로 넘치는 웅덩이: 상류 칸을 모두 지나왔으니 들어온 물이 다 모였다
      const inflow = basinInflow[exiting] ?? 0;
      const lakeSized =
        (basinDepth[exiting] ?? 0) >= LAKE_MIN_DEPTH_M &&
        (basinArea[exiting] ?? 0) * KM2_PER_SR >= LAKE_MIN_AREA_KM2;
      if (!lakeSized) {
        basinState[exiting] = BASIN_FILLED;
        discharge[c] = (discharge[c] ?? 0) + inflow;
      } else {
        const evaporation = (basinEvaporation[exiting] ?? 0) * evaporationScale;
        if (inflow >= evaporation) {
          basinState[exiting] = BASIN_LAKE;
          discharge[c] = (discharge[c] ?? 0) + inflow - evaporation;
        } else {
          basinState[exiting] = BASIN_DRY;
        }
      }
    }
    const r = receiver[c] ?? -1;
    if (r < 0) continue;
    const b = basin[c] ?? -1;
    if (b >= 0 && basin[r] !== b) basinInflow[b] = (basinInflow[b] ?? 0) + (discharge[c] ?? 0);
    else discharge[r] = (discharge[r] ?? 0) + (discharge[c] ?? 0);
  }
  return { discharge, basinState };
}

/**
 * 하천 침식 한 번(땅 칸만, 하류부터): h ← (h + f·h_하류) / (1 + f), f = K·√Q / 거리(km).
 * 하류가 더 높으면(웅덩이 안 흐름) 건드리지 않는다. 바다로 가는 칸은 해수면을 기준으로 깎는다.
 */
export function erodeOnce(
  grid: PlanetGrid,
  flow: FlowNetwork,
  elevation: Float32Array,
  discharge: Float64Array,
  ocean: Uint8Array,
  seaLevel: number,
  strength: number,
): void {
  const { receiver, order, orderLength } = flow;
  for (let k = 0; k < orderLength; k++) {
    const c = order[k] ?? 0;
    const r = receiver[c] ?? -1;
    if (r < 0) continue;
    const h = elevation[c] ?? 0;
    const below = ocean[r] === 1 ? seaLevel : (elevation[r] ?? 0);
    if (below >= h) continue;
    const f = (strength * Math.sqrt(discharge[c] ?? 0)) / (chordBetween(grid, c, r) * REFERENCE_RADIUS_KM);
    elevation[c] = (h + f * below) / (1 + f);
  }
}

/** 웅덩이 칸의 처리 (Rivers.basinKind) */
export const CELL_OPEN = 0;
/** 넘치는 호수의 물 아래 */
export const CELL_LAKE = 1;
/** 작거나 얕은 웅덩이를 메운 평지(물은 지나간다) */
export const CELL_FILLED = 2;
/** 마른 분지의 평지(플라야): 강이 여기서 끝나고 물이 나가지 않는다 */
export const CELL_DRY = 3;

export interface Rivers {
  /** 하천 등급(Strahler, 0 = 강 없음) */
  readonly order: Uint8Array;
  /**
   * 강 칸에서 강이 차지하는 길이 몫(0~1, 강이 아니면 0). 위에서 들어온 유량이 이미 문턱 이상이면 1이고, 이 칸에서
   * 문턱을 넘으면 (유량 − 문턱) ÷ 이 칸 자신의 유출이다(강이 칸 중간에서 시작한다). 칸이 클수록 칸 하나의 유출만으로
   * 문턱을 넘는 강 머리가 많아지므로, 강가 가산은 이 몫을 곱해 해상도와 무관하게 한다(surface.ts)
   */
  readonly length: Float32Array;
  /** 칸마다 CELL_OPEN·CELL_LAKE·CELL_FILLED·CELL_DRY. 메운 평지·마른 분지의 저장 고도 = 채운 높이 */
  readonly basinKind: Uint8Array;
}

/**
 * 강·호수: 호수 = 넘치는 웅덩이의 물 아래 칸, 강 = 유량 문턱 이상인 땅 칸(호수·마른 분지 제외).
 * 강은 바다·호수·마른 분지에서 끝난다.
 * @param runoff 칸마다 유출(mm/년, runoffOf) — 강 길이 몫(Rivers.length)을 구할 때 쓴다
 */
export function findRivers(
  grid: PlanetGrid,
  flow: FlowNetwork,
  elevation: Float32Array,
  balance: WaterBalance,
  ocean: Uint8Array,
  runoff: Float32Array,
  riverDensityPercent: number,
): Rivers {
  const count = grid.cellCount;
  const { receiver, filled, order: flowOrder, orderLength, basin } = flow;
  const basinKind = new Uint8Array(count);
  for (let c = 0; c < count; c++) {
    const b = basin[c] ?? -1;
    if (b < 0 || (filled[c] ?? 0) <= (elevation[c] ?? 0)) continue;
    const state = balance.basinState[b];
    basinKind[c] = state === BASIN_LAKE ? CELL_LAKE : state === BASIN_DRY ? CELL_DRY : CELL_FILLED;
  }
  const threshold =
    riverDensityPercent > 0 ? (RIVER_THRESHOLD_KM3 * 100) / riverDensityPercent : Number.POSITIVE_INFINITY;
  const order = new Uint8Array(count);
  const length = new Float32Array(count);
  const childMax = new Uint8Array(count);
  const childMaxCount = new Uint8Array(count);
  for (let k = orderLength - 1; k >= 0; k--) {
    const c = flowOrder[k] ?? 0;
    const kind = basinKind[c] ?? CELL_OPEN;
    let carried = 0;
    const discharge = balance.discharge[c] ?? 0;
    if (kind !== CELL_LAKE && kind !== CELL_DRY && ocean[c] !== 1 && discharge >= threshold) {
      const top = childMax[c] ?? 0;
      carried = top === 0 ? 1 : (childMaxCount[c] ?? 0) >= 2 ? Math.min(255, top + 1) : top;
      order[c] = carried;
      // 이 칸 자신의 유출(km³/년). 들어온 유량(유량 − 자신)이 이미 문턱 이상이면 칸 전체가 강이다
      const own = (runoff[c] ?? 0) * areaOf(grid, c) * KM3_PER_MM_SR;
      length[c] = discharge - own >= threshold || own <= 0 ? 1 : Math.min(1, (discharge - threshold) / own);
    } else if (kind === CELL_LAKE) {
      // 호수를 지나는 강은 등급을 그대로 들고 나간다
      carried = childMax[c] ?? 0;
    }
    const r = receiver[c] ?? -1;
    if (r < 0 || carried === 0) continue;
    const top = childMax[r] ?? 0;
    if (carried > top) {
      childMax[r] = carried;
      childMaxCount[r] = 1;
    } else if (carried === top) {
      childMaxCount[r] = Math.min(255, (childMaxCount[r] ?? 0) + 1);
    }
  }
  return { order, length, basinKind };
}
