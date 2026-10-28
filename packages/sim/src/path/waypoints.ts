// 칸 경로 → 꺾이는 점(고정소수점 좌표), 위치 → 위치 경로(planRoute)
//
// - 꺾이는 점: 방향이 바뀌는 칸과 양 끝만 남긴다. 점 사이는 8방향 중 한 방향의 직선이라
//   꺾이는 점을 이은 선은 A*가 고른 칸을 그대로 지난다(모서리 뚫기 규칙이 그대로 지켜진다).
// - 시야선 다듬기(line-of-sight smoothing, 임의 각도 직선)는 S1에서 하지 않는다.
//   다듬으면 크기 등급별 통과 폭·도로 비용을 직선 전체에서 다시 확인해야 하고, 비용이 A* 결과와 달라진다.
// - 크기 등급 s 유닛의 위치(중심) = 기준 칸 왼쪽 위 모서리 + s × 512 (s×s 정사각형의 가운데).
import type { SizeClass } from "../grid/clearance.ts";
import type { PlacementGrid } from "../grid/placementGrid.ts";
import { CELL_UNITS, HALF_CELL_UNITS, PLACEMENT_SIZE, type Point } from "../units.ts";
import type { CellPoint, PathResult, Pathfinder } from "./astar.ts";

/** 꺾이는 칸만 남긴다. 칸 번호 차이(±1, ±255, ±256, ±257)가 곧 방향이다. */
export function simplifyCellPath(cells: readonly number[]): number[] {
  if (cells.length <= 2) return [...cells];
  const first = cells[0] ?? 0;
  const out = [first];
  for (let i = 1; i < cells.length - 1; i++) {
    const previous = cells[i - 1] ?? 0;
    const current = cells[i] ?? 0;
    const next = cells[i + 1] ?? 0;
    if (current - previous !== next - current) out.push(current);
  }
  out.push(cells[cells.length - 1] ?? 0);
  return out;
}

/** 크기 등급 size 유닛이 기준 칸 (x, y)에 있을 때의 위치(중심) */
export function anchorCenter(x: number, y: number, size: SizeClass): Point {
  return { x: x * CELL_UNITS + size * HALF_CELL_UNITS, y: y * CELL_UNITS + size * HALF_CELL_UNITS };
}

/** 위치에서 가장 가까운 중심의 기준 칸. 지도 밖 칸이 나올 수 있다(부르는 쪽이 확인). */
export function anchorAt(point: Point, size: SizeClass): CellPoint {
  const offset = (1 - size) * HALF_CELL_UNITS;
  return { x: Math.floor((point.x + offset) / CELL_UNITS), y: Math.floor((point.y + offset) / CELL_UNITS) };
}

/** 칸 경로 → 꺾이는 점 위치 목록 */
export function cellPathToWaypoints(cells: readonly number[], size: SizeClass): Point[] {
  return simplifyCellPath(cells).map((cell) => {
    const x = cell % PLACEMENT_SIZE;
    return anchorCenter(x, (cell - x) / PLACEMENT_SIZE, size);
  });
}

export interface RouteRequest {
  /** 지금 위치(고정소수점). 이전 경로 위의 점이거나 칸 중심이어야 한다 */
  readonly from: Point;
  /** 목표 위치. 가장 가까운 기준 칸의 중심으로 맞춘다 */
  readonly to: Point;
  readonly size: SizeClass;
  readonly nodeBudget?: number;
}

export type RouteResult =
  | {
      readonly status: "found";
      /** 이동 계산(motion.ts)에 그대로 넣는 꺾이는 점. 첫 점은 from이다 */
      readonly waypoints: Point[];
      readonly cost: number;
      readonly expanded: number;
    }
  | Exclude<PathResult, { readonly status: "found" }>;

/**
 * 위치 → 위치 경로. 첫 점은 지금 위치(순간 이동 없음), 마지막 점은 목표 기준 칸의 중심이다.
 * 지금 위치에서 출발 칸 중심까지는 반 칸 안이다. 이전 경로 위의 점이면 그 구간은 이전 경로의 일부라
 * 크기 등급 규칙을 어기지 않는다(대형 유닛이 임의 위치에서 출발하는 경우는 보장하지 않는다).
 */
export function planRoute(pathfinder: Pathfinder, grid: PlacementGrid, request: RouteRequest): RouteResult {
  const { from, to, size } = request;
  if (![from.x, from.y, to.x, to.y].every(Number.isSafeInteger)) return { status: "invalid_request" };
  const result = pathfinder.findPath(grid, {
    start: anchorAt(from, size),
    goal: anchorAt(to, size),
    size,
    ...(request.nodeBudget === undefined ? {} : { nodeBudget: request.nodeBudget }),
  });
  if (result.status !== "found") return result;
  const waypoints = cellPathToWaypoints(result.cells, size);
  const first = waypoints[0];
  if (first && (first.x !== from.x || first.y !== from.y)) waypoints.unshift(from);
  return {
    status: "found",
    waypoints: dropStraightPoints(waypoints),
    cost: result.cost,
    expanded: result.expanded,
  };
}

/** 앞뒤와 같은 방향의 직선 위에 있는 점을 뺀다(정수 외적·내적이라 정확하다) */
function dropStraightPoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (a && b) {
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const bcx = point.x - b.x;
      const bcy = point.y - b.y;
      if (abx * bcy - aby * bcx === 0 && abx * bcx + aby * bcy > 0) out.pop();
    }
    out.push(point);
  }
  return out;
}
