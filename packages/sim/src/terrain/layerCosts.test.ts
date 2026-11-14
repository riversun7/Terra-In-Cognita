// 지형 층 → 배치 칸 비용: 지표 표, 벼랑, 차폐 엄폐, 임시 지형과 같은 결과
import { describe, expect, it } from "vitest";
import { PLACEMENT_CELLS, TERRAIN_SIZE, TERRAIN_VERTEX_SIZE } from "../units.ts";
import {
  CLIFF_RELIEF_CM,
  COVER_BLOCKING,
  FOREST_COST_PM,
  SLOW_TABLE_SIZE,
  SURFACE_COST,
  isTreeArt,
  placementCostsFromLayers,
} from "./layerCosts.ts";
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

  it("그림 층이 있으면 나무가 선 차폐 칸은 숲 비용으로 지나가고, 큰 바위(그림 6) 차폐는 막힘", () => {
    const layers = flat();
    const cover = new Uint8Array(PLACEMENT_CELLS);
    const art = new Uint8Array(PLACEMENT_CELLS);
    for (const [cell, code] of [
      [256 * 4 + 4, 1],
      [256 * 4 + 5, 2],
      [256 * 4 + 6, 3],
      [256 * 4 + 7, 6],
    ] as const) {
      cover[cell] = COVER_BLOCKING;
      art[cell] = code;
    }
    const costs = placementCostsFromLayers({ ...layers, cover, art });
    const forest = Math.floor((1000 * FOREST_COST_PM) / 1000);
    expect([costs[256 * 4 + 4], costs[256 * 4 + 5], costs[256 * 4 + 6]]).toEqual([forest, forest, forest]);
    expect(costs[256 * 4 + 7]).toBe(0);
    // 그림 층이 없으면 예전 그대로 막힘
    expect(placementCostsFromLayers({ ...layers, cover })[256 * 4 + 4]).toBe(0);
    expect([1, 2, 3].every(isTreeArt)).toBe(true);
    expect([0, 4, 5, 6, 7].some(isTreeArt)).toBe(false);
    expect(() => placementCostsFromLayers({ ...layers, cover, art: new Uint8Array(3) })).toThrow(RangeError);
  });

  it("느림 배율 표: 그 그림이 선 지나갈 수 있는 칸은 지표 비용 × 배율, 막힘·차폐·숲은 그대로, 그림 층이 없으면 무시", () => {
    const layers = flat();
    layers.surface[3] = 6; // 눈(1300) — 배치 칸 (6 ~ 7, 0 ~ 1)
    const cover = new Uint8Array(PLACEMENT_CELLS);
    const art = new Uint8Array(PLACEMENT_CELLS);
    const slowByArt = new Uint16Array(SLOW_TABLE_SIZE);
    slowByArt[21] = 1500; // 눈더미(그림 21)
    slowByArt[44] = 1000; // 1000 = 없음
    art[6] = 21; // 눈 위 눈더미
    art[256 * 2 + 2] = 21; // 풀 위 눈더미
    art[256 * 2 + 3] = 44;
    art[256 * 2 + 4] = 21;
    cover[256 * 2 + 4] = 1; // 은폐 칸도 느려진다
    art[256 * 2 + 5] = 21;
    cover[256 * 2 + 5] = COVER_BLOCKING; // 차폐(나무 아님)는 막힘 그대로
    art[256 * 2 + 6] = 1;
    cover[256 * 2 + 6] = COVER_BLOCKING; // 숲은 숲 비용 그대로
    slowByArt[1] = 3000;
    layers.surface[0] = 0; // 물(막힘) 위 — 배치 칸 (0 ~ 1, 0 ~ 1)
    art[1] = 21;
    const costs = placementCostsFromLayers({ ...layers, cover, art, slowByArt });
    expect(costs[6]).toBe(Math.floor((1300 * 1500) / 1000));
    expect(costs[7]).toBe(1300);
    expect(costs[256 * 2 + 2]).toBe(1500);
    expect(costs[256 * 2 + 3]).toBe(1000);
    expect(costs[256 * 2 + 4]).toBe(1500);
    expect(costs[256 * 2 + 5]).toBe(0);
    expect(costs[256 * 2 + 6]).toBe(Math.floor((1000 * FOREST_COST_PM) / 1000));
    expect(costs[1]).toBe(0);
    // 표가 없거나 그림 층이 없으면 예전 그대로
    const plain = placementCostsFromLayers({ ...layers, cover, art });
    expect([plain[6], plain[256 * 2 + 2]]).toEqual([1300, 1000]);
    expect(placementCostsFromLayers({ ...layers, cover, slowByArt })[256 * 2 + 2]).toBe(1000);
    // u16 상한
    const huge = new Uint16Array(SLOW_TABLE_SIZE);
    huge[21] = 0xffff;
    layers.surface[3] = 10;
    expect(placementCostsFromLayers({ ...layers, art, slowByArt: huge })[6]).toBe(0xffff);
    expect(() => placementCostsFromLayers({ ...layers, art, slowByArt: new Uint16Array(3) })).toThrow(
      RangeError,
    );
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
