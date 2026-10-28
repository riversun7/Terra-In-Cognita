// 정육면체 꼭짓점 8곳과 꼭짓점에 닿은 칸 — 정수 연산만 쓴다.
// 꼭짓점에서는 면 3개(칸 3개)만 만나서, 평평한 3×3 이웃이 없다(2차맵 이음매 없는 연결이 안 되는 특이점).
// ADR 2026-10-28-planet-grid-contract: 행성을 회전시켜 꼭짓점을 바다에 두고 주변을 바다·통행 불가로 처리한다.
// 회전·바다 처리는 생성기가 한다. 이 파일은 생성기가 쓸 자료(꼭짓점 목록, 꼭짓점 칸)만 준다.
import { type CellKey, cellKey, decodeCellKey } from "./cellKey.ts";
import type { Face, IntVec3 } from "./faces.ts";
import { cellsPerSide } from "./levels.ts";

/** 꼭짓점 번호 = 축 부호 비트: x > 0 → 1, y > 0 → 2, z > 0 → 4 */
export type CubeCornerId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 한 면에서 본 꼭짓점 위치: u·v가 -1이면 그 축 시작(칸 좌표 0), +1이면 끝(칸 좌표 n-1) 쪽 */
export interface CubeCornerOnFace {
  readonly face: Face;
  readonly u: -1 | 1;
  readonly v: -1 | 1;
}

export interface CubeCorner {
  readonly id: CubeCornerId;
  /** 꼭짓점 방향의 축 부호 (x, y, z). 단위 벡터 = axisSigns / √3 */
  readonly axisSigns: IntVec3;
  /** 만나는 면 3개 (면 번호 오름차순) */
  readonly faces: readonly [CubeCornerOnFace, CubeCornerOnFace, CubeCornerOnFace];
}

/** 꼭짓점 8곳 (번호 순). FACE_FRAMES에서 손으로 풀었고 corners.test.ts가 기하로 확인한다 */
export const CUBE_CORNERS: readonly [
  CubeCorner,
  CubeCorner,
  CubeCorner,
  CubeCorner,
  CubeCorner,
  CubeCorner,
  CubeCorner,
  CubeCorner,
] = [
  {
    id: 0,
    axisSigns: [-1, -1, -1],
    faces: [
      { face: 3, u: 1, v: 1 },
      { face: 4, u: 1, v: -1 },
      { face: 5, u: -1, v: -1 },
    ],
  },
  {
    id: 1,
    axisSigns: [1, -1, -1],
    faces: [
      { face: 0, u: -1, v: -1 },
      { face: 4, u: 1, v: 1 },
      { face: 5, u: -1, v: 1 },
    ],
  },
  {
    id: 2,
    axisSigns: [-1, 1, -1],
    faces: [
      { face: 1, u: 1, v: -1 },
      { face: 3, u: 1, v: -1 },
      { face: 5, u: 1, v: -1 },
    ],
  },
  {
    id: 3,
    axisSigns: [1, 1, -1],
    faces: [
      { face: 0, u: 1, v: -1 },
      { face: 1, u: -1, v: -1 },
      { face: 5, u: 1, v: 1 },
    ],
  },
  {
    id: 4,
    axisSigns: [-1, -1, 1],
    faces: [
      { face: 2, u: 1, v: 1 },
      { face: 3, u: -1, v: 1 },
      { face: 4, u: -1, v: -1 },
    ],
  },
  {
    id: 5,
    axisSigns: [1, -1, 1],
    faces: [
      { face: 0, u: -1, v: 1 },
      { face: 2, u: -1, v: 1 },
      { face: 4, u: -1, v: 1 },
    ],
  },
  {
    id: 6,
    axisSigns: [-1, 1, 1],
    faces: [
      { face: 1, u: 1, v: 1 },
      { face: 2, u: 1, v: -1 },
      { face: 3, u: -1, v: -1 },
    ],
  },
  {
    id: 7,
    axisSigns: [1, 1, 1],
    faces: [
      { face: 0, u: 1, v: 1 },
      { face: 1, u: -1, v: 1 },
      { face: 2, u: -1, v: -1 },
    ],
  },
];

// 면별 모서리 → 꼭짓점 번호. 칸 위치 = 면 × 4 + (u > 0 ? 1 : 0) + (v > 0 ? 2 : 0)
const CORNER_AT_FACE_UV: CubeCornerId[] = [];
for (const corner of CUBE_CORNERS) {
  for (const { face, u, v } of corner.faces) {
    CORNER_AT_FACE_UV[face * 4 + (u > 0 ? 1 : 0) + (v > 0 ? 2 : 0)] = corner.id;
  }
}

function cornerAt(face: Face, uEnd: boolean, vEnd: boolean): CubeCornerId {
  const id = CORNER_AT_FACE_UV[face * 4 + (uEnd ? 1 : 0) + (vEnd ? 2 : 0)];
  if (id === undefined) throw new Error(`corner table is missing face ${face}`);
  return id;
}

/** 레벨 `level`에서 꼭짓점 `corner`에 닿은 칸 3개 (CubeCorner.faces 순서) */
export function cubeCornerCells(corner: CubeCornerId, level: number): readonly [CellKey, CellKey, CellKey] {
  const entry = CUBE_CORNERS[corner];
  if (!entry) throw new RangeError(`cube corner must be 0..7: ${corner}`);
  const last = cellsPerSide(level) - 1;
  const cellAt = ({ face, u, v }: CubeCornerOnFace) =>
    cellKey(face, level, u > 0 ? last : 0, v > 0 ? last : 0);
  const [a, b, c] = entry.faces;
  return [cellAt(a), cellAt(b), cellAt(c)];
}

/**
 * 칸이 닿은 정육면체 꼭짓점 (번호 오름차순).
 * 레벨 1 이상: 면 모서리 칸이면 꼭짓점 1개, 아니면 빈 배열. 레벨 0(면 하나): 그 면의 꼭짓점 4개.
 */
export function cubeCornersOfCell(key: CellKey): CubeCornerId[] {
  const { face, level, i, j } = decodeCellKey(key);
  if (level === 0) {
    return [
      cornerAt(face, false, false),
      cornerAt(face, true, false),
      cornerAt(face, false, true),
      cornerAt(face, true, true),
    ].toSorted((x, y) => x - y);
  }
  const last = cellsPerSide(level) - 1;
  if ((i !== 0 && i !== last) || (j !== 0 && j !== last)) return [];
  return [cornerAt(face, i === last, j === last)];
}
