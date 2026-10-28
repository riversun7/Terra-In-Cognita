import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { PLACEMENT_SIZE } from "../units.ts";
import { computeClearance } from "./clearance.ts";
import { BASE_COST, ROAD_TRAIL } from "./costs.ts";
import { createPlacementGrid, isPassable, setRoad, setTerrainCost } from "./placementGrid.ts";

const at = (x: number, y: number) => y * PLACEMENT_SIZE + x;

describe("통과 폭(clearance)", () => {
  it("빈 지도: 오른쪽·아래 끝 두 줄만 3보다 작다", () => {
    const grid = createPlacementGrid();
    expect(grid.clearance[at(0, 0)]).toBe(3);
    expect(grid.clearance[at(253, 253)]).toBe(3);
    expect(grid.clearance[at(254, 100)]).toBe(2);
    expect(grid.clearance[at(255, 100)]).toBe(1);
    expect(grid.clearance[at(100, 254)]).toBe(2);
    expect(grid.clearance[at(254, 254)]).toBe(2);
    expect(grid.clearance[at(255, 255)]).toBe(1);
  });

  it("막힌 칸 하나: 그 칸을 덮는 정사각형만 줄어든다", () => {
    const grid = createPlacementGrid();
    setTerrainCost(grid, 10, 10, 0);
    const value = (x: number, y: number) => grid.clearance[at(x, y)];
    expect(value(10, 10)).toBe(0);
    expect(value(9, 9)).toBe(1);
    expect(value(8, 8)).toBe(2);
    expect(value(7, 7)).toBe(3);
    expect(value(9, 10)).toBe(1);
    expect(value(8, 10)).toBe(2);
    expect(value(10, 8)).toBe(2);
    expect(value(11, 10)).toBe(3);
    expect(value(10, 11)).toBe(3);
    expect(value(11, 11)).toBe(3);
  });

  it("크기 등급별 통과: 폭 1칸 통로는 1등급만 지나간다", () => {
    const grid = createPlacementGrid();
    // x = 20 세로 통로(폭 1칸) 양옆을 막는다
    for (let y = 0; y < 40; y++) {
      setTerrainCost(grid, 19, y, 0);
      setTerrainCost(grid, 21, y, 0);
    }
    expect(isPassable(grid, 20, 10, 1)).toBe(true);
    expect(isPassable(grid, 20, 10, 2)).toBe(false);
    expect(isPassable(grid, 19, 10, 1)).toBe(false);
  });

  it("도로는 막힌 지형 위에서도 지나갈 수 있다(다리)", () => {
    const grid = createPlacementGrid();
    setTerrainCost(grid, 5, 5, 0);
    expect(isPassable(grid, 5, 5, 1)).toBe(false);
    setRoad(grid, 5, 5, ROAD_TRAIL);
    expect(isPassable(grid, 5, 5, 1)).toBe(true);
  });

  it("국소 갱신 결과가 전체 다시 계산과 같다(무작위 지형·도로 변경)", () => {
    const rng = createRng(42);
    const grid = createPlacementGrid();
    for (let step = 0; step < 3000; step++) {
      const x = rng.nextInt(PLACEMENT_SIZE);
      const y = rng.nextInt(PLACEMENT_SIZE);
      if (rng.nextInt(3) === 0) setRoad(grid, x, y, rng.nextInt(2) === 0 ? 0 : ROAD_TRAIL);
      else setTerrainCost(grid, x, y, rng.nextInt(2) === 0 ? 0 : BASE_COST);
      if (step % 300 === 0) expect(grid.clearance).toEqual(computeClearance(grid));
    }
    expect(grid.clearance).toEqual(computeClearance(grid));
  });

  it("잘못된 칸·값은 거부한다", () => {
    const grid = createPlacementGrid();
    expect(() => setTerrainCost(grid, -1, 0, 0)).toThrow(RangeError);
    expect(() => setTerrainCost(grid, 0, 256, 0)).toThrow(RangeError);
    expect(() => setTerrainCost(grid, 0, 0, 70_000)).toThrow(RangeError);
    expect(() => setRoad(grid, 0, 0, 99)).toThrow(RangeError);
  });
});
