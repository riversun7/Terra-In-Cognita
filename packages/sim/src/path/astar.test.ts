import { type Rng, createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import type { SizeClass } from "../grid/clearance.ts";
import { ROAD_COST } from "../grid/costs.ts";
import {
  type PlacementGrid,
  createPlacementGrid,
  isPassable,
  setRoad,
  setTerrainCost,
} from "../grid/placementGrid.ts";
import { createFnv1a } from "../math/hash.ts";
import { PLACEMENT_SIZE } from "../units.ts";
import { DIAGONAL_STEP, STRAIGHT_STEP, type PathResult, createPathfinder } from "./astar.ts";

const N = PLACEMENT_SIZE;
const pathfinder = createPathfinder();
const SIZES: readonly SizeClass[] = [1, 2, 3];

/** 크기 등급 1 ~ count 중 하나 */
function pickSize(rng: Rng, count: number): SizeClass {
  return SIZES[rng.nextInt(count)] ?? 1;
}

function blockRect(grid: PlacementGrid, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTerrainCost(grid, x, y, 0);
}

function costOf(result: PathResult): number {
  if (result.status !== "found") throw new Error(`path not found: ${result.status}`);
  return result.cost;
}

// ── 명세를 따로 옮긴 기준 구현(통과 폭 배열을 쓰지 않는다) ──────────────────────────────
// 열린 칸: 건물 없음 + (도로 있음 또는 지형 비용 > 0). 등급 s는 기준 칸에서 s×s가 모두 열려야 선다.
function cellOpen(grid: PlacementGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  const i = y * N + x;
  return grid.building[i] === 0 && (grid.road[i] !== 0 || grid.terrainCost[i] !== 0);
}
function fits(grid: PlacementGrid, x: number, y: number, s: number): boolean {
  for (let dy = 0; dy < s; dy++)
    for (let dx = 0; dx < s; dx++) if (!cellOpen(grid, x + dx, y + dy)) return false;
  return true;
}
function enterCost(grid: PlacementGrid, x: number, y: number, s: number): number {
  let highest = 0;
  for (let dy = 0; dy < s; dy++) {
    for (let dx = 0; dx < s; dx++) {
      const i = (y + dy) * N + (x + dx);
      const road = grid.road[i] ?? 0;
      const cost = road !== 0 ? (ROAD_COST[road] ?? 0) : (grid.terrainCost[i] ?? 0);
      highest = Math.max(highest, cost);
    }
  }
  return highest;
}
// 한 걸음이 규칙에 맞으면 비용, 아니면 -1. 대각선은 양옆 두 기준 칸도 서야 한다(모서리 뚫기 금지).
function stepCost(grid: PlacementGrid, x: number, y: number, dx: number, dy: number, s: number): number {
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return -1;
  if (!fits(grid, x + dx, y + dy, s)) return -1;
  if (dx !== 0 && dy !== 0 && !(fits(grid, x + dx, y, s) && fits(grid, x, y + dy, s))) return -1;
  return (dx !== 0 && dy !== 0 ? 1448 : 1024) * enterCost(grid, x + dx, y + dy, s);
}
// 단순 다익스트라(열린 목록에서 가장 작은 값을 매번 훑는다). 작은 지역에서만 쓴다.
function referenceCost(
  grid: PlacementGrid,
  region: { x0: number; y0: number; x1: number; y1: number },
  start: { x: number; y: number },
  goal: { x: number; y: number },
  s: number,
): number | null {
  const dist = new Map<number, number>();
  const done = new Set<number>();
  dist.set(start.y * N + start.x, 0);
  for (;;) {
    let best = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const [key, cost] of dist) {
      if (!done.has(key) && cost < bestCost) {
        best = key;
        bestCost = cost;
      }
    }
    if (best < 0) return null;
    if (best === goal.y * N + goal.x) return bestCost;
    done.add(best);
    const bx = best % N;
    const by = (best - bx) / N;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = bx + dx;
        const ny = by + dy;
        if (nx < region.x0 || ny < region.y0 || nx > region.x1 || ny > region.y1) continue;
        const step = stepCost(grid, bx, by, dx, dy, s);
        if (step < 0) continue;
        const key = ny * N + nx;
        const next = bestCost + step;
        if (next < (dist.get(key) ?? Number.POSITIVE_INFINITY)) dist.set(key, next);
      }
    }
  }
}
// 찾은 경로가 규칙을 지키고, 비용 합이 보고한 값과 같은지
function expectValidPath(grid: PlacementGrid, cells: readonly number[], s: number, cost: number): void {
  let total = 0;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1] ?? 0;
    const b = cells[i] ?? 0;
    const step = stepCost(
      grid,
      a % N,
      Math.floor(a / N),
      (b % N) - (a % N),
      Math.floor(b / N) - Math.floor(a / N),
      s,
    );
    expect(step, `step ${i} of path`).toBeGreaterThan(0);
    total += step;
  }
  expect(total).toBe(cost);
}

