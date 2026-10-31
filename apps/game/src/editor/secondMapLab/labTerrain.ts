// 2차맵 시험 화면의 순수 계산 — 높이 과장(보기만), 누른 칸의 값. ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (개발자 2차맵 시험)".
// - 높이 과장: 엔진에 넘기기 전에 지형 입력의 높이·물 높이를 기준 높이(지금 2차맵의 가장 낮은 곳)에서 배율만큼 늘린다.
//   생성기·서버 지형·저장 자료는 그대로다. 이웃 2차맵도 같은 기준 높이로 늘려야 경계가 이어진다(labPivot).
//   게임 높이는 실제의 1/12이다(@terra/planet generator VERTICAL_SCALE): ×12면 실제 비율이다.
//   높이는 0.1m 정수(int16)라 2차맵 높이 폭 × 배율이 int16 폭(약 6,553m)을 넘으면 그 배율은 못 쓴다(maxExaggeration).
// - 칸 값: 누른 배치 칸(0~255)의 높이(꼭짓점 사이 보간)·경사(그 지형 칸 네 꼭짓점)·지표·물 깊이·엄폐·소품 그림.
//   과장하지 않은 입력으로 센다(화면 과장과 상관없는 실제 게임 값).
// 엔진 상수는 가져오지 않고 mapWire.ts의 같은 값을 쓴다(엔진 진입점은 three를 함께 불러온다).
import type { TerrainInput } from "@terra/engine";
import {
  ENGINE_HEIGHT_UNIT_M,
  ENGINE_NO_WATER,
  ENGINE_PLACEMENT_CELLS,
  ENGINE_TERRAIN_CELLS,
} from "../../map/mapWire.ts";

/** 고를 수 있는 높이 과장 배율(×1 = 지금 게임 그대로, ×12 = 실제 비율) */
export const EXAGGERATION_STEPS = [1, 1.5, 2, 3, 4, 6, 8, 12] as const;

const INT16_MIN = -32_768;
const INT16_MAX = 32_767;
/** 물 없음 값을 빼고 쓸 수 있는 폭(0.1m) */
const USABLE_SPAN = INT16_MAX - (INT16_MIN + 1);
const VERTICES = ENGINE_TERRAIN_CELLS + 1;

/** 높이·물 높이의 세계 값(0.1m) 범위. 물 없음은 뺀다 */
function worldRange(input: TerrainInput): { low: number; high: number } {
  const base = Math.round(input.baseHeightM / ENGINE_HEIGHT_UNIT_M);
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const h of input.heights) {
    low = Math.min(low, h + base);
    high = Math.max(high, h + base);
  }
  for (const w of input.waterLevels ?? []) {
    if (w === ENGINE_NO_WATER) continue;
    low = Math.min(low, w + base);
    high = Math.max(high, w + base);
  }
  return Number.isFinite(low) ? { low, high } : { low: 0, high: 0 };
}

/** 과장 기준 높이(0.1m) = 이 지형의 가장 낮은 곳. 이웃 2차맵에도 같은 값을 넘긴다 */
export function labPivot(input: TerrainInput): number {
  return worldRange(input).low;
}

/** 이 지형에 쓸 수 있는 가장 큰 배율(EXAGGERATION_STEPS 안). 늘 1 이상 */
export function maxExaggeration(input: TerrainInput): number {
  const { low, high } = worldRange(input);
  const span = high - low;
  let best = 1;
  for (const step of EXAGGERATION_STEPS) if (span * step <= USABLE_SPAN) best = step;
  return best;
}

/**
 * 높이 과장한 지형 입력(새 배열): 세계 높이 w → pivot + (w − pivot) × factor. pivot(0.1m)은 기본이 이 지형의 가장 낮은 곳이다.
 * 1이면 그대로 돌려준다. 배율이 이 지형에 너무 크면(maxExaggeration보다 크면) RangeError
 */
