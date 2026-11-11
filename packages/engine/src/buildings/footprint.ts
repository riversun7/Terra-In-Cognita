// 건물 바닥 모양 — 순수 코드(시험 대상). S1은 직사각형, 90° 회전, 2차맵 하나 안(D-133, ADR 2026-10-28-s1-second-map "건물 배치").
// 겹침·지형·도로 검사는 서버가 한다. 기기는 그리기와 미리 보기만 한다.
// 회전: 앞면 방향을 시계 방향으로 90°씩 돌린다(0 남쪽, 1 서쪽, 2 북쪽, 3 동쪽). 홀수면 가로·세로가 바뀐다.
// 기준 칸(cellX, cellY)은 회전과 상관없이 차지한 칸의 왼쪽 위(가장 작은 x·y)다.
import type { BuildingLook } from "./buildingLook.ts";

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
  /** 높이(m, 표시용) — 겉모습 모델(buildingModels.ts)은 쓰지 않는다(종류마다 정한 높이). 미리 보기 등이 쓴다 */
  heightM: number;
  /** 색 0xRRGGBB — 겉모습 모델은 쓰지 않는다(색 표 buildingPalette.ts) */
  color?: number;
  /** 겉모습: 시설 ID·레벨·상태·국가 색 번호(없으면 일반 집, ADR 2026-11-08-building-art) */
  look?: BuildingLook | undefined;
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

/** 건물이 차지한 칸 표(gridSize², 차지했으면 1) — 소품 모델이 건물 판 안에 서지 않게 거른다(props/propView.ts) */
export function footprintMask(buildings: readonly BuildingFootprint[], gridSize: number): Uint8Array {
  const mask = new Uint8Array(gridSize * gridSize);
  for (const building of buildings) for (const cell of footprintCells(building, gridSize)) mask[cell] = 1;
  return mask;
}

/** 2차맵 밖 칸(지금 2차맵 틀의 배치 칸 좌표, −gridSize ~ 2 × gridSize)의 열쇠 — 옆 2차맵 건물이 차지한 칸 모음에 쓴다 */
export function outsideCellKey(x: number, y: number): number {
  return (y + 1024) * 4096 + (x + 1024);
}

/**
 * 건물이 차지한 칸 가운데 지금 2차맵 밖의 칸(옆 2차맵 건물 — 지금 2차맵 틀로 옮겨 넣은 것). 소품 모델이 옆 2차맵 건물 판 안에도 서지 않게
 * 거른다(넘는 순간 그 나무가 사라지지 않게, docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)"). 없으면 null
 */
export function footprintOutsideCells(
  buildings: readonly BuildingFootprint[],
  gridSize: number,
): Set<number> | null {
  let cells: Set<number> | null = null;
  for (const building of buildings) {
    const rect = footprintRect(building);
    if (rect.x0 >= 0 && rect.y0 >= 0 && rect.x1 <= gridSize && rect.y1 <= gridSize) continue;
    for (let y = rect.y0; y < rect.y1; y++) {
      for (let x = rect.x0; x < rect.x1; x++) {
        if (x >= 0 && y >= 0 && x < gridSize && y < gridSize) continue;
        cells ??= new Set();
        cells.add(outsideCellKey(x, y));
      }
    }
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
