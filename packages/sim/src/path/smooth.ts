// 경로 시야선 다듬기(string pulling) — 사용자 지적 2026-11-15 "유닛이 이동시 직선거리를 두고도 엉망으로 이동"
// (docs/adr/2026-11-15-path-smoothing.md). A*는 8방향이라 비스듬한 목표에는 대각선 + 직선으로 꺾이고, 풀(1000)·흙(1050)처럼
// 비용이 조금 다른 칸 사이를 굽이굽이 지난다. 이 단계가 A* 칸 경로를 임의 각도 직선으로 줄인다.
//
// 규칙(정수·결정적 — Math.sqrt는 명세가 정확히 정한 함수라 써도 된다)
// - 칸 경로의 i번째 기준 칸에서 앞으로 k를 늘려 가며 i → k 직선을 볼 수 있으면 k를 넓히고, 처음 막히는 곳에서 멈춘다(욕심 탐색).
// - 직선을 볼 수 있음:
//   1) 직선이 쓸고 지나가는 기준 칸(sweptAnchors) 모두 그 크기 등급이 설 수 있다(통과 폭 ≥ s). 모서리를 정확히 지나면 양옆 칸을
//      모두 넣는다 — A*의 "모서리를 뚫지 않는다" 규칙과 같은 쪽으로 보수적이다.
//   2) 직선 비용 추정(유클리드 길이 × 지나는 칸(출발 칸 빼고) 중 가장 비싼 칸 비용) ≤ A* 경로의 그 부분 비용 × 1449/1448(대각선
//      걸음 길이 내림 몫). 그래서 다듬은 길이 숲·바위로 들어가 A*가 피한 비싼 칸을 밟지 않는다.
// - 구간 걸음 배율(구간 빠르기)은 지나는 칸 중 가장 큰 배율이다(보수적 — 실제보다 조금 늦게 닿을 수는 있어도 빠르지 않다).
import type { SizeClass } from "../grid/clearance.ts";
import { type PlacementGrid, footprintCost } from "../grid/placementGrid.ts";
import { PLACEMENT_SIZE } from "../units.ts";
import { DIAGONAL_STEP, STRAIGHT_STEP } from "./astar.ts";

/**
 * 기준 칸 a → b 직선(두 기준 칸의 왼쪽 위 모서리를 잇는 선을 따라 s×s 정사각형이 움직인다)이 덮는 기준 칸 번호.
 * 정사각형의 모서리 좌표가 정수가 아닌 동안은 양쪽 정수 칸을 모두 덮는다. 차례는 a에서 b 쪽이다(같은 칸이 두 번 나올 수 있다).
 */