// 크기 등급 시험: x = 30 벽을 넘어 (20,40) → (40,40)
const wallRequest = (size: SizeClass) => ({ start: { x: 20, y: 40 }, goal: { x: 40, y: 40 }, size });

// 결정성 시험: 고정 시드로 막힌 칸·도로를 뿌린 지도
function buildGoldenGrid(): PlacementGrid {
  const rng = createRng(33);
  const grid = createPlacementGrid();
  for (let i = 0; i < 9000; i++) setTerrainCost(grid, rng.nextInt(N), rng.nextInt(N), 0);
  for (let i = 0; i < 600; i++) setRoad(grid, rng.nextInt(N), rng.nextInt(N), 1 + rng.nextInt(5));
  return grid;
}

// 고정 시드의 요청 40개를 새 길찾기 객체 하나로 풀고(작업 배열을 다시 씀) 결과(상태·비용·칸)를 해시한다
function runGoldenQueries(grid: PlacementGrid): { digest: string; found: number } {
  const rng = createRng(99);
  const hash = createFnv1a();
  const finder = createPathfinder();
  const pickCell = (size: SizeClass) => {
    for (;;) {
      const cell = { x: rng.nextInt(N), y: rng.nextInt(N) };
      if (isPassable(grid, cell.x, cell.y, size)) return cell;
    }
  };
  let found = 0;
  for (let i = 0; i < 40; i++) {
    const size = pickSize(rng, 2);
    const request = { start: pickCell(size), goal: pickCell(size), size };
    const result = finder.findPath(grid, request);
    hash.updateText(result.status);
    if (result.status === "found") {
      found++;
      hash.updateSafeInteger(result.cost);
      for (const cell of result.cells) hash.update32(cell);
    }
  }
  return { digest: hash.digest(), found };
}

