// 2차맵 높이 과장(보기만) — 엔진에 넘기기 전에 지형 입력의 높이·물 높이를 기준 높이에서 배율만큼 늘린다.
// 생성기·서버 지형·이동 판정(비탈·물)은 그대로다. 게임 높이는 실제의 1/12이고(@terra/planet generator VERTICAL_SCALE),
// 1차맵은 ×12로 그리는데 2차맵은 ×1이라 1차맵에서 높낮이가 보이는 곳도 2차맵은 평지처럼 보였다(사용자 지적 2026-11-21).
// - 게임 2차맵 화면: 기준 = 해수면(0)이라 지금 2차맵·이웃 2차맵이 따로 늘려도 경계가 이어진다(SECOND_MAP_RELIEF).
// - 개발자 2차맵 시험(editor/secondMapLab/labTerrain.ts)도 같은 함수를 쓴다(기준 = 그 2차맵의 가장 낮은 곳).
// - 높이는 0.1m 정수(int16)라 높이 폭 × 배율이 int16 폭(약 6,553m)을 넘으면 그 배율은 못 쓴다(reliefFits).
// 엔진 상수는 가져오지 않고 mapWire.ts의 같은 값을 쓴다(엔진 진입점은 three를 함께 불러온다).
import type { TerrainInput } from "@terra/engine";
import { ENGINE_HEIGHT_UNIT_M, ENGINE_NO_WATER } from "./mapWire.ts";

/** 게임 2차맵 화면의 높이 과장 배율(ADR 2026-11-21-second-map-relief) */
export const SECOND_MAP_RELIEF = 4;

const INT16_MIN = -32_768;
const INT16_MAX = 32_767;
/** 물 없음 값을 빼고 쓸 수 있는 폭(0.1m) */
const USABLE_SPAN = INT16_MAX - (INT16_MIN + 1);

/** 높이·물 높이의 세계 값(0.1m) 범위. 물 없음은 뺀다 */
export function terrainWorldRange(input: TerrainInput): { low: number; high: number } {
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

/** 이 지형을 factor배로 늘려도 int16에 드는지 */
export function reliefFits(input: TerrainInput, factor: number): boolean {
  const { low, high } = terrainWorldRange(input);
  return (high - low) * factor <= USABLE_SPAN;
}

/**
 * 높이 과장한 지형 입력(새 배열): 세계 높이 w → pivot + (w − pivot) × factor. pivot은 0.1m 단위다.
 * 1이면 그대로 돌려준다. 배율이 0 이하이거나 int16에 들지 않으면 RangeError
 */
export function scaleTerrainRelief(input: TerrainInput, factor: number, pivot: number): TerrainInput {
  if (factor === 1) return input;
  if (!(factor > 0) || !reliefFits(input, factor)) {
    throw new RangeError(`exaggeration ${factor} is too large for this terrain`);
  }
  const base = Math.round(input.baseHeightM / ENGINE_HEIGHT_UNIT_M);
  const scale = (world: number): number => Math.round(pivot + (world - pivot) * factor);
  const { low, high } = terrainWorldRange(input);
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

/**
 * 게임 2차맵 화면에 넘길 지형: 해수면 기준 SECOND_MAP_RELIEF배. 높이 폭이 너무 커 그 배율이 int16에 들지 않으면
 * 드는 만큼(정수 배, 최소 1)만 늘린다 — 그런 2차맵은 이웃과 경계가 어긋날 수 있다(F9에서는 높이 폭 약 1,600m 넘는 곳)
 */
export function gameTerrainView(input: TerrainInput): TerrainInput {
  let factor = SECOND_MAP_RELIEF;
  while (factor > 1 && !reliefFits(input, factor)) factor -= 1;
  return scaleTerrainRelief(input, factor, 0);
}
