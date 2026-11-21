import { describe, expect, it } from "vitest";
import type { SizeClass } from "../grid/clearance.ts";
import { createPlacementGrid, setTerrainCost } from "../grid/placementGrid.ts";
import { PLACEMENT_SIZE } from "../units.ts";
import { createPathfinder } from "./astar.ts";
import { anchorAt, anchorCenter, cellPathToWaypoints, planRoute, simplifyCellPath } from "./waypoints.ts";

const at = (x: number, y: number) => y * PLACEMENT_SIZE + x;
const pathfinder = createPathfinder();

describe("꺾이는 점", () => {
  it("방향이 바뀌는 칸과 양 끝만 남긴다", () => {
    const cells = [at(0, 0), at(1, 0), at(2, 0), at(3, 1), at(4, 2), at(4, 3), at(4, 4)];
    expect(simplifyCellPath(cells)).toEqual([at(0, 0), at(2, 0), at(4, 2), at(4, 4)]);
    expect(simplifyCellPath([at(7, 7)])).toEqual([at(7, 7)]);
    expect(simplifyCellPath([at(7, 7), at(8, 8)])).toEqual([at(7, 7), at(8, 8)]);
    expect(simplifyCellPath([])).toEqual([]);
  });

  it("기준 칸 중심(고정소수점): 크기 등급 s면 왼쪽 위 모서리 + s × 512", () => {
    expect(anchorCenter(3, 4, 1)).toEqual({ x: 3584, y: 4608 });
    expect(anchorCenter(3, 4, 2)).toEqual({ x: 4096, y: 5120 });
    expect(anchorCenter(3, 4, 3)).toEqual({ x: 4608, y: 5632 });
  });

  it("위치 → 가장 가까운 중심의 기준 칸", () => {
    for (const size of [1, 2, 3] as SizeClass[]) {
      for (const [x, y] of [
        [0, 0],
        [17, 250],
        [253, 1],
      ] as const) {
        const center = anchorCenter(x, y, size);
        expect(anchorAt(center, size)).toEqual({ x, y });
        // 중심에서 ±511 단위 안은 같은 기준 칸이다
        expect(anchorAt({ x: center.x + 511, y: center.y - 512 }, size)).toEqual({ x, y });
      }
    }
    expect(anchorAt({ x: 1023, y: 1024 }, 1)).toEqual({ x: 0, y: 1 });
    expect(anchorAt({ x: 1535, y: 1536 }, 2)).toEqual({ x: 0, y: 1 });
  });

  it("칸 경로를 꺾이는 점 좌표로 바꾼다", () => {
    const cells = [at(0, 0), at(1, 0), at(2, 0), at(3, 1)];
    expect(cellPathToWaypoints(cells, 1)).toEqual([
      { x: 512, y: 512 },
      { x: 2560, y: 512 },
      { x: 3584, y: 1536 },
    ]);
    expect(cellPathToWaypoints(cells, 2)).toEqual([
      { x: 1024, y: 1024 },
      { x: 3072, y: 1024 },
      { x: 4096, y: 2048 },
    ]);
  });
});

