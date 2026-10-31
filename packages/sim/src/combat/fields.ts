// 전투 이동 흐름장 — docs/adr/2026-10-31-combat-core.md "이동"
// 여러 출발 칸에서 넓혀 가는 거리장(8방향, 대각선은 양옆 두 칸이 모두 지나갈 수 있어야 함 = 경로탐색 모서리 규칙).
// 유닛은 한 걸음마다 거리가 더 작은 이웃 칸(정해진 이웃 차례)으로 간다. 거리장은 지형·건물(편마다 성문)만 보고 유닛은
// 보지 않아서 같은 입력이면 같은 장이다. 유닛 자리는 걸음을 고를 때 따로 본다.
import type { BattleMap } from "./battleMap.ts";

/** 이웃 차례(결정성): 북·동·남·서·북동·남동·남서·북서 */
export const NEIGHBORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

export const UNREACHABLE = -1;

/** 지나가기 판정: 칸 → 그 편이 지나갈 수 있나 */
export type PassFn = (cell: number) => boolean;

/** 걸음 하나가 모서리 규칙을 지키나(대각선이면 양옆 두 칸이 모두 지나갈 수 있어야) */
export function stepAllowed(
  size: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  pass: PassFn,
): boolean {
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= size || ny >= size || !pass(ny * size + nx)) return false;
  if (dx !== 0 && dy !== 0 && (!pass(y * size + nx) || !pass(ny * size + x))) return false;
  return true;
}

/** 출발 칸들에서의 걸음 수(못 닿으면 −1). 출발 칸은 지나갈 수 없어도 0으로 둔다(건물·적 자리 옆까지 오게) */
export function distanceField(map: BattleMap, sources: readonly number[], pass: PassFn): Int32Array {
  const { size } = map;
  const dist = new Int32Array(size * size).fill(UNREACHABLE);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;
  for (const cell of sources) {
    if (dist[cell] !== UNREACHABLE) continue;
    dist[cell] = 0;
    queue[tail++] = cell;
  }
  while (head < tail) {
    const cell = queue[head++] ?? 0;
    const x = cell % size;
    const y = (cell - x) / size;
    const next = (dist[cell] ?? 0) + 1;
    for (const [dx, dy] of NEIGHBORS) {
      if (!stepAllowed(size, x, y, dx, dy, pass)) continue;
      const to = (y + dy) * size + x + dx;
      if (dist[to] !== UNREACHABLE) continue;
      dist[to] = next;
      queue[tail++] = to;
    }
  }
  return dist;
}
