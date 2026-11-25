// 미니맵 그림 자료 시험 — 지표 색, 기울기 밝기, 물은 평평하게, 틀린 크기.
import { TERRAIN_SURFACE } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import { MINIMAP_FULL, MINIMAP_MIN_SPAN, buildingsView, terrainPixels } from "./cityMinimap.ts";

const flat = (size: number, surface: number, height = 0) => ({
  terrainSize: size,
  heights: new Int32Array((size + 1) * (size + 1)).fill(height),
  surface: new Uint8Array(size * size).fill(surface),
  cellSizeMm: 4000,
});

const pixel = (pixels: Uint8ClampedArray, index: number): number[] =>
  Array.from(pixels.slice(index * 4, index * 4 + 4));

describe("terrainPixels", () => {
  it("평평한 땅은 지표 색 그대로(불투명), 지표마다 색이 다르다", () => {
    const grass = terrainPixels(flat(2, TERRAIN_SURFACE.grass));
    expect(grass).toHaveLength(2 * 2 * 4);
    expect(pixel(grass, 0)).toEqual([116, 158, 92, 255]);
    expect(pixel(grass, 3)).toEqual([116, 158, 92, 255]);
    expect(pixel(terrainPixels(flat(1, TERRAIN_SURFACE.water)), 0)).toEqual([52, 104, 164, 255]);
    expect(pixel(terrainPixels(flat(1, TERRAIN_SURFACE.snow)), 0)).toEqual([236, 240, 244, 255]);
    // 모르는 지표는 풀 색
    expect(pixel(terrainPixels(flat(1, 99)), 0)).toEqual([116, 158, 92, 255]);
  });

  it("남동쪽이 높으면(북서로 기운 비탈) 밝고 낮으면 어둡다, 물은 밝기를 바꾸지 않는다", () => {
    const up = flat(1, TERRAIN_SURFACE.rock);
    up.heights[3] = 40;
    const down = flat(1, TERRAIN_SURFACE.rock);
    down.heights[3] = -40;
    const level = pixel(terrainPixels(flat(1, TERRAIN_SURFACE.rock)), 0)[0] ?? 0;
    expect(pixel(terrainPixels(up), 0)[0]).toBeGreaterThan(level);
    expect(pixel(terrainPixels(down), 0)[0]).toBeLessThan(level);
    // 가파른 비탈도 상한(±30%) 안
    const cliff = flat(1, TERRAIN_SURFACE.rock);
    cliff.heights[3] = 100_000;
    expect(pixel(terrainPixels(cliff), 0)[0]).toBe(Math.round(128 * 1.3));
    const sea = flat(1, TERRAIN_SURFACE.water);
    sea.heights[3] = 5_000;
    expect(pixel(terrainPixels(sea), 0)).toEqual([52, 104, 164, 255]);
  });

  it("크기가 맞지 않으면 빈 그림", () => {
    expect(terrainPixels({ ...flat(2, 1), surface: new Uint8Array(3) })).toHaveLength(0);
    expect(terrainPixels({ ...flat(2, 1), heights: new Int32Array(4) })).toHaveLength(0);
    expect(terrainPixels({ ...flat(2, 1), terrainSize: 0 })).toHaveLength(0);
  });
});

const rect = (x: number, y: number) => ({ x, y, width: 3, height: 3 });

describe("buildingsView", () => {
  it("건물 칸을 모르면 전체", () => {
    expect(buildingsView([], { x: 5, y: 5 })).toEqual(MINIMAP_FULL);
  });

  it("작게 뭉친 건물은 가장 작은 한 변으로, 묶음 가운데에 맞춘다", () => {
    const view = buildingsView([rect(100, 100), rect(110, 104)], null);
    expect(view.size).toBe(MINIMAP_MIN_SPAN);
    // 묶음 가운데 = (106.5, 103.5) → 왼쪽 위 = 가운데 − 32
    expect(view).toEqual({ x: 75, y: 72, size: MINIMAP_MIN_SPAN });
  });

  it("건물과 기준 자리를 모두 담고 여유를 둔다, 2차맵 밖으로 나가지 않는다", () => {
    const view = buildingsView([rect(10, 10), rect(120, 40)], { x: 60, y: 150 });
    // 가로 10~123, 세로 10~151 → 긴 쪽 141 + 여유 20
    expect(view.size).toBe(161);
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.y).toBeGreaterThanOrEqual(0);
    expect(view.x).toBeLessThanOrEqual(10);
    expect(view.y).toBeLessThanOrEqual(10);
    expect(view.x + view.size).toBeGreaterThanOrEqual(123);
    expect(view.y + view.size).toBeGreaterThanOrEqual(151);
    // 구석의 건물: 네모가 2차맵 안으로 밀린다
    expect(buildingsView([rect(0, 0)], null)).toEqual({ x: 0, y: 0, size: MINIMAP_MIN_SPAN });
    expect(buildingsView([rect(253, 253)], null)).toEqual({ x: 192, y: 192, size: MINIMAP_MIN_SPAN });
    // 2차맵 전체에 퍼지면 전체
    expect(buildingsView([rect(0, 0), rect(253, 253)], null)).toEqual(MINIMAP_FULL);
  });
});