describe("planRoute (위치 → 위치)", () => {
  it("중심에서 출발하면 칸 중심만 낸다 — 빈 땅의 비스듬한 목표는 시야선 다듬기로 곧은 한 구간(바뀜 2026-11-15)", () => {
    const grid = createPlacementGrid();
    const route = planRoute(pathfinder, grid, {
      from: { x: 512, y: 512 },
      to: { x: 5632, y: 2560 },
      size: 1,
    });
    // A*는 대각선 + 직선(꺾임 하나)이지만, 다듬기(smooth.ts)가 곧은 선으로 줄인다
    expect(route).toMatchObject({
      status: "found",
      waypoints: [
        { x: 512, y: 512 },
        { x: 5632, y: 2560 },
      ],
    });
  });

  it("중심이 아닌 곳에서 출발하면 그 위치에서 시작한다(순간 이동 없음)", () => {
    const grid = createPlacementGrid();
    // 같은 줄 왼쪽에서 동쪽으로: 출발 칸 중심은 같은 직선 위라 빠진다
    const east = planRoute(pathfinder, grid, { from: { x: 100, y: 512 }, to: { x: 5632, y: 512 }, size: 1 });
    expect(east).toMatchObject({
      waypoints: [
        { x: 100, y: 512 },
        { x: 5632, y: 512 },
      ],
    });
    // 같은 줄 오른쪽에서 동쪽으로: 출발 칸 중심으로 뒤돌아가지 않고 곧장 동쪽으로 간다(바뀜 2026-11-19)
    const eastFromRight = planRoute(pathfinder, grid, {
      from: { x: 900, y: 512 },
      to: { x: 5632, y: 512 },
      size: 1,
    });
    expect(eastFromRight).toMatchObject({
      waypoints: [
        { x: 900, y: 512 },
        { x: 5632, y: 512 },
      ],
    });
    // 중심보다 동쪽에서 빈 땅의 남쪽 목표로: 중심으로 뒤돌아가지 않고 곧장 남쪽으로 간다
    const south = planRoute(pathfinder, grid, { from: { x: 900, y: 512 }, to: { x: 512, y: 5632 }, size: 1 });
    expect(south).toMatchObject({
      waypoints: [
        { x: 900, y: 512 },
        { x: 512, y: 5632 },
      ],
    });
    // 단, 곧장 가는 길에 벽이 있으면 벽을 뚫지 않고 출발 칸 중심을 거친다
    setTerrainCost(grid, 1, 1, 0);
    const southBlocked = planRoute(pathfinder, grid, {
      from: { x: 900, y: 512 },
      to: { x: 512, y: 5632 },
      size: 1,
    });
    expect(southBlocked).toMatchObject({
      waypoints: [
        { x: 900, y: 512 },
        { x: 512, y: 512 },
        { x: 512, y: 5632 },
      ],
    });
  });

  it("목표는 목표 기준 칸의 중심으로 맞춘다", () => {
    const grid = createPlacementGrid();
    const route = planRoute(pathfinder, grid, { from: { x: 512, y: 512 }, to: { x: 5000, y: 700 }, size: 1 });
    expect(route.status === "found" && route.waypoints.at(-1)).toEqual({ x: 4608, y: 512 });
  });

  it("길을 못 찾으면 상태를 그대로 넘기고, 지도 밖 위치는 틀린 요청이다", () => {
    const grid = createPlacementGrid();
    setTerrainCost(grid, 9, 9, 0);
    expect(
      planRoute(pathfinder, grid, { from: { x: 512, y: 512 }, to: { x: 9728, y: 9728 }, size: 1 }).status,
    ).toBe("goal_blocked");
    expect(
      planRoute(pathfinder, grid, { from: { x: -600, y: 512 }, to: { x: 512, y: 512 }, size: 1 }).status,
    ).toBe("invalid_request");
    expect(
      planRoute(pathfinder, grid, { from: { x: 0.5, y: 512 }, to: { x: 512, y: 512 }, size: 1 }).status,
    ).toBe("invalid_request");
  });
});

describe("구간 걸음 배율 (ADR 2026-11-14-segment-speed)", () => {
  it("직선 안에서 배율이 바뀌는 칸에 점을 남기고 구간마다 들어가는 칸의 배율을 준다", () => {
    const grid = createPlacementGrid();
    // (3, 0) ~ (5, 0)은 숲(1800)
    for (let x = 3; x <= 5; x++) setTerrainCost(grid, x, 0, 1800);
    // 숲이 길을 비틀지 않게 위아래를 막는다
    for (let x = 0; x <= 9; x++) setTerrainCost(grid, x, 1, 0);
    const route = planRoute(pathfinder, grid, {
      from: anchorCenter(0, 0, 1),
      to: anchorCenter(8, 0, 1),
      size: 1,
      paceSpeed: 437,
    });
    expect(route.status).toBe("found");
    if (route.status !== "found") return;
    expect(route.waypoints).toEqual([
      anchorCenter(0, 0, 1),
      anchorCenter(2, 0, 1),
      anchorCenter(5, 0, 1),
      anchorCenter(8, 0, 1),
    ]);
    expect(route.paces).toEqual([1000, 1800, 1000]);
  });

  it("paceSpeed가 없거나 배율이 모두 1000이면 점·결과가 예전과 같다", () => {
    const grid = createPlacementGrid();
    setTerrainCost(grid, 4, 4, 0);
    const request = { from: { x: 700, y: 900 }, to: anchorCenter(9, 7, 1), size: 1 as const };
    const plain = planRoute(pathfinder, grid, request);
    const paced = planRoute(pathfinder, grid, { ...request, paceSpeed: 437 });
    expect(plain.status).toBe("found");
    if (plain.status !== "found" || paced.status !== "found") return;
    expect(paced.waypoints).toEqual(plain.waypoints);
    expect(paced.paces).toBeUndefined();
    expect(plain.paces).toBeUndefined();
  });

  it("중심이 아닌 출발점 → 출발 칸 중심 구간은 출발 칸의 배율", () => {
    const grid = createPlacementGrid();
    setTerrainCost(grid, 0, 0, 2500);
    const route = planRoute(pathfinder, grid, {
      from: { x: 100, y: 512 },
      to: anchorCenter(3, 0, 1),
      size: 1,
      paceSpeed: 437,
    });
    if (route.status !== "found") throw new Error(route.status);
    expect(route.waypoints[0]).toEqual({ x: 100, y: 512 });
    expect(route.paces?.[0]).toBe(2500);
  });
});
