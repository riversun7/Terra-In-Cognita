// 2차맵 서버 상태의 칸·경로 도우미 — secondMap.ts에서 나눴다(파일 1,000줄 상한). ADR 2026-10-28-s1-second-map.md
// - 경로 결과 상태 → 명령 결과 코드, 유닛 몸이 덮는 칸, 남은 경로가 막혔는지, 움직임의 마지막 점.
import type { ResultCode } from "@terra/protocol";
import {
  CELL_UNITS,
  HALF_CELL_UNITS,
  type CellRect,
  type Motion,
  type PlacementGrid,
  type Point,
  type SizeClass,
  anchorAt,
  distanceAt,
  isPassable,
  positionAtDistance,
} from "@terra/sim";
import type { PathOutcome } from "./pathService.ts";

/** 경로 결과 상태 → 명령 결과 코드 */
export function failureCode(status: PathOutcome["status"]): ResultCode {
  switch (status) {
    case "no_path":
    case "budget_exceeded":
    case "start_blocked":
    case "goal_blocked":
    case "busy":
      return status;
    case "dropped":
      return "superseded";
    case "invalid_request":
      return "invalid_request";
    case "unknown_map":
      // 워커 사본에 2차맵이 아직 없다(부팅 차례 등): 기기는 "열려 있지 않은 2차맵"으로 알린다
      return "unknown_map";
    default:
      return "internal_error";
  }
}

/** 크기 등급 size 유닛의 몸(s×s 정사각형)이 덮는 칸 범위 — 칸 사이를 지날 때는 한 칸 더 걸친다 */
export function bodyCells(point: Point, size: SizeClass): { x0: number; y0: number; x1: number; y1: number } {
  const half = size * HALF_CELL_UNITS;
  return {
    x0: Math.floor((point.x - half) / CELL_UNITS),
    y0: Math.floor((point.y - half) / CELL_UNITS),
    x1: Math.floor((point.x + half - 1) / CELL_UNITS),
    y1: Math.floor((point.y + half - 1) / CELL_UNITS),
  };
}

export function rectsOverlap(
  cells: { x0: number; y0: number; x1: number; y1: number },
  rect: CellRect,
): boolean {
  return (
    cells.x0 < rect.x + rect.width &&
    cells.x1 >= rect.x &&
    cells.y0 < rect.y + rect.height &&
    cells.y1 >= rect.y
  );
}

/**
 * 지금(now)부터 남은 경로가 막혔는가. 꺾이는 점 사이는 8방향 직선이라 기준 칸을 한 칸씩 밟아 본다
 * (A*와 같은 규칙: 설 수 있음 + 대각선은 양옆 두 칸도).
 */
export function remainingPathBlocked(
  grid: PlacementGrid,
  motion: Motion,
  size: SizeClass,
  now: number,
): boolean {
  const travelled = distanceAt(motion, now);
  const { waypoints, distances } = motion;
  let segment = 0;
  while (segment + 1 < distances.length && (distances[segment + 1] ?? 0) <= travelled) segment++;
  let cell = anchorAt(positionAtDistance(motion, travelled), size);
  if (!isPassable(grid, cell.x, cell.y, size)) return true;
  for (let next = segment + 1; next < waypoints.length; next++) {
    const point = waypoints[next];
    if (!point) break;
    const target = anchorAt(point, size);
    while (cell.x !== target.x || cell.y !== target.y) {
      const dx = Math.sign(target.x - cell.x);
      const dy = Math.sign(target.y - cell.y);
      const step = { x: cell.x + dx, y: cell.y + dy };
      if (!isPassable(grid, step.x, step.y, size)) return true;
      if (
        dx !== 0 &&
        dy !== 0 &&
        (!isPassable(grid, step.x, cell.y, size) || !isPassable(grid, cell.x, step.y, size))
      ) {
        return true;
      }
      cell = step;
    }
  }
  return false;
}

/** 움직임의 마지막 점(서 있는 유닛이면 지금 자리) */
export function lastPoint(motion: Motion): Point {
  return motion.waypoints[motion.waypoints.length - 1] ?? motion.waypoints[0] ?? { x: 0, y: 0 };
}
