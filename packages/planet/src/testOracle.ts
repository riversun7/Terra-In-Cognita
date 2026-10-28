// 시험 전용 독립 기준(oracle) — 구현 코드를 쓰지 않고 칸이 3D에서 어떻게 맞닿는지 판정한다.
// 면 배치는 S2의 FaceUVtoXYZ 식을 그대로 적었다(면 0 = (1, u, v), 면 1 = (-u, 1, v), …).
// 정육면체를 [-n, n]³(n = 면당 칸 수)로 키우면 칸 꼭짓점이 모두 정수 좌표가 되어 오차 없이 비교된다.
// 구현에서 가져오는 것은 면 번호 타입(Face)뿐이다.
import type { Face } from "./faces.ts";

/** 면 `face`의 격자점 (p, q)(0 ≤ p, q ≤ n)를 정수 3D 좌표 문자열로 */
export function gridPoint(face: number, level: number, p: number, q: number): string {
  const n = 2 ** level;
  const u = 2 * p - n;
  const v = 2 * q - n;
  const byFace = [
    [n, u, v],
    [-u, n, v],
    [-u, -v, n],
    [-n, -v, -u],
    [v, -n, -u],
    [v, u, -n],
  ];
  const xyz = byFace[face];
  if (!xyz) throw new RangeError(`face must be 0..5: ${face}`);
  return xyz.join(",");
}

/** 칸 (face, level, i, j)의 꼭짓점 4개 */
export function cornerPoints(face: number, level: number, i: number, j: number): string[] {
  return [
    gridPoint(face, level, i, j),
    gridPoint(face, level, i + 1, j),
    gridPoint(face, level, i + 1, j + 1),
    gridPoint(face, level, i, j + 1),
  ];
}

export interface OracleCell {
  readonly face: Face;
  readonly i: number;
  readonly j: number;
}

/** 두 칸이 함께 가진 꼭짓점 수: 2면 변을 공유(4이웃), 1이면 꼭짓점만 공유, 0이면 떨어져 있다 */
export function sharedCorners(level: number, a: OracleCell, b: OracleCell): number {
  const pointsA = new Set(cornerPoints(a.face, level, a.i, a.j));
  return cornerPoints(b.face, level, b.i, b.j).filter((point) => pointsA.has(point)).length;
}

/** 한 레벨의 모든 칸 (면 순서, 면 안에서는 i 다음 j) */
export function allCells(level: number): OracleCell[] {
  const n = 2 ** level;
  const cells: OracleCell[] = [];
  for (const face of [0, 1, 2, 3, 4, 5] as const) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) cells.push({ face, i, j });
    }
  }
  return cells;
}

/**
 * 기하로 구한 이웃 표: 꼭짓점을 하나라도 공유하는 다른 칸(8이웃)과 변을 공유하는 칸(4이웃).
 * 키는 "face/i/j" 문자열이다.
 */
export function geometricNeighbors(level: number): Map<string, { edge: Set<string>; vertex: Set<string> }> {
  const cellsByPoint = new Map<string, OracleCell[]>();
  for (const cell of allCells(level)) {
    for (const point of cornerPoints(cell.face, level, cell.i, cell.j)) {
      const list = cellsByPoint.get(point) ?? [];
      list.push(cell);
      cellsByPoint.set(point, list);
    }
  }
  const result = new Map<string, { edge: Set<string>; vertex: Set<string> }>();
  for (const cell of allCells(level)) {
    // 다른 칸마다 함께 가진 꼭짓점 수를 센다: 1 이상 = 8이웃, 2 = 4이웃(변 공유)
    const shared = new Map<string, number>();
    const self = cellName(cell);
    for (const point of cornerPoints(cell.face, level, cell.i, cell.j)) {
      for (const other of cellsByPoint.get(point) ?? []) {
        const name = cellName(other);
        if (name !== self) shared.set(name, (shared.get(name) ?? 0) + 1);
      }
    }
    const vertex = new Set(shared.keys());
    const edge = new Set([...shared].filter(([, count]) => count === 2).map(([name]) => name));
    result.set(self, { edge, vertex });
  }
  return result;
}

export function cellName(cell: OracleCell): string {
  return `${cell.face}/${cell.i}/${cell.j}`;
}
