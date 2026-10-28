// 배치 격자 8방향 A* (ADR 2026-10-28-s1-second-map.md "경로탐색")
//
// 규칙
// - 유닛은 크기 등급 s의 기준 칸(s×s 정사각형의 왼쪽 위)으로 움직인다. 설 수 있음 = 통과 폭 ≥ s.
// - 대각선은 모서리를 뚫지 않는다: 양옆 두 기준 칸((x+dx, y), (x, y+dy))에도 설 수 있어야 한다.
//   등급 s의 정사각형이 대각선으로 움직이며 쓸고 지나가는 칸이 모두 이 세 정사각형 안에 있다.
// - 한 걸음 비용 = 걸음 길이(직선 1024, 대각선 1448 ≈ 1024√2) × 들어가는 기준 칸의 비용(천분율).
//   정수만 쓰고 나누지 않는다. 경로 비용은 최대 약 65536 × 1448 × 65535 < 2^53이라 Float64에 정확하다.
// - 추정값 h = 옥타일 거리 × 지도에서 가장 싼 칸 비용 — 과대평가하지 않고 일관적이라 첫 꺼냄이 최적이다.
// - 동점 처리: (f, h, 칸 번호) 순서. 이웃은 정해진 순서(+x, −x, +y, −y, 그다음 대각선 (+x,+y), (−x,+y),
//   (+x,−y), (−x,−y))로 본다.
//   같은 값의 경로가 여러 개면 먼저 찾은 부모를 유지한다. 그래서 같은 입력이면 항상 같은 경로다.
// - 노드 예산: 펼친 칸 수의 상한. 넘으면 "budget_exceeded"(길이 있는지 모름), 다 봤는데 없으면 "no_path".
import { type SizeClass, isSizeClass } from "../grid/clearance.ts";
import { ROAD_COST } from "../grid/costs.ts";
import { type PlacementGrid, cheapestCellCost, footprintCost, isInside } from "../grid/placementGrid.ts";
import { type CellPoint, PLACEMENT_CELLS, PLACEMENT_SIZE } from "../units.ts";
import { createNodeHeap } from "./nodeHeap.ts";

/** 직선 한 걸음의 길이(고정소수점 단위 = 배치 칸 1개) */
export const STRAIGHT_STEP = 1024;
/** 대각선 한 걸음의 길이(1024 × √2 = 1448.15를 내림) */
export const DIAGONAL_STEP = 1448;

/** 기본 노드 예산 — 2차맵 전체 칸 수(이 격자에서는 넘을 수 없다). 서버는 상황에 맞게 줄여서 준다. */
export const DEFAULT_NODE_BUDGET = PLACEMENT_CELLS;

export interface PathRequest {
  /** 출발 기준 칸 */
  readonly start: CellPoint;
  /** 목표 기준 칸 */
  readonly goal: CellPoint;
  readonly size: SizeClass;
  /** 펼칠 수 있는 칸 수 상한(1 이상 정수). 없으면 DEFAULT_NODE_BUDGET */
  readonly nodeBudget?: number;
}

export type PathResult =
  | {
      readonly status: "found";
      /** 출발부터 목표까지 칸 번호(y × 256 + x) */
      readonly cells: number[];
      /** 경로 비용(걸음 길이 × 칸 비용 천분율의 합) */
      readonly cost: number;
      /** 펼친 칸 수 */
      readonly expanded: number;
    }
  | { readonly status: "no_path" | "budget_exceeded"; readonly expanded: number }
  | { readonly status: "start_blocked" | "goal_blocked" | "invalid_request" };

export interface Pathfinder {
  findPath(grid: PlacementGrid, request: PathRequest): PathResult;
}

// 이웃 순서(바꾸면 같은 비용 경로 중 고르는 것이 달라진다 → SIM_VERSION)
const DX = Int8Array.of(1, -1, 0, 0, 1, -1, 1, -1);
const DY = Int8Array.of(0, 0, 1, -1, 1, 1, -1, -1);
const FIRST_DIAGONAL = 4;

/** 옥타일 거리(걸음 길이 단위) */
function octile(dx: number, dy: number): number {
  return dx > dy
    ? STRAIGHT_STEP * (dx - dy) + DIAGONAL_STEP * dy
    : STRAIGHT_STEP * (dy - dx) + DIAGONAL_STEP * dx;
}

/**
 * 길찾기 객체를 만든다. 칸별 작업 배열(약 2.75MiB: g·부모·도장 2개 1.25MiB + 힙 1.5MiB)을
 * 한 번 만들어 계속 쓴다. 한 번에 한 탐색만 한다(워커 스레드마다 하나씩 둔다).
 */