export function exaggerateTerrain(
  input: TerrainInput,
  factor: number,
  pivot = labPivot(input),
): TerrainInput {
  if (factor === 1) return input;
  if (!(factor > 0) || factor > maxExaggeration(input)) {
    throw new RangeError(`exaggeration ${factor} is too large for this terrain`);
  }
  const base = Math.round(input.baseHeightM / ENGINE_HEIGHT_UNIT_M);
  const scale = (world: number): number => Math.round(pivot + (world - pivot) * factor);
  const { low, high } = worldRange(input);
  const scaledLow = scale(low);
  const scaledHigh = scale(high);
  // int16에 들면 기준 0, 아니면 가운데를 기준으로 옮긴다(toTerrainInput과 같은 규칙)
  const newBase =
    scaledLow < INT16_MIN + 1 || scaledHigh > INT16_MAX ? Math.round((scaledLow + scaledHigh) / 2) : 0;
  const heights = new Int16Array(input.heights.length);
  for (let k = 0; k < heights.length; k++) heights[k] = scale((input.heights[k] ?? 0) + base) - newBase;
  let waterLevels: Int16Array | undefined;
  if (input.waterLevels) {
    waterLevels = new Int16Array(input.waterLevels.length);
    for (let k = 0; k < waterLevels.length; k++) {
      const w = input.waterLevels[k] ?? ENGINE_NO_WATER;
      waterLevels[k] = w === ENGINE_NO_WATER ? ENGINE_NO_WATER : scale(w + base) - newBase;
    }
  }
  const flatWater = input.waterLevelM / ENGINE_HEIGHT_UNIT_M;
  return {
    ...input,
    heights,
    waterLevels,
    baseHeightM: newBase * ENGINE_HEIGHT_UNIT_M,
    waterLevelM: (pivot + (flatWater - pivot) * factor) * ENGINE_HEIGHT_UNIT_M,
  };
}

/** 누른 배치 칸의 값 */
export interface LabPointInfo {
  /** 배치 칸(0 ~ 255) */
  readonly x: number;
  readonly y: number;
  /** 지형 칸(0 ~ 127) */
  readonly terrainX: number;
  readonly terrainY: number;
  /** 배치 칸 가운데 땅 높이(게임 m, 해수면 0) */
  readonly heightM: number;
  /** 그 지형 칸의 경사(%) = 높이 기울기 × 100 */
  readonly slopePct: number;
  /** 지형 칸 높이 차(네 꼭짓점 최대 − 최소, m) */
  readonly reliefM: number;
  /** 지표 코드(SURFACE) */
  readonly surface: number;
  /** 물 깊이(m). 물이 없으면 0 */
  readonly waterDepthM: number;
  /** 엄폐 값 0·1·2. 층이 없으면 null */
  readonly cover: number | null;
  /** 소품 그림 번호(@terra/shared MAP_PROP_ARTS). 층이 없으면 null */
  readonly art: number | null;
}

/** 배치 칸 좌표(엔진 onGroundTap, 소수 가능) → 칸 값. 2차맵 밖이면 null */
export function labPointInfo(input: TerrainInput, x: number, y: number): LabPointInfo | null {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (!(px >= 0 && py >= 0 && px < ENGINE_PLACEMENT_CELLS && py < ENGINE_PLACEMENT_CELLS)) return null;
  const tx = px >> 1;
  const ty = py >> 1;
  const unit = ENGINE_HEIGHT_UNIT_M;
  const base = input.baseHeightM;
  const vertex = (c: number, r: number): number => base + (input.heights[r * VERTICES + c] ?? 0) * unit;
  const h00 = vertex(tx, ty);
  const h10 = vertex(tx + 1, ty);
  const h01 = vertex(tx, ty + 1);
  const h11 = vertex(tx + 1, ty + 1);
  // 배치 칸 가운데의 지형 칸 안 자리(0 ~ 1)
  const fx = ((px + 0.5) / 2) % 1;
  const fy = ((py + 0.5) / 2) % 1;
  const heightM = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  const dx = (h10 - h00 + (h11 - h01)) / 2 / input.cellSizeM;
  const dz = (h01 - h00 + (h11 - h10)) / 2 / input.cellSizeM;
  // 물: 가장 가까운 꼭짓점의 물 높이
  const nearC = tx + (fx < 0.5 ? 0 : 1);
  const nearR = ty + (fy < 0.5 ? 0 : 1);
  const level = input.waterLevels?.[nearR * VERTICES + nearC] ?? ENGINE_NO_WATER;
  const waterM = input.waterLevels
    ? level === ENGINE_NO_WATER
      ? Number.NEGATIVE_INFINITY
      : base + level * unit
    : input.waterLevelM;
  const cell = py * ENGINE_PLACEMENT_CELLS + px;
  return {
    x: px,
    y: py,
    terrainX: tx,
    terrainY: ty,
    heightM,
    slopePct: Math.hypot(dx, dz) * 100,
    reliefM: Math.max(h00, h10, h01, h11) - Math.min(h00, h10, h01, h11),
    surface: input.surface[ty * ENGINE_TERRAIN_CELLS + tx] ?? 0,
    waterDepthM: Math.max(0, waterM - heightM),
    cover: input.cover ? (input.cover[cell] ?? 0) : null,
    art: input.art ? (input.art[cell] ?? 0) : null,
  };
}
