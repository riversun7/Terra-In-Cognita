// 물 비용 층(배 길찾기) — docs/adr/2026-11-13-boats.md 2절(기획 D-540·D-536 "심해는 배로").
// 걷는 길의 땅 격자는 그대로 두고, 배만 쓰는 배치 격자를 하나 더 만든다. A*·연결 영역·꺾이는 점(path/*)은 격자의 통과 폭·비용만 읽어 그대로 쓴다.
// - 물 비용(천분율, 0 = 막힘): 지표 물 1000, 얕은 물 2000([임시] 얕은 데서 느림), 그 밖은 막힘. 차폐 엄폐(2)는 막힘.
//   벼랑 높이 차는 보지 않는다(꼭짓점 높이는 물 아래 바닥이라).
// - 건물 칸은 물 격자에도 막힘으로 적는다(얕은 물 위 건물). 땅 격자의 배치 검사(지형 막힘)를 물 격자에 쓸 수 없어 칸만 적는다.
// 지표 번호는 layerCosts.ts SURFACE_COST와 같다(protocol TERRAIN_SURFACE: 물 0, 얕은 물 10).
import { PLACEMENT_CELLS, PLACEMENT_PER_TERRAIN, PLACEMENT_SIZE, TERRAIN_SIZE } from "../units.ts";
import { COVER_BLOCKING, type TerrainLayers } from "../terrain/layerCosts.ts";
import { type BuildingPlacement, footprintRect } from "../placement/placement.ts";
import { type PlacementGrid, createPlacementGrid, writeBuildingCells } from "./placementGrid.ts";

/** 지표 물(깊은 물: 바다·호수·깊은 강) */
export const SURFACE_WATER = 0;
/** 지표 얕은 물(하천 등급 1 ~ 2 — 걸어서도 건넌다) */
export const SURFACE_SHALLOW_WATER = 10;
/** 깊은 물 한 칸의 배 비용(천분율) */
export const WATER_COST = 1000;
/** [임시] 얕은 물 한 칸의 배 비용(천분율). 기획 수치 없음 → 질문 1273 */
export const SHALLOW_WATER_COST = 2000;

/** 배치 칸 65,536개의 배 비용(천분율, 0 = 막힘). 땅 비용과 같은 칸 차례 */
export function waterCostsFromLayers(layers: Pick<TerrainLayers, "surface" | "cover">): Uint16Array {
  const { surface, cover } = layers;
  if (surface.length !== TERRAIN_SIZE * TERRAIN_SIZE)
    throw new RangeError("terrain layers do not match the second map size");
  if (cover && cover.length !== PLACEMENT_CELLS)
    throw new RangeError("cover does not match the placement size");
  const costs = new Uint16Array(PLACEMENT_CELLS);
  for (let ty = 0; ty < TERRAIN_SIZE; ty++) {
    for (let tx = 0; tx < TERRAIN_SIZE; tx++) {
      const kind = surface[ty * TERRAIN_SIZE + tx];
      const cost =
        kind === SURFACE_WATER ? WATER_COST : kind === SURFACE_SHALLOW_WATER ? SHALLOW_WATER_COST : 0;
      if (cost === 0) continue;
      for (let dy = 0; dy < PLACEMENT_PER_TERRAIN; dy++) {
        const row = (ty * PLACEMENT_PER_TERRAIN + dy) * PLACEMENT_SIZE + tx * PLACEMENT_PER_TERRAIN;
        for (let dx = 0; dx < PLACEMENT_PER_TERRAIN; dx++) {
          const cell = row + dx;
          costs[cell] = cover && cover[cell] === COVER_BLOCKING ? 0 : cost;
        }
      }
    }
  }
  return costs;
}

/** 배가 지나갈 수 있는 칸이 하나라도 있나 */
export function hasNavigableWater(costs: Uint16Array): boolean {
  for (const cost of costs) if (cost !== 0) return true;
  return false;
}

/** 물 비용으로 배 격자를 만든다(건물은 markWaterBuilding으로 적는다) */
export function createWaterGrid(costs: Uint16Array): PlacementGrid {
  return createPlacementGrid(costs);
}

/**
 * 건물 하나를 물 격자에 막힘으로 적는다(칸 검사 없음 — 땅 격자에서 이미 놓인 건물). 지도 밖으로 나간 칸은 자른다.
 * 같은 ID가 이미 있으면 바꾸지 않고 false
 */
export function markWaterBuilding(
  grid: PlacementGrid,
  buildingId: number,
  placement: BuildingPlacement,
): boolean {
  if (grid.buildings.has(buildingId)) return false;
  const rect = footprintRect(placement);
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(PLACEMENT_SIZE, rect.x + rect.width);
  const y1 = Math.min(PLACEMENT_SIZE, rect.y + rect.height);
  if (x1 <= x0 || y1 <= y0) return false;
  const clipped = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  writeBuildingCells(grid, clipped, buildingId);
  grid.buildings.set(buildingId, clipped);
  return true;
}
