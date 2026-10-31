// 지형 층 → 배치 칸 비용: 지표 표, 벼랑, 차폐 엄폐, 임시 지형과 같은 결과
import { describe, expect, it } from "vitest";
import { PLACEMENT_CELLS, TERRAIN_SIZE, TERRAIN_VERTEX_SIZE } from "../units.ts";
import { CLIFF_RELIEF_CM, COVER_BLOCKING, SURFACE_COST, placementCostsFromLayers } from "./layerCosts.ts";
import { generateTempTerrain, placementCostsFromTerrain, seedFromCellKey } from "./tempTerrain.ts";

const flat = () => ({
  heights: new Int32Array(TERRAIN_VERTEX_SIZE * TERRAIN_VERTEX_SIZE),
  surface: new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(1),
});

describe("지형 층 비용", () => {
  it("지표 11종: 물만 막힘, 0 ~ 3은 S1 임시값 그대로", () => {
    expect(SURFACE_COST.length).toBe(11);
    expect(Array.from(SURFACE_COST.subarray(0, 4))).toEqual([0, 1000, 1050, 1300]);
    expect(SURFACE_COST.slice(1).every((cost) => cost > 0)).toBe(true);
  });

  it("지형 칸 하나 = 배치 칸 2×2, 차폐 엄폐 칸만 막힘, 모르는 지표는 막힘", () => {
    const layers = flat();
    layers.surface[0] = 10; // 얕은 물
    layers.surface[1] = 200; // 모르는 번호
    const cover = new Uint8Array(PLACEMENT_CELLS);
    cover[256 * 10 + 10] = COVER_BLOCKING;
    cover[256 * 10 + 11] = 1;
    const costs = placementCostsFromLayers({ ...layers, cover });
    expect([costs[0], costs[1], costs[256], costs[257]]).toEqual([2500, 2500, 2500, 2500]);
    expect([costs[2], costs[3]]).toEqual([0, 0]);
    expect(costs[256 * 10 + 10]).toBe(0);
    expect(costs[256 * 10 + 11]).toBe(1000);
  });

  it("네 꼭짓점 높이 차가 벼랑 기준 이상이면 막힘", () => {
    const layers = flat();
    layers.heights[TERRAIN_VERTEX_SIZE + 1] = CLIFF_RELIEF_CM;
    const costs = placementCostsFromLayers(layers);
    // 꼭짓점 (1, 1)을 나누는 지형 칸 넷이 막힌다
    expect(costs[0]).toBe(0);
    expect(costs[2 * 256 + 2]).toBe(0);
    expect(costs[4]).toBe(1000);
  });

  it("임시 지형 비용은 층 함수와 같다(엄폐 없음)", () => {
    const terrain = generateTempTerrain(seedFromCellKey(0x1234_5678));
    expect(placementCostsFromTerrain(terrain)).toEqual(
      placementCostsFromLayers({ heights: terrain.heights, surface: terrain.surface }),
    );
  });

  it("크기가 틀리면 RangeError", () => {
    expect(() => placementCostsFromLayers({ ...flat(), cover: new Uint8Array(3) })).toThrow(RangeError);
    expect(() =>
      placementCostsFromLayers({ heights: new Int32Array(3), surface: new Uint8Array(3) }),
    ).toThrow(RangeError);
  });
});