export function createPathfinder(): Pathfinder {
  const g = new Float64Array(PLACEMENT_CELLS);
  const parent = new Int32Array(PLACEMENT_CELLS);
  // 탐색 번호 도장: 배열을 매번 지우지 않으려고, 이번 탐색에서 쓴 칸인지 표시한다
  const seen = new Uint32Array(PLACEMENT_CELLS);
  const closed = new Uint32Array(PLACEMENT_CELLS);
  const heap = createNodeHeap(PLACEMENT_CELLS);
  let stamp = 0;

  const nextStamp = (): number => {
    if (stamp === 0xffffffff) {
      seen.fill(0);
      closed.fill(0);
      stamp = 0;
    }
    stamp++;
    return stamp;
  };

  const findPath = (grid: PlacementGrid, request: PathRequest): PathResult => {
    const { start, goal, size } = request;
    const budget = request.nodeBudget ?? DEFAULT_NODE_BUDGET;
    if (
      !isInside(start.x, start.y) ||
      !isInside(goal.x, goal.y) ||
      !isSizeClass(size) ||
      !Number.isInteger(budget) ||
      budget < 1
    ) {
      return { status: "invalid_request" };
    }
    const clearance = grid.clearance;
    const startIndex = start.y * PLACEMENT_SIZE + start.x;
    const goalIndex = goal.y * PLACEMENT_SIZE + goal.x;
    if ((clearance[startIndex] ?? 0) < size) return { status: "start_blocked" };
    if ((clearance[goalIndex] ?? 0) < size) return { status: "goal_blocked" };
    if (startIndex === goalIndex) return { status: "found", cells: [startIndex], cost: 0, expanded: 0 };

    const unitCost = cheapestCellCost(grid);
    const { terrainCost, road } = grid;
    const gx = goal.x;
    const gy = goal.y;
    const mark = nextStamp();
    heap.clear();
    g[startIndex] = 0;
    seen[startIndex] = mark;
    parent[startIndex] = -1;
    const startH = octile(Math.abs(start.x - gx), Math.abs(start.y - gy)) * unitCost;
    heap.upsert(startH, startH, startIndex);

    let expanded = 0;
    while (heap.size > 0) {
      const node = heap.pop();
      if (node === goalIndex) {
        return { status: "found", cells: tracePath(parent, node), cost: g[node] ?? 0, expanded };
      }
      if (expanded >= budget) return { status: "budget_exceeded", expanded };
      closed[node] = mark;
      expanded++;

      const x = node % PLACEMENT_SIZE;
      const y = (node - x) / PLACEMENT_SIZE;
      const base = g[node] ?? 0;
      for (let dir = 0; dir < 8; dir++) {
        const nx = x + (DX[dir] ?? 0);
        const ny = y + (DY[dir] ?? 0);
        if (nx < 0 || ny < 0 || nx >= PLACEMENT_SIZE || ny >= PLACEMENT_SIZE) continue;
        const next = ny * PLACEMENT_SIZE + nx;
        if ((clearance[next] ?? 0) < size || closed[next] === mark) continue;
        const diagonal = dir >= FIRST_DIAGONAL;
        if (
          diagonal &&
          ((clearance[y * PLACEMENT_SIZE + nx] ?? 0) < size ||
            (clearance[ny * PLACEMENT_SIZE + x] ?? 0) < size)
        ) {
          continue;
        }
        // 1등급은 칸 하나의 비용(cellCost와 같은 계산을 펼쳐 썼다 — 가장 많이 도는 곳)
        let enter: number;
        if (size === 1) {
          const roadType = road[next] ?? 0;
          enter = roadType !== 0 ? (ROAD_COST[roadType] ?? 0) : (terrainCost[next] ?? 0);
        } else {
          enter = footprintCost(grid, next, size);
        }
        const tentative = base + (diagonal ? DIAGONAL_STEP : STRAIGHT_STEP) * enter;
        if (seen[next] === mark && tentative >= (g[next] ?? 0)) continue;
        g[next] = tentative;
        seen[next] = mark;
        parent[next] = node;
        const hx = nx > gx ? nx - gx : gx - nx;
        const hy = ny > gy ? ny - gy : gy - ny;
        const h = octile(hx, hy) * unitCost;
        heap.upsert(tentative + h, h, next);
      }
    }
    return { status: "no_path", expanded };
  };

  return { findPath };
}

/** 목표에서 부모를 따라 올라가 출발 → 목표 순서의 칸 목록을 만든다 */
function tracePath(parent: Int32Array, goal: number): number[] {
  const backwards: number[] = [];
  for (let node = goal; node !== -1; node = parent[node] ?? -1) backwards.push(node);
  return backwards.toReversed();
}
