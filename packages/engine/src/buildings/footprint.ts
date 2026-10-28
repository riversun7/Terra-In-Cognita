// 건물 바닥 모양 — 순수 코드(시험 대상). S1은 직사각형, 90° 회전, 2차맵 하나 안(D-133, ADR 2026-10-28-s1-second-map "건물 배치").
// 겹침·지형·도로 검사는 서버가 한다. 기기는 그리기와 미리 보기만 한다.
// 회전: 앞면 방향을 시계 방향으로 90°씩 돌린다(0 남쪽, 1 서쪽, 2 북쪽, 3 동쪽). 홀수면 가로·세로가 바뀐다.
// 기준 칸(cellX, cellY)은 회전과 상관없이 차지한 칸의 왼쪽 위(가장 작은 x·y)다.

export type QuarterTurns = 0 | 1 | 2 | 3;

export interface BuildingFootprint {
  id: number;
  /** 기준 칸(배치 칸, 왼쪽 위) */
  cellX: number;
  cellY: number;
  /** 돌리기 전 크기(배치 칸): 가로(x), 세로(y) */
  width: number;
  depth: number;
  rotation: QuarterTurns;
  /** 높이(m, 표시용) */
  heightM: number;
  /** 색 0xRRGGBB(없으면 기본 색) */
  color?: number;
}

/** 차지한 칸 범위: x0 ≤ x < x1, y0 ≤ y < y1 */
export interface CellRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function footprintRect(footprint: BuildingFootprint): CellRect {
  const odd = footprint.rotation % 2 === 1;
  const w = odd ? footprint.depth : footprint.width;
  const d = odd ? footprint.width : footprint.depth;
  return { x0: footprint.cellX, y0: footprint.cellY, x1: footprint.cellX + w, y1: footprint.cellY + d };
}

/** 차지한 칸 번호(행 × gridSize + 열). 2차맵 밖 칸은 뺀다 */
export function footprintCells(footprint: BuildingFootprint, gridSize: number): number[] {
  const rect = footprintRect(footprint);
  const cells: number[] = [];
  for (let y = Math.max(0, rect.y0); y < Math.min(gridSize, rect.y1); y++) {
    for (let x = Math.max(0, rect.x0); x < Math.min(gridSize, rect.x1); x++) cells.push(y * gridSize + x);
  }
  return cells;
}

/** 2차맵(gridSize × gridSize) 안에 다 들어가는지 */
export function footprintInside(footprint: BuildingFootprint, gridSize: number): boolean {
  const rect = footprintRect(footprint);
  return (
    rect.x0 >= 0 &&
    rect.y0 >= 0 &&
    rect.x1 <= gridSize &&
    rect.y1 <= gridSize &&
    rect.x1 > rect.x0 &&
    rect.y1 > rect.y0
  );
}

/** 앞면이 보는 방향(x, y 배치 칸 단위 벡터) */
export function frontDirection(rotation: QuarterTurns): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x: 0, y: 1 };
    case 1:
      return { x: -1, y: 0 };
    case 2:
      return { x: 0, y: -1 };
    case 3:
      return { x: 1, y: 0 };
    default: {
      const unhandled: never = rotation;
      return unhandled;
    }
  }
}