describe("A* 경로탐색", () => {
  it("빈 지도: 직선·대각선·섞인 경로 비용", () => {
    const grid = createPlacementGrid();
    const find = (gx: number, gy: number) =>
      pathfinder.findPath(grid, { start: { x: 10, y: 10 }, goal: { x: gx, y: gy }, size: 1 });
    expect(STRAIGHT_STEP).toBe(1024);
    expect(DIAGONAL_STEP).toBe(1448);
    expect(costOf(find(15, 10))).toBe(5_120_000);
    expect(costOf(find(13, 13))).toBe(4_344_000);
    // 오른쪽 5, 아래 2: 직선 3 + 대각선 2
    expect(costOf(find(15, 12))).toBe(5_968_000);
    const same = find(10, 10);
    expect(same.status === "found" && same.cells).toEqual([10 * N + 10]);
  });

  it("모서리를 뚫고 대각선으로 지나가지 않는다", () => {
    const grid = createPlacementGrid();
    setTerrainCost(grid, 11, 10, 0);
    const oneSide = pathfinder.findPath(grid, { start: { x: 10, y: 10 }, goal: { x: 11, y: 11 }, size: 1 });
    expect(costOf(oneSide)).toBe(2_048_000);
    setTerrainCost(grid, 10, 11, 0);
    const bothSides = pathfinder.findPath(grid, { start: { x: 10, y: 10 }, goal: { x: 11, y: 11 }, size: 1 });
    // 막힌 두 칸을 돌아 6걸음(위로 돌거나 왼쪽으로 돈다)
    expect(costOf(bothSides)).toBe(6_144_000);
    if (bothSides.status === "found") {
      expect(bothSides.cells).toHaveLength(7);
      expectValidPath(grid, bothSides.cells, 1, bothSides.cost);
    }
  });

  it("크기 등급: 폭 2칸 유닛은 폭 1칸 틈을 거부하고 폭 2칸 틈으로 돌아간다", () => {
    const grid = createPlacementGrid();
    // x = 30 벽(위아래 끝까지). 폭 1칸 틈 y = 40, 폭 2칸 틈 y = 70·71
    blockRect(grid, 30, 0, 30, 39);
    blockRect(grid, 30, 41, 30, 69);
    blockRect(grid, 30, 72, 30, N - 1);
    expect(costOf(pathfinder.findPath(grid, wallRequest(1)))).toBe(20_480_000);
    const large = pathfinder.findPath(grid, wallRequest(2));
    // (20,40) → (28,70): 대각선 8 + 직선 22, 틈 통과 직선 3, (31,70) → (40,40): 대각선 9 + 직선 21
    expect(costOf(large)).toBe(71_720_000);
    if (large.status === "found") {
      expect(large.cells).toContain(70 * N + 30);
      expectValidPath(grid, large.cells, 2, large.cost);
    }
    // 폭 3칸 유닛은 지나갈 틈이 없다
    expect(pathfinder.findPath(grid, wallRequest(3)).status).toBe("no_path");
    // 폭 2칸 틈을 닫으면 대형도 길이 없다
    setTerrainCost(grid, 30, 71, 0);
    expect(pathfinder.findPath(grid, wallRequest(2)).status).toBe("no_path");
    expect(costOf(pathfinder.findPath(grid, wallRequest(1)))).toBe(20_480_000);
  });

  it("도로 비용이 길 선택을 바꾼다", () => {
    const grid = createPlacementGrid();
    // 직선(평지 20칸 = 20,480,000)보다 고속도로로 두 칸 돌아가는 편이 싸다
    for (let x = 10; x <= 30; x++) setRoad(grid, x, 12, 5);
    const result = pathfinder.findPath(grid, { start: { x: 10, y: 10 }, goal: { x: 30, y: 10 }, size: 1 });
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.cost).toBeLessThan(20_480_000);
      expect(result.cells).toContain(12 * N + 20);
      expectValidPath(grid, result.cells, 1, result.cost);
    }
  });

  it("무작위 작은 지도에서 비용이 기준 다익스트라와 같다", () => {
    const rng = createRng(1028);
    let compared = 0;
    let reachable = 0;
    for (let round = 0; round < 120; round++) {
      const grid = createPlacementGrid(new Uint16Array(N * N));
      const w = 4 + rng.nextInt(10);
      const h = 4 + rng.nextInt(10);
      // 지도 가장자리에 붙은 지역도 섞는다
      const x0 = rng.nextInt(4) === 0 ? N - w : rng.nextInt(N - w);
      const y0 = rng.nextInt(4) === 0 ? 0 : rng.nextInt(N - h);
      const region = { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
      const costs = [0, 1000, 1000, 1050, 1300, 2500];
      for (let y = region.y0; y <= region.y1; y++) {
        for (let x = region.x0; x <= region.x1; x++) {
          setTerrainCost(grid, x, y, costs[rng.nextInt(costs.length)] ?? 0);
          if (rng.nextInt(8) === 0) setRoad(grid, x, y, 1 + rng.nextInt(ROAD_COST.length - 1));
        }
      }
      for (let query = 0; query < 6; query++) {
        const size = pickSize(rng, 3);
        const start = { x: region.x0 + rng.nextInt(w), y: region.y0 + rng.nextInt(h) };
        const goal = { x: region.x0 + rng.nextInt(w), y: region.y0 + rng.nextInt(h) };
        const result = pathfinder.findPath(grid, { start, goal, size });
        if (!fits(grid, start.x, start.y, size)) {
          expect(result.status).toBe("start_blocked");
          continue;
        }
        if (!fits(grid, goal.x, goal.y, size)) {
          expect(result.status).toBe("goal_blocked");
          continue;
        }
        const expected = referenceCost(grid, region, start, goal, size);
        compared++;
        if (expected === null) {
          expect(result.status).toBe("no_path");
        } else {
          reachable++;
          expect(costOf(result)).toBe(expected);
          if (result.status === "found") expectValidPath(grid, result.cells, size, result.cost);
        }
      }
    }
    // 시험이 실제로 비교를 많이 했는지(빈 비교로 통과하지 않게)
    expect(compared).toBeGreaterThan(150);
    expect(reachable).toBeGreaterThan(80);
  });

  it("노드 예산을 넘으면 멈추고, 갇힌 목표는 길 없음이다", () => {
    const grid = createPlacementGrid();
    const far = { start: { x: 0, y: 0 }, goal: { x: 255, y: 200 }, size: 1 as const };
    expect(pathfinder.findPath(grid, { ...far, nodeBudget: 50 })).toEqual({
      status: "budget_exceeded",
      expanded: 50,
    });
    expect(pathfinder.findPath(grid, far).status).toBe("found");
    // 목표를 벽으로 둘러싼다
    blockRect(grid, 99, 99, 101, 99);
    blockRect(grid, 99, 101, 101, 101);
    setTerrainCost(grid, 99, 100, 0);
    setTerrainCost(grid, 101, 100, 0);
    const enclosed = pathfinder.findPath(grid, {
      start: { x: 10, y: 10 },
      goal: { x: 100, y: 100 },
      size: 1,
    });
    expect(enclosed.status).toBe("no_path");
  });

  it("출발·목표가 막혔거나 요청이 틀리면 알려 준다", () => {
    const grid = createPlacementGrid();
    setTerrainCost(grid, 5, 5, 0);
    const base = { start: { x: 1, y: 1 }, goal: { x: 9, y: 9 }, size: 1 as const };
    expect(pathfinder.findPath(grid, { ...base, start: { x: 5, y: 5 } }).status).toBe("start_blocked");
    expect(pathfinder.findPath(grid, { ...base, goal: { x: 5, y: 5 } }).status).toBe("goal_blocked");
    // 기준 칸 (255, 0)의 2×2는 지도 밖으로 나간다
    expect(pathfinder.findPath(grid, { ...base, goal: { x: 255, y: 0 }, size: 2 }).status).toBe(
      "goal_blocked",
    );
    for (const bad of [
      { ...base, start: { x: -1, y: 0 } },
      { ...base, goal: { x: 0, y: 256 } },
      { ...base, start: { x: 0.5, y: 0 } },
      // 타입 밖의 값(서버가 받은 틀린 입력)을 실행 중에 거르는지 본다
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      { ...base, size: 4 as SizeClass },
      { ...base, nodeBudget: 0 },
    ]) {
      expect(pathfinder.findPath(grid, bad).status).toBe("invalid_request");
    }
  });

  it("결정적이다: 같은 지도·요청은 같은 경로, 고정 시나리오의 해시가 바뀌지 않는다", () => {
    const first = runGoldenQueries(buildGoldenGrid());
    expect(runGoldenQueries(buildGoldenGrid())).toEqual(first);
    expect(first.found).toBeGreaterThan(30);
    // 골든 값: 탐색 규칙(비용·이웃 순서·동점 처리)이 바뀌면 달라진다. 의도한 변경이면 SIM_VERSION을 올린다.
    expect(first.digest).toBe("8c0b39be");
  });
});
