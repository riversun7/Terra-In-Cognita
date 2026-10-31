// 물 면 메시: 물 칸만 덮고, 물 높이를 따르며, 물이 없으면 null
import { describe, expect, it } from "vitest";
import { NO_WATER_UNITS, TERRAIN_CELLS, TERRAIN_VERTICES, type TerrainInput } from "./terrainData.ts";
import { buildWaterMesh } from "./waterMesh.ts";

function input(): TerrainInput {
  return {
    heights: new Int16Array(TERRAIN_VERTICES * TERRAIN_VERTICES).fill(50),
    surface: new Uint8Array(TERRAIN_CELLS * TERRAIN_CELLS).fill(1),
    baseHeightM: 100,
    cellSizeM: 10,
    waterLevelM: 0,
    waterLevels: new Int16Array(TERRAIN_VERTICES * TERRAIN_VERTICES).fill(NO_WATER_UNITS),
  };
}

describe("물 면 메시", () => {
  it("물이 없거나 물 높이 칸이 없으면 null", () => {
    expect(buildWaterMesh(input())).toBeNull();
    expect(buildWaterMesh({ ...input(), waterLevels: undefined })).toBeNull();
  });

  it("물 꼭짓점 하나 → 그 꼭짓점을 나누는 칸 넷, 높이 = 물 높이(땅 위만 물)", () => {
    const terrain = input();
    const at = 10 * TERRAIN_VERTICES + 20;
    terrain.heights[at] = 30;
    if (terrain.waterLevels) terrain.waterLevels[at] = 45;
    const mesh = buildWaterMesh(terrain);
    expect(mesh?.indices.length).toBe(4 * 6);
    // 물 꼭짓점: 100 + 4.5m, 둘레 마른 꼭짓점도 같은 높이(수평 물가)
    expect(mesh?.positions[at * 3 + 1]).toBeCloseTo(104.5);
    expect(mesh?.positions[(at + 1) * 3 + 1]).toBeCloseTo(104.5);
    expect(mesh?.positions[at * 3]).toBe(200);
    expect(mesh?.positions[at * 3 + 2]).toBe(100);
  });

  it("물 높이가 땅보다 낮거나 같으면 물이 아니다", () => {
    const terrain = input();
    if (terrain.waterLevels) terrain.waterLevels[5] = 50;
    expect(buildWaterMesh(terrain)).toBeNull();
  });
});
