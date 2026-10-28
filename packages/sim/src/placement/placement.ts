// 건물 배치 검사 (ADR 2026-10-28-s1-second-map.md "건물 배치", 기획 D-102·D-133)
// - 서버가 판정한다. 기기는 미리 보기만 한다(같은 규칙을 기기에 두더라도 결과는 서버 것을 쓴다).
// - S1 모양은 직사각형이다. 90°씩 회전하고, 2차맵 하나 안에 있어야 한다.
// - 기준 칸 (x, y) = 회전한 뒤 차지하는 직사각형의 왼쪽 위(가장 작은 x·y) 칸.
//   90°·270°는 가로(width)와 세로(height)를 바꾼다. 직사각형이라 0°와 180°가 차지하는 칸은 같다.
// - 칸마다: 건물 없음, 도로 없음, 지형이 막히지 않음. 행 우선으로 처음 걸린 칸과 이유를 돌려준다
//   (한 칸에 여럿이면 건물 → 도로 → 지형 순서).
// - 유닛은 칸을 차지하지 않아서 S1은 유닛 위 배치를 막지 않는다.
import { type CellRect, type PlacementGrid, cellIndex, writeBuildingCells } from "../grid/placementGrid.ts";
import { type CellPoint, PLACEMENT_SIZE } from "../units.ts";

export type Rotation = 0 | 90 | 180 | 270;

export interface BuildingPlacement {
  /** 기준 칸(회전한 뒤 차지하는 직사각형의 왼쪽 위) */
  readonly x: number;
  readonly y: number;
  /** 회전하기 전 가로 칸 수 */
  readonly width: number;
  /** 회전하기 전 세로 칸 수 */
  readonly height: number;
  readonly rotation: Rotation;
}

export type PlacementProblem =
  | "invalid_input"
  | "out_of_bounds"
  | "overlaps_building"
  | "overlaps_road"
  | "blocked_terrain";

export type PlacementCheck =
  | { readonly ok: true; readonly rect: CellRect }
  | { readonly ok: false; readonly problem: "invalid_input" | "out_of_bounds" }
  | {
      readonly ok: false;
      readonly problem: "overlaps_building" | "overlaps_road" | "blocked_terrain";
      /** 처음 걸린 칸 */
      readonly cell: CellPoint;
    };

/** 건물 ID로 쓸 수 있는 가장 큰 값(Uint32 격자) */
export const MAX_BUILDING_ID = 0xffffffff;

function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

/** 회전한 뒤 차지하는 칸 직사각형 */
export function footprintRect(placement: BuildingPlacement): CellRect {
  const quarter = placement.rotation === 90 || placement.rotation === 270;
  return {
    x: placement.x,
    y: placement.y,
    width: quarter ? placement.height : placement.width,
    height: quarter ? placement.width : placement.height,
  };
}

/** 배치할 수 있는지 검사한다. 격자를 바꾸지 않는다. */
export function validatePlacement(grid: PlacementGrid, placement: BuildingPlacement): PlacementCheck {
  const { x, y, width, height, rotation } = placement;
  if (![x, y, width, height].every(Number.isInteger) || width < 1 || height < 1 || !isRotation(rotation)) {
    return { ok: false, problem: "invalid_input" };
  }
  const rect = footprintRect(placement);
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > PLACEMENT_SIZE ||
    rect.y + rect.height > PLACEMENT_SIZE
  ) {
    return { ok: false, problem: "out_of_bounds" };
  }
  for (let cy = rect.y; cy < rect.y + rect.height; cy++) {
    for (let cx = rect.x; cx < rect.x + rect.width; cx++) {
      const index = cellIndex(cx, cy);
      if (grid.building[index] !== 0)
        return { ok: false, problem: "overlaps_building", cell: { x: cx, y: cy } };
      if (grid.road[index] !== 0) return { ok: false, problem: "overlaps_road", cell: { x: cx, y: cy } };
      if (grid.terrainCost[index] === 0)
        return { ok: false, problem: "blocked_terrain", cell: { x: cx, y: cy } };
    }
  }
  return { ok: true, rect };
}

/**
 * 검사하고, 되면 점유를 쓰고 통과 폭을 국소 갱신한다. 안 되면 아무것도 바꾸지 않는다.
 * 건물 ID는 1 ~ MAX_BUILDING_ID 정수이고 이 2차맵에서 하나뿐이어야 한다(어기면 RangeError — 서버 버그).
 */
export function applyPlacement(
  grid: PlacementGrid,
  buildingId: number,
  placement: BuildingPlacement,
): PlacementCheck {
  if (!Number.isInteger(buildingId) || buildingId < 1 || buildingId > MAX_BUILDING_ID) {
    throw new RangeError(`building id must be an integer in [1, ${MAX_BUILDING_ID}]: ${buildingId}`);
  }
  if (grid.buildings.has(buildingId)) throw new RangeError(`building id already placed: ${buildingId}`);
  const check = validatePlacement(grid, placement);
  if (!check.ok) return check;
  writeBuildingCells(grid, check.rect, buildingId);
  grid.buildings.set(buildingId, check.rect);
  return check;
}

/** 건물을 치운다. 없던 ID면 false */
export function removeBuilding(grid: PlacementGrid, buildingId: number): boolean {
  const rect = grid.buildings.get(buildingId);
  if (!rect) return false;
  writeBuildingCells(grid, rect, 0);
  grid.buildings.delete(buildingId);
  return true;
}
