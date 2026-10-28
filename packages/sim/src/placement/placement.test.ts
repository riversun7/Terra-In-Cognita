import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { computeClearance } from "../grid/clearance.ts";
import { ROAD_TRAIL } from "../grid/costs.ts";
import { cellIndex, createPlacementGrid, setRoad, setTerrainCost } from "../grid/placementGrid.ts";
import { createPathfinder } from "../path/astar.ts";
import { PLACEMENT_SIZE } from "../units.ts";
import {
  type BuildingPlacement,
  type Rotation,
  applyPlacement,
  footprintRect,
  removeBuilding,
  validatePlacement,
} from "./placement.ts";

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
const place = (x: number, y: number, width: number, height: number, rotation: Rotation = 0) => ({
  x,
  y,
  width,
  height,
  rotation,
});

function occupiedCells(grid: ReturnType<typeof createPlacementGrid>, id: number): number {
  let count = 0;
  for (const value of grid.building) if (value === id) count++;
  return count;
}

describe("건물 배치", () => {
  it("90°·270° 회전은 가로세로를 바꾸고, 기준 칸은 차지한 직사각형의 왼쪽 위다", () => {
    expect(footprintRect(place(10, 10, 3, 2, 0))).toEqual({ x: 10, y: 10, width: 3, height: 2 });
    expect(footprintRect(place(10, 10, 3, 2, 90))).toEqual({ x: 10, y: 10, width: 2, height: 3 });
    expect(footprintRect(place(10, 10, 3, 2, 180))).toEqual({ x: 10, y: 10, width: 3, height: 2 });
    expect(footprintRect(place(10, 10, 3, 2, 270))).toEqual({ x: 10, y: 10, width: 2, height: 3 });
    const grid = createPlacementGrid();
    expect(applyPlacement(grid, 7, place(10, 10, 3, 2, 90)).ok).toBe(true);
    expect(occupiedCells(grid, 7)).toBe(6);
    expect(grid.building[cellIndex(11, 12)]).toBe(7);
    expect(grid.building[cellIndex(12, 10)]).toBe(0);
  });

  it("2차맵 밖으로 나가면 거부한다(경계에 딱 맞으면 된다)", () => {
    const grid = createPlacementGrid();
    expect(validatePlacement(grid, place(253, 0, 3, 1)).ok).toBe(true);
    expect(validatePlacement(grid, place(254, 0, 3, 1))).toEqual({ ok: false, problem: "out_of_bounds" });
    expect(validatePlacement(grid, place(253, 255, 1, 3, 90)).ok).toBe(true);
    expect(validatePlacement(grid, place(254, 255, 1, 3, 90))).toEqual({
      ok: false,
      problem: "out_of_bounds",
    });
    expect(validatePlacement(grid, place(-1, 0, 1, 1))).toEqual({ ok: false, problem: "out_of_bounds" });
    expect(validatePlacement(grid, place(0, 0, 257, 1))).toEqual({ ok: false, problem: "out_of_bounds" });
  });

  it("건물·도로·막힌 지형과 겹치면 처음 걸린 칸(행 우선)과 이유를 알려 준다", () => {
    const grid = createPlacementGrid();
    expect(applyPlacement(grid, 1, place(20, 20, 4, 4)).ok).toBe(true);
    expect(validatePlacement(grid, place(23, 23, 2, 2))).toEqual({
      ok: false,
      problem: "overlaps_building",
      cell: { x: 23, y: 23 },
    });
    // 변이 맞닿는 것은 된다
    expect(validatePlacement(grid, place(24, 20, 2, 2)).ok).toBe(true);
    setRoad(grid, 31, 30, ROAD_TRAIL);
    expect(validatePlacement(grid, place(30, 30, 3, 3))).toEqual({
      ok: false,
      problem: "overlaps_road",
      cell: { x: 31, y: 30 },
    });
    setTerrainCost(grid, 41, 41, 0);
    expect(validatePlacement(grid, place(40, 40, 3, 3))).toEqual({
      ok: false,
      problem: "blocked_terrain",
      cell: { x: 41, y: 41 },
    });
  });

  it("틀린 입력은 invalid_input", () => {
    const grid = createPlacementGrid();
    const bad: BuildingPlacement[] = [
      place(0, 0, 0, 1),
      place(1.5, 0, 1, 1),
      place(0, 0, 2, Number.NaN),
      // 타입 밖의 회전 값(서버가 받은 틀린 입력)을 실행 중에 거르는지 본다
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      { ...place(0, 0, 1, 1), rotation: 45 as Rotation },
    ];
    for (const placement of bad) {
      expect(validatePlacement(grid, placement)).toEqual({ ok: false, problem: "invalid_input" });
    }
  });

  it("검사는 격자를 바꾸지 않고, 놓기·치우기는 점유와 통과 폭을 함께 고친다", () => {
    const grid = createPlacementGrid();
    const before = Uint8Array.from(grid.clearance);
    validatePlacement(grid, place(50, 50, 5, 5));
    expect(grid.clearance).toEqual(before);
    expect(occupiedCells(grid, 0)).toBe(PLACEMENT_SIZE * PLACEMENT_SIZE);

    expect(applyPlacement(grid, 9, place(50, 50, 5, 5)).ok).toBe(true);
    expect(grid.clearance[cellIndex(52, 52)]).toBe(0);
    expect(grid.clearance[cellIndex(48, 48)]).toBe(2);
    expect(grid.clearance).toEqual(computeClearance(grid));
    expect(() => applyPlacement(grid, 9, place(0, 0, 1, 1))).toThrow(RangeError);
    // 실패한 배치는 아무것도 바꾸지 않는다
    expect(applyPlacement(grid, 10, place(52, 52, 5, 5)).ok).toBe(false);
    expect(occupiedCells(grid, 10)).toBe(0);

    expect(removeBuilding(grid, 9)).toBe(true);
    expect(removeBuilding(grid, 9)).toBe(false);
    expect(occupiedCells(grid, 9)).toBe(0);
    expect(grid.clearance).toEqual(before);
  });

  it("무작위로 놓고 치운 뒤에도 국소 갱신한 통과 폭이 전체 다시 계산과 같다", () => {
    const rng = createRng(2026);
    const grid = createPlacementGrid();
    const placed: number[] = [];
    let nextId = 1;
    for (let step = 0; step < 1500; step++) {
      if (placed.length > 0 && rng.nextInt(3) === 0) {
        const [id] = placed.splice(rng.nextInt(placed.length), 1);
        expect(removeBuilding(grid, id ?? 0)).toBe(true);
      } else {
        const placement = place(
          rng.nextInt(PLACEMENT_SIZE),
          rng.nextInt(PLACEMENT_SIZE),
          1 + rng.nextInt(6),
          1 + rng.nextInt(6),
          ROTATIONS[rng.nextInt(4)] ?? 0,
        );
        if (applyPlacement(grid, nextId, placement).ok) placed.push(nextId);
        nextId++;
      }
      if (step % 250 === 0) expect(grid.clearance).toEqual(computeClearance(grid));
    }
    expect(placed.length).toBeGreaterThan(100);
    expect(grid.clearance).toEqual(computeClearance(grid));
  });

  it("놓인 건물은 경로탐색이 돌아간다", () => {
    const grid = createPlacementGrid();
    const pathfinder = createPathfinder();
    const request = { start: { x: 10, y: 50 }, goal: { x: 30, y: 50 }, size: 1 as const };
    const straight = pathfinder.findPath(grid, request);
    expect(straight.status === "found" && straight.cost).toBe(20_480_000);
    expect(applyPlacement(grid, 3, place(20, 40, 2, 21)).ok).toBe(true);
    const detour = pathfinder.findPath(grid, request);
    expect(detour.status).toBe("found");
    if (detour.status === "found") {
      expect(detour.cost).toBeGreaterThan(20_480_000);
      for (const cell of detour.cells) expect(grid.building[cell]).toBe(0);
    }
  });
});
