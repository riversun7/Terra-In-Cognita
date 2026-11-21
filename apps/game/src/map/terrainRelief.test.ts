// 게임 2차맵 높이 과장 시험 — 해수면 기준 ×4, 이웃 경계 이어짐, 높이 폭이 크면 드는 배율로 낮춤
import type { TerrainInput } from "@terra/engine";
import { describe, expect, it } from "vitest";
import { SECOND_MAP_RELIEF, gameTerrainView } from "./terrainRelief.ts";

const V = 129;
const NO_WATER = -32_768;

/** 동쪽으로 칸마다 dmPerCell(0.1m)씩 오르는 지형. baseHeightM은 heights 0의 높이 */
function slope(dmPerCell: number, baseHeightM: number, startDm = 0): TerrainInput {
  const heights = new Int16Array(V * V);
  for (let r = 0; r < V; r++) for (let c = 0; c < V; c++) heights[r * V + c] = startDm + c * dmPerCell;
  return {
    heights,
    surface: new Uint8Array(128 * 128).fill(1),
    baseHeightM,
    cellSizeM: 11,
    waterLevelM: 0,
    waterLevels: new Int16Array(V * V).fill(NO_WATER),
  };
}

const world = (t: TerrainInput, k: number) => t.baseHeightM + (t.heights[k] ?? 0) * 0.1;

describe("게임 2차맵 높이 과장", () => {
  it("해수면 기준 ×4, 물 없음은 그대로, 해수면은 0", () => {
    const input = slope(1, 200);
    const out = gameTerrainView(input);
    expect(SECOND_MAP_RELIEF).toBe(4);
    expect(world(out, 0)).toBeCloseTo(800, 5);
    expect(world(out, 128)).toBeCloseTo((200 + 12.8) * 4, 5);
    expect(out.waterLevelM).toBe(0);
    expect(out.waterLevels?.[0]).toBe(NO_WATER);
  });

  it("두 2차맵의 같은 경계 높이는 늘린 뒤에도 같다(기준이 같아 경계가 이어진다)", () => {
    // 서쪽 2차맵의 동쪽 끝 열 = 동쪽 2차맵의 서쪽 끝 열(212.8m), 기준 높이(base)는 서로 다르다
    const west = gameTerrainView(slope(1, 200));
    const east = gameTerrainView(slope(2, 212.8));
    expect(world(west, 128)).toBeCloseTo(world(east, 0), 5);
  });

  it("높이 폭 × 4가 int16을 넘으면 드는 배율로 낮춘다", () => {
    // 폭 12.8 × 200 = 2,560m → ×2(5,120m)까지만 든다
    const out = gameTerrainView(slope(200, 0, -12_800));
    const span = world(out, 128) - world(out, 0);
    expect(span).toBeCloseTo(2560 * 2, 3);
  });
});
