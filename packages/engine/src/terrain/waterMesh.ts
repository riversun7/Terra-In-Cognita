// 꼭짓점 물 높이 → 물 면 메시(강·호수·바다, ADR 2026-10-31-second-map-from-planet WP-3) — 순수 코드(시험 대상).
// 꼭짓점 129² 격자 하나를 나눠 쓰고, 네 꼭짓점 가운데 하나라도 물인 지형 칸만 삼각형 둘로 덮는다.
// 물이 아닌 꼭짓점은 둘레(그 꼭짓점을 나누는 칸들의 꼭짓점) 물 높이의 최댓값에 둔다: 물가에서 물 면이 수평으로 땅 속까지
// 이어지고, 땅이 물 위로 솟은 곳은 지형이 가린다. 물 높이가 다른 강·호수가 맞닿는 곳은 경사진 면이 된다(작다).
import {
  HEIGHT_UNIT_M,
  NO_WATER_UNITS,
  TERRAIN_CELLS,
  TERRAIN_VERTICES,
  type TerrainInput,
} from "./terrainData.ts";

export interface WaterMeshArrays {
  /** 꼭짓점 위치(m) x, y, z — 129² */
  positions: Float32Array;
  /** 물 칸만의 삼각형 */
  indices: Uint32Array;
}

/** 꼭짓점 (c, r)의 물 높이(0.1m 단위, 없으면 NO_WATER_UNITS) */
function waterAt(levels: Int16Array, heights: Int16Array, c: number, r: number): number {
  const index = r * TERRAIN_VERTICES + c;
  const level = levels[index] ?? NO_WATER_UNITS;
  return level !== NO_WATER_UNITS && level > (heights[index] ?? 0) ? level : NO_WATER_UNITS;
}

/** 물 면 메시. waterLevels가 없거나 물이 하나도 없으면 null */
export function buildWaterMesh(input: TerrainInput): WaterMeshArrays | null {
  const levels = input.waterLevels;
  if (!levels) return null;
  const { heights } = input;
  const wet = new Int16Array(TERRAIN_VERTICES * TERRAIN_VERTICES);
  let any = false;
  for (let r = 0; r < TERRAIN_VERTICES; r++) {
    for (let c = 0; c < TERRAIN_VERTICES; c++) {
      const level = waterAt(levels, heights, c, r);
      wet[r * TERRAIN_VERTICES + c] = level;
      if (level !== NO_WATER_UNITS) any = true;
    }
  }
  if (!any) return null;
  const positions = new Float32Array(TERRAIN_VERTICES * TERRAIN_VERTICES * 3);
  for (let r = 0; r < TERRAIN_VERTICES; r++) {
    for (let c = 0; c < TERRAIN_VERTICES; c++) {
      let level = wet[r * TERRAIN_VERTICES + c] ?? NO_WATER_UNITS;
      if (level === NO_WATER_UNITS) {
        // 둘레 8꼭짓점 물 높이의 최댓값(없으면 땅보다 1m 아래: 이 꼭짓점을 쓰는 물 칸이 없다)
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= TERRAIN_VERTICES || cc >= TERRAIN_VERTICES) continue;
            level = Math.max(level, wet[rr * TERRAIN_VERTICES + cc] ?? NO_WATER_UNITS);
          }
        }
        if (level === NO_WATER_UNITS) level = (heights[r * TERRAIN_VERTICES + c] ?? 0) - 10;
      }
      const o = (r * TERRAIN_VERTICES + c) * 3;
      positions[o] = c * input.cellSizeM;
      positions[o + 1] = input.baseHeightM + level * HEIGHT_UNIT_M;
      positions[o + 2] = r * input.cellSizeM;
    }
  }
  const quads: number[] = [];
  for (let r = 0; r < TERRAIN_CELLS; r++) {
    for (let c = 0; c < TERRAIN_CELLS; c++) {
      const a = r * TERRAIN_VERTICES + c;
      const corners = [a, a + 1, a + TERRAIN_VERTICES, a + TERRAIN_VERTICES + 1];
      if (corners.every((v) => wet[v] === NO_WATER_UNITS)) continue;
      // 위에서 보아 반시계(앞면이 위를 본다): a → a+129 → a+1, a+1 → a+129 → a+130
      quads.push(a, a + TERRAIN_VERTICES, a + 1, a + 1, a + TERRAIN_VERTICES, a + TERRAIN_VERTICES + 1);
    }
  }
  return { positions, indices: Uint32Array.from(quads) };
}
