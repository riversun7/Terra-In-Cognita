// 2차맵 하나의 배치 격자(256×256) — 지형 비용, 도로, 건물 점유, 통과 폭을 타입 배열로 둔다.
// 배열은 읽기만 하고, 바꿀 때는 이 파일의 함수를 쓴다(통과 폭을 함께 고쳐야 하므로).
// 메모리: 지형 128KiB + 도로 64KiB + 건물 256KiB + 통과 폭 64KiB = 512KiB/2차맵.
import { PLACEMENT_CELLS, PLACEMENT_SIZE } from "../units.ts";
import { type CellLayers, type SizeClass, computeClearance, refreshClearance } from "./clearance.ts";
import { BASE_COST, MAX_TERRAIN_COST, ROAD_COST, isRoadType } from "./costs.ts";

/** 칸 직사각형 [x, x + width) × [y, y + height) */
export interface CellRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacementGrid extends CellLayers {
  /** 크기 등급별 통과 폭(clearance.ts의 정의) */
  readonly clearance: Uint8Array;
  /** 놓인 건물: ID → 차지한 칸 직사각형 */
  readonly buildings: Map<number, CellRect>;
  /** 길찾기 추정값에 쓰는 가장 싼 칸 비용(천분율) 캐시. 0이면 다음에 다시 센다 */
  cheapestCostCache: number;
}

/** 배치 격자를 만든다. 지형 비용을 주지 않으면 모든 칸이 평지(BASE_COST)다. */
export function createPlacementGrid(terrainCost?: Uint16Array): PlacementGrid {
  if (terrainCost && terrainCost.length !== PLACEMENT_CELLS) {
    throw new RangeError(`terrainCost must have ${PLACEMENT_CELLS} cells: ${terrainCost.length}`);
  }
  const layers = {
    terrainCost: terrainCost
      ? Uint16Array.from(terrainCost)
      : new Uint16Array(PLACEMENT_CELLS).fill(BASE_COST),
    road: new Uint8Array(PLACEMENT_CELLS),
    building: new Uint32Array(PLACEMENT_CELLS),
  };
  return { ...layers, clearance: computeClearance(layers), buildings: new Map(), cheapestCostCache: 0 };
}

export function isInside(x: number, y: number): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < PLACEMENT_SIZE && y < PLACEMENT_SIZE
  );
}

/** 칸 번호 = y × 256 + x */
export function cellIndex(x: number, y: number): number {
  return y * PLACEMENT_SIZE + x;
}

/** 크기 등급 size 유닛이 기준 칸 (x, y)에 설 수 있는가(s×s 칸이 모두 열림) */
export function isPassable(grid: PlacementGrid, x: number, y: number, size: SizeClass): boolean {
  return isInside(x, y) && (grid.clearance[cellIndex(x, y)] ?? 0) >= size;
}

function assertInside(x: number, y: number): void {
  if (!isInside(x, y)) throw new RangeError(`cell outside the placement grid: (${x}, ${y})`);
}

/** 지형 비용을 바꾼다(0 = 막힘). 편집기·시험용. 통과 폭을 국소 갱신한다. */
export function setTerrainCost(grid: PlacementGrid, x: number, y: number, cost: number): void {
  assertInside(x, y);
  if (!Number.isInteger(cost) || cost < 0 || cost > MAX_TERRAIN_COST) {
    throw new RangeError(`terrain cost must be an integer in [0, ${MAX_TERRAIN_COST}]: ${cost}`);
  }
  grid.terrainCost[cellIndex(x, y)] = cost;
  grid.cheapestCostCache = 0;
  refreshClearance(grid, grid.clearance, x, y, 1, 1);
}

/** 도로 종류를 바꾼다(ROAD_NONE = 지움). 도로 놓기 규칙 검사는 S1 범위 밖이다. */
export function setRoad(grid: PlacementGrid, x: number, y: number, roadType: number): void {
  assertInside(x, y);
  if (!isRoadType(roadType)) throw new RangeError(`unknown road type: ${roadType}`);
  grid.road[cellIndex(x, y)] = roadType;
  grid.cheapestCostCache = 0;
  refreshClearance(grid, grid.clearance, x, y, 1, 1);
}

/** 직사각형 칸의 건물 ID를 쓴다(0 = 지움). 배치 검사는 placement.ts가 먼저 한다. */
export function writeBuildingCells(grid: PlacementGrid, rect: CellRect, buildingId: number): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    grid.building.fill(buildingId, cellIndex(rect.x, y), cellIndex(rect.x + rect.width, y));
  }
  refreshClearance(grid, grid.clearance, rect.x, rect.y, rect.width, rect.height);
}

/** 칸 하나의 이동 비용(천분율). 도로가 있으면 도로 비용, 없으면 지형 비용이다. */
export function cellCost(grid: PlacementGrid, index: number): number {
  const road = grid.road[index] ?? 0;
  return road !== 0 ? (ROAD_COST[road] ?? 0) : (grid.terrainCost[index] ?? 0);
}

/**
 * 크기 등급 size 유닛이 기준 칸 index에 들어갈 때의 비용(천분율): 차지하는 s×s 칸 중 가장 비싼 칸.
 * 대형 유닛은 몸 전체가 도로 위에 있어야 도로 비용을 받는다.
 * 그 기준 칸에 설 수 있을 때만 부른다(발자국이 지도 안에 있어야 한다).
 */
export function footprintCost(grid: PlacementGrid, index: number, size: SizeClass): number {
  if (size === 1) return cellCost(grid, index);
  let highest = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const cost = cellCost(grid, index + dy * PLACEMENT_SIZE + dx);
      if (cost > highest) highest = cost;
    }
  }
  return highest;
}

/**
 * 비용이 0이 아닌 칸 중 가장 싼 비용(천분율). 길찾기 추정값이 실제 비용을 넘지 않게 쓴다.
 * 건물 밑 칸도 센다(더 작게 잡으면 추정값이 약해질 뿐 틀리지 않는다). 도로·지형이 바뀌면 다시 센다.
 */
export function cheapestCellCost(grid: PlacementGrid): number {
  if (grid.cheapestCostCache > 0) return grid.cheapestCostCache;
  let cheapest = 0;
  for (let index = 0; index < PLACEMENT_CELLS; index++) {
    const cost = cellCost(grid, index);
    if (cost !== 0 && (cheapest === 0 || cost < cheapest)) cheapest = cost;
  }
  grid.cheapestCostCache = cheapest === 0 ? BASE_COST : cheapest;
  return grid.cheapestCostCache;
}
