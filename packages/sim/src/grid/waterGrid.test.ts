// 물 비용 층: 배 길은 물로만, 걷는 길은 깊은 물을 그대로 피한다(docs/adr/2026-11-13-boats.md 2절)
import { describe, expect, it } from "vitest";
import { createPathfinder } from "../path/astar.ts";
import { removeBuilding } from "../placement/placement.ts";
import { placementCostsFromLayers } from "../terrain/layerCosts.ts";
import { PLACEMENT_CELLS, PLACEMENT_SIZE, TERRAIN_SIZE, TERRAIN_VERTEX_SIZE } from "../units.ts";
import { createPlacementGrid, isPassable } from "./placementGrid.ts";
import {
  SHALLOW_WATER_COST,
  WATER_COST,
  createWaterGrid,
  hasNavigableWater,
  markWaterBuilding,
  waterCostsFromLayers,
} from "./waterGrid.ts";

/** 풀밭에 지형 칸 x 40 ~ 59 세로 강(깊은 물), 그 가운데 y 60 ~ 63 땅 다리(배는 못 지나감) */
function riverLayers() {
  const heights = new Int32Array(TERRAIN_VERTEX_SIZE * TERRAIN_VERTEX_SIZE);
  const surface = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(1);
  for (let ty = 0; ty < TERRAIN_SIZE; ty++)
    for (let tx = 40; tx < 60; tx++) surface[ty * TERRAIN_SIZE + tx] = ty >= 60 && ty < 64 ? 1 : 0;
  return { heights, surface };
}

describe("물 비용 층", () => {
  it("깊은 물 1000, 얕은 물 2000, 땅은 막힘, 차폐 엄폐도 막힘", () => {
    const surface = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(1);
    surface[0] = 0;
    surface[1] = 10;
    const cover = new Uint8Array(PLACEMENT_CELLS);
    cover[1] = 2;
    const costs = waterCostsFromLayers({ surface, cover });
    // 지형 칸 0 = 배치 칸 (0,0)(1,0)(0,1)(1,1)
    expect(costs[0]).toBe(WATER_COST);
    expect(costs[1]).toBe(0);
    expect(costs[PLACEMENT_SIZE]).toBe(WATER_COST);
    expect(costs[2]).toBe(SHALLOW_WATER_COST);
    expect(costs[4]).toBe(0);
    expect(hasNavigableWater(costs)).toBe(true);
    expect(hasNavigableWater(waterCostsFromLayers({ surface: surface.fill(1) }))).toBe(false);
  });

  it("배 길은 물 칸만 지나고, 땅 다리를 넘지 못한다", () => {
    const layers = riverLayers();
    const water = createWaterGrid(waterCostsFromLayers(layers));
    const finder = createPathfinder();
    // 강 위쪽 → 강 아래쪽(위·아래 강은 다리로 갈려 있다)
    const across = finder.findPath(water, { start: { x: 100, y: 20 }, goal: { x: 100, y: 200 }, size: 2 });
    expect(across.status).toBe("no_path");
    const along = finder.findPath(water, { start: { x: 82, y: 10 }, goal: { x: 110, y: 100 }, size: 2 });
    expect(along.status).toBe("found");
    if (along.status !== "found") return;
    for (const cell of along.cells) {
      expect(water.terrainCost[cell]).toBeGreaterThan(0);
      const x = cell % PLACEMENT_SIZE;
      expect(x >= 80 && x < 120).toBe(true);
    }
    // 땅에서는 배가 설 수 없다
    expect(isPassable(water, 10, 10, 2)).toBe(false);
  });

  it("걷는 길은 깊은 물을 그대로 피해 다리로 건넌다", () => {
    const layers = riverLayers();
    const land = createPlacementGrid(placementCostsFromLayers(layers));
    const finder = createPathfinder();
    const walk = finder.findPath(land, { start: { x: 20, y: 20 }, goal: { x: 200, y: 20 }, size: 1 });
    expect(walk.status).toBe("found");
    if (walk.status !== "found") return;
    const crossings = walk.cells.filter((cell) => {
      const x = cell % PLACEMENT_SIZE;
      return x >= 80 && x < 120;
    });
    expect(crossings.length).toBeGreaterThan(0);
    for (const cell of crossings) {
      const y = Math.floor(cell / PLACEMENT_SIZE);
      expect(y >= 120 && y < 128).toBe(true);
    }
  });

  it("건물 칸은 물 격자에서도 막히고, 치우면 열린다", () => {
    const water = createWaterGrid(waterCostsFromLayers(riverLayers()));
    expect(isPassable(water, 90, 30, 1)).toBe(true);
    expect(markWaterBuilding(water, 7, { x: 89, y: 29, width: 3, height: 3, rotation: 0 })).toBe(true);
    expect(markWaterBuilding(water, 7, { x: 89, y: 29, width: 3, height: 3, rotation: 0 })).toBe(false);
    expect(isPassable(water, 90, 30, 1)).toBe(false);
    expect(removeBuilding(water, 7)).toBe(true);
    expect(isPassable(water, 90, 30, 1)).toBe(true);
    // 지도 밖으로 나간 칸은 자른다
    expect(markWaterBuilding(water, 8, { x: 254, y: 254, width: 4, height: 4, rotation: 0 })).toBe(true);
  });
});
