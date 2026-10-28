import { describe, expect, it } from "vitest";
import { footprintCells, footprintInside } from "../buildings/footprint.ts";
import { PLACEMENT_CELLS, SURFACE, terrainProblem } from "../terrain/terrainData.ts";
import { createMockTerrain } from "./mockTerrain.ts";
import { createMockWorld, segmentWalkable } from "./mockWorld.ts";

describe("[임시] 가짜 2차맵", () => {
  it("같은 시드면 같은 지형, 다른 시드면 다른 지형", () => {
    const a = createMockTerrain(7);
    const b = createMockTerrain(7);
    const c = createMockTerrain(8);
    expect(terrainProblem(a)).toBeNull();
    expect(a.heights).toEqual(b.heights);
    expect(a.surface).toEqual(b.surface);
    expect(a.heights).not.toEqual(c.heights);
  });

  it("물·풀·흙·바위가 모두 있고 높이는 int16 데시미터 범위 안", () => {
    const terrain = createMockTerrain(7);
    const codes = new Set(terrain.surface);
    for (const code of [SURFACE.water, SURFACE.grass, SURFACE.dirt, SURFACE.rock])
      expect(codes.has(code)).toBe(true);
    const meters = [...terrain.heights].map((value) => value / 10);
    expect(Math.min(...meters)).toBeGreaterThan(-100);
    expect(Math.max(...meters)).toBeLessThan(200);
  });

  it("유닛 1,000개는 걸어갈 수 있는 칸에, 건물은 겹치지 않고 2차맵 안에", () => {
    const terrain = createMockTerrain(7);
    const world = createMockWorld(terrain, 7);
    expect(world.units).toHaveLength(1000);
    for (const unit of world.units) {
      const cell = Math.floor(unit.y) * PLACEMENT_CELLS + Math.floor(unit.x);
      expect(world.walkable[cell]).toBe(1);
      expect(world.speeds.get(unit.id)).toBeGreaterThanOrEqual(0.42);
    }
    expect(world.buildings.length).toBeGreaterThan(10);
    const taken = new Set<number>();
    for (const building of world.buildings) {
      expect(footprintInside(building, PLACEMENT_CELLS)).toBe(true);
      for (const cell of footprintCells(building, PLACEMENT_CELLS)) {
        expect(taken.has(cell)).toBe(false);
        taken.add(cell);
      }
    }
  });

  it("직선 길 검사: 막힌 칸을 지나면 false", () => {
    const walkable = new Uint8Array(PLACEMENT_CELLS * PLACEMENT_CELLS).fill(1);
    walkable[5 * PLACEMENT_CELLS + 5] = 0;
    expect(segmentWalkable(walkable, 0.5, 5.5, 10.5, 5.5)).toBe(false);
    expect(segmentWalkable(walkable, 0.5, 6.5, 10.5, 6.5)).toBe(true);
    expect(segmentWalkable(walkable, 0.5, 0.5, -3, 0.5)).toBe(false);
  });
});