export function sweptAnchors(a: number, b: number): number[] {
  const ax = a % PLACEMENT_SIZE;
  const ay = (a - ax) / PLACEMENT_SIZE;
  const bx = b % PLACEMENT_SIZE;
  const by = (b - bx) / PLACEMENT_SIZE;
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = bx >= ax ? 1 : -1;
  const sy = by >= ay ? 1 : -1;
  const out: number[] = [];
  if (dx === 0 && dy === 0) return [a];
  // i = 지난 x 정수선 수, j = 지난 y 정수선 수. (i + 1)/dx와 (j + 1)/dy를 곱셈으로 견주어 다음에 넘는 선을 고른다
  let i = 0;
  let j = 0;
  while (i < dx || j < dy) {
    const x0 = ax + sx * i;
    const y0 = ay + sy * j;
    const xs = dx === 0 ? [x0] : [x0, x0 + sx];
    const ys = dy === 0 ? [y0] : [y0, y0 + sy];
    for (const y of ys) for (const x of xs) out.push(y * PLACEMENT_SIZE + x);
    if (dx === 0) j++;
    else if (dy === 0) i++;
    else {
      const nextX = (i + 1) * dy;
      const nextY = (j + 1) * dx;
      if (nextX < nextY) i++;
      else if (nextY < nextX) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return out;
}

/** 칸 번호 → (x, y) */
const xyOf = (cell: number): { x: number; y: number } => {
  const x = cell % PLACEMENT_SIZE;
  return { x, y: (cell - x) / PLACEMENT_SIZE };
};

export interface SmoothedPath {
  /** 남긴 기준 칸(첫 칸·끝 칸 포함) */
  readonly cells: number[];
  /** 구간마다 걸음 배율(길이 = cells.length − 1) */
  readonly paces: number[];
}

/**
 * A* 칸 경로를 시야선으로 다듬는다. paceAt = 그 기준 칸의 걸음 배율(구간 빠르기, 없으면 늘 같은 값을 주면 된다).
 * 칸이 둘 이하면 그대로다(구간 배율은 끝 칸의 배율)
 */
export function smoothCellPath(
  grid: PlacementGrid,
  cells: readonly number[],
  size: SizeClass,
  paceAt: (cell: number) => number,
): SmoothedPath {
  const n = cells.length;
  if (n <= 1) return { cells: [...cells], paces: [] };
  // A* 경로 비용 누적(걸음 길이 × 들어가는 칸 비용 — astar.ts와 같은 꼴)
  const prefix = new Float64Array(n);
  for (let m = 1; m < n; m++) {
    const step = Math.abs((cells[m] ?? 0) - (cells[m - 1] ?? 0));
    const diagonal = step !== 1 && step !== PLACEMENT_SIZE;
    prefix[m] =
      (prefix[m - 1] ?? 0) +
      (diagonal ? DIAGONAL_STEP : STRAIGHT_STEP) * footprintCost(grid, cells[m] ?? 0, size);
  }
  const { clearance } = grid;
  /** i → k 직선을 볼 수 있으면 그 구간 배율, 아니면 null */
  const lineOf = (i: number, k: number): number | null => {
    const from = cells[i] ?? 0;
    const to = cells[k] ?? 0;
    let highestCost = 0;
    let highestPace = 0;
    for (const anchor of sweptAnchors(from, to)) {
      if ((clearance[anchor] ?? 0) < size) return null;
      // 출발 칸 자신은 비용·배율에 넣지 않는다(A* 걸음 비용 = 들어가는 칸의 비용)
      if (anchor === from) continue;
      const cost = footprintCost(grid, anchor, size);
      if (cost > highestCost) highestCost = cost;
      const pace = paceAt(anchor);
      if (pace > highestPace) highestPace = pace;
    }
    const a = xyOf(from);
    const b = xyOf(to);
    const ddx = b.x - a.x;
    const ddy = b.y - a.y;
    const estimate = Math.sqrt(ddx * ddx + ddy * ddy) * STRAIGHT_STEP * highestCost;
    // 대각선 걸음 길이 1448은 1024√2를 내린 값이라 곧은 대각선도 유클리드가 조금 길다 → 그만큼(1449/1448) 봐준다
    return estimate * DIAGONAL_STEP <= ((prefix[k] ?? 0) - (prefix[i] ?? 0)) * (DIAGONAL_STEP + 1)
      ? highestPace
      : null;
  };
  const kept = [cells[0] ?? 0];
  const paces: number[] = [];
  let i = 0;
  while (i < n - 1) {
    // 바로 다음 칸은 A*가 고른 한 걸음이라 늘 볼 수 있다(구간 배율 = 들어가는 칸의 배율, A* 걸음 비용과 같은 꼴)
    let best = i + 1;
    let bestPace = paceAt(cells[i + 1] ?? 0);
    for (let k = i + 2; k < n; k++) {
      const pace = lineOf(i, k);
      if (pace === null) break;
      best = k;
      bestPace = pace;
    }
    kept.push(cells[best] ?? 0);
    paces.push(bestPace);
    i = best;
  }
  return { cells: kept, paces };
}
