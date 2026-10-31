// 연결 영역 번호와 길찾기 빠른 no_path: 벽으로 갈리면 다른 영역, 펼치지 않고 no_path, 벽을 치우면 캐시를 비워 다시 이어진다
import { describe, expect, it } from "vitest";
import { createPathfinder } from "../path/astar.ts";
import { componentLabels } from "./components.ts";
import { createPlacementGrid, setRoad, setTerrainCost } from "./placementGrid.ts";

/** 세로 벽(x = 100, 위에서 아래까지) */
function walled() {
  const grid = createPlacementGrid();
  for (let y = 0; y < 256; y++) setTerrainCost(grid, 100, y, 0);
  return grid;
}

describe("연결 영역", () => {
  it("벽 양쪽은 다른 영역이고, 같은 쪽은 같은 영역, 막힌 칸은 −1", () => {
    const grid = walled();
    const labels = componentLabels(grid, 1);
    expect(labels[10 * 256 + 10]).toBe(labels[200 * 256 + 50]);
    expect(labels[10 * 256 + 10]).not.toBe(labels[10 * 256 + 150]);
    expect(labels[10 * 256 + 100]).toBe(-1);
    // 같은 격자에서 다시 부르면 같은 배열(캐시)
    expect(componentLabels(grid, 1)).toBe(labels);
  });

  it("다른 영역 목표는 펼치지 않고 no_path, 벽에 도로를 놓으면(캐시 비움) 다시 찾는다", () => {
    const grid = walled();
    const pathfinder = createPathfinder();
    const request = { start: { x: 10, y: 10 }, goal: { x: 150, y: 10 }, size: 1 as const };
    expect(pathfinder.findPath(grid, request)).toEqual({ status: "no_path", expanded: 0 });
    setRoad(grid, 100, 10, 1);
    expect(pathfinder.findPath(grid, request).status).toBe("found");
  });

  it("크기 등급마다 따로: 폭 1칸 틈은 등급 1만 지난다", () => {
    const grid = walled();
    setTerrainCost(grid, 100, 50, 1000);
    const one = componentLabels(grid, 1);
    const two = componentLabels(grid, 2);
    expect(one[10 * 256 + 10]).toBe(one[10 * 256 + 150]);
    expect(two[10 * 256 + 10]).not.toBe(two[10 * 256 + 150]);
  });
});
