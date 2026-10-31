// 크기 등급별 연결 영역 번호 — ADR 35 "경로탐색" 기술 제안(ADR 46 WP-3에서 넣음). 출발과 목표가 다른 영역이면
// 길찾기가 칸을 펼치지 않고 바로 no_path로 답한다(숲·깊은 강으로 갈린 2차맵에서 묶음 전체를 펼치지 않게).
// 영역 = 그 등급이 설 수 있는 칸(통과 폭 ≥ 등급)의 네 방향 이어짐. 길찾기의 대각선 걸음은 양옆 두 칸에도 설 수 있어야 해서
// (astar.ts) 네 방향 이어짐과 닿는 곳이 같다. 번호 = 영역에서 칸 번호가 가장 작은 칸(설 수 없으면 −1).
// 처음 부를 때 계산하고 격자에 둔다. 칸을 바꾸는 함수(placementGrid.ts)가 캐시를 비운다.
import { PLACEMENT_CELLS, PLACEMENT_SIZE } from "../units.ts";
import type { SizeClass } from "./clearance.ts";
import type { PlacementGrid } from "./placementGrid.ts";

export function componentLabels(grid: PlacementGrid, size: SizeClass): Int32Array {
  const cached = grid.componentCache[size];
  if (cached) return cached;
  const { clearance } = grid;
  const label = new Int32Array(PLACEMENT_CELLS).fill(-1);
  const queue = new Int32Array(PLACEMENT_CELLS);
  for (let start = 0; start < PLACEMENT_CELLS; start++) {
    if (label[start] !== -1 || (clearance[start] ?? 0) < size) continue;
    let head = 0;
    let tail = 0;
    label[start] = start;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++] ?? 0;
      const x = cell % PLACEMENT_SIZE;
      if (x > 0) tail = visit(cell - 1, start, size, clearance, label, queue, tail);
      if (x < PLACEMENT_SIZE - 1) tail = visit(cell + 1, start, size, clearance, label, queue, tail);
      if (cell >= PLACEMENT_SIZE)
        tail = visit(cell - PLACEMENT_SIZE, start, size, clearance, label, queue, tail);
      if (cell < PLACEMENT_CELLS - PLACEMENT_SIZE) {
        tail = visit(cell + PLACEMENT_SIZE, start, size, clearance, label, queue, tail);
      }
    }
  }
  grid.componentCache[size] = label;
  return label;
}

/** 이웃 칸이 아직 번호가 없고 설 수 있으면 번호를 매기고 대기열에 넣는다. 새 대기열 끝을 돌려준다 */
function visit(
  cell: number,
  id: number,
  size: SizeClass,
  clearance: Uint8Array,
  label: Int32Array,
  queue: Int32Array,
  tail: number,
): number {
  if (label[cell] !== -1 || (clearance[cell] ?? 0) < size) return tail;
  label[cell] = id;
  queue[tail] = cell;
  return tail + 1;
}
