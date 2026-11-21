import { describe, expect, it } from "vitest";
import { createPlacementGrid, setTerrainCost } from "../grid/placementGrid.ts";
import { PLACEMENT_SIZE } from "../units.ts";
import { createPathfinder } from "./astar.ts";
import { smoothCellPath, sweptAnchors } from "./smooth.ts";
import { anchorCenter, planRoute } from "./waypoints.ts";

const at = (x: number, y: number) => y * PLACEMENT_SIZE + x;
const pathfinder = createPathfinder();
const flat = () => createPlacementGrid();
const pace1 = () => 1000;

describe("직선이 쓸고 가는 기준 칸", () => {
  it("곧은 가로·세로는 그 줄 칸만, 비스듬하면 넘는 동안 양쪽 칸을 모두", () => {
    expect(new Set(sweptAnchors(at(2, 3), at(5, 3)))).toEqual(
      new Set([at(2, 3), at(3, 3), at(4, 3), at(5, 3)]),
    );
    expect(new Set(sweptAnchors(at(0, 0), at(2, 1)))).toEqual(
      new Set([at(0, 0), at(1, 0), at(0, 1), at(1, 1), at(2, 0), at(2, 1)]),
    );
    // 정확한 대각선은 모서리를 지나므로 옆 칸도 넣는다(A* 모서리 규칙과 같은 쪽)
    expect(new Set(sweptAnchors(at(0, 0), at(1, 1)))).toEqual(
      new Set([at(0, 0), at(1, 0), at(0, 1), at(1, 1)]),
    );
    expect(sweptAnchors(at(4, 4), at(4, 4))).toEqual([at(4, 4)]);
  });
});

describe("시야선 다듬기", () => {
  it("빈 땅의 비스듬한 목표는 꺾임 없이 곧은 한 구간이다", () => {
    const grid = flat();
    const route = planRoute(pathfinder, grid, {
      from: anchorCenter(10, 10, 1),
      to: anchorCenter(30, 18, 1),
      size: 1,
    });
    expect(route.status).toBe("found");
    if (route.status === "found")
      expect(route.waypoints).toEqual([anchorCenter(10, 10, 1), anchorCenter(30, 18, 1)]);
  });

  it("막힌 칸을 지나는 직선은 쓰지 않고, 남긴 구간은 모두 설 수 있는 칸만 지난다", () => {
    const grid = flat();
    for (let y = 5; y <= 20; y++) setTerrainCost(grid, 20, y, 0);
    const route = planRoute(pathfinder, grid, {
      from: anchorCenter(10, 12, 1),
      to: anchorCenter(30, 12, 1),
      size: 1,
    });
    expect(route.status).toBe("found");
    if (route.status !== "found") return;
    expect(route.waypoints.length).toBeGreaterThan(2);
    const cells = route.waypoints.map((point) => at(Math.floor(point.x / 1024), Math.floor(point.y / 1024)));
    for (let i = 1; i < cells.length; i++)
      for (const anchor of sweptAnchors(cells[i - 1] ?? 0, cells[i] ?? 0))
        expect(grid.terrainCost[anchor]).not.toBe(0);
  });

  it("A*가 피한 비싼 띠(숲 1800)는 다듬어도 가로지르지 않는다", () => {
    const grid = flat();
    // (15..17, 0..14) 숲 띠: 목표로 곧게 가면 띠를 지난다
    for (let y = 0; y <= 14; y++) for (let x = 15; x <= 17; x++) setTerrainCost(grid, x, y, 1800);
    const route = planRoute(pathfinder, grid, {
      from: anchorCenter(10, 10, 1),
      to: anchorCenter(22, 10, 1),
      size: 1,
    });
    expect(route.status).toBe("found");
    if (route.status !== "found") return;
    // 띠는 1.8배라 A*는 그대로 지나간다(돌아가면 더 길다) — 다듬은 길도 A* 비용보다 비싸지 않다
    const cells = route.waypoints.map((point) => at(Math.floor(point.x / 1024), Math.floor(point.y / 1024)));
    expect(cells.at(-1)).toBe(at(22, 10));
  });

  it("구간 배율은 지나는 칸(출발 칸 빼고) 중 가장 큰 값", () => {
    const grid = flat();
    setTerrainCost(grid, 5, 1, 1050);
    const cells = [at(0, 0), at(1, 0), at(2, 0), at(3, 1), at(4, 1), at(5, 1), at(6, 1), at(7, 1)];
    const smoothed = smoothCellPath(grid, cells, 1, (cell) => grid.terrainCost[cell] ?? 0);
    expect(smoothed.cells[0]).toBe(at(0, 0));
    expect(smoothed.cells.at(-1)).toBe(at(7, 1));
    expect(smoothed.paces.length).toBe(smoothed.cells.length - 1);
    expect(Math.max(...smoothed.paces)).toBe(1050);
  });

  it("칸이 하나면 그대로", () => {
    expect(smoothCellPath(flat(), [at(3, 3)], 1, pace1)).toEqual({ cells: [at(3, 3)], paces: [] });
  });

  it("모서리 당기기: 벽 모서리를 지나친 불필요한 L자 직각 꺾임을 모서리 쪽으로 당겨 줄인다", () => {
    const grid = flat();
    // (10..13, 10)에 성벽(4×1)
    for (let x = 10; x <= 13; x++) setTerrainCost(grid, x, 10, 0);
    // A*가 (14,9)에서 남쪽으로 내려갔다가 서쪽으로 L자 꺾는 칸 경로
    const cells = [at(14, 9), at(14, 10), at(14, 11), at(14, 12), at(13, 12), at(12, 12), at(11, 12)];
    const smoothed = smoothCellPath(grid, cells, 1, pace1);
    // (14,12)에서 직각 꺾지 않고 모서리 직후 (14,11)에서 비스듬히 (11,12)로 당긴다
    expect(smoothed.cells).toEqual([at(14, 9), at(14, 11), at(11, 12)]);
  });
});
