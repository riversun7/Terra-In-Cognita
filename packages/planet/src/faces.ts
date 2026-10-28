// 정육면체 면 배치와 면 경계 변환표 — ADR 2026-10-28-planet-grid-contract "면 경계: 좌표 변환표 + 전수 테스트"
// 정수 연산만 쓴다(판정 보조 코드에서 써도 된다).
//
// 면 배치는 S2와 같다: 면 0 = +x, 1 = +y, 2 = +z, 3 = -x, 4 = -y, 5 = -z (반대쪽 면 = (f + 3) mod 6).
// 면 f 위의 점 = normal + u·uAxis + v·vAxis (u, v ∈ [-1, 1]).
// 칸 좌표 (i, j)는 i가 u 방향, j가 v 방향으로 커진다. 모든 면에서 uAxis × vAxis = normal이라
// 밖에서 보면 i → j 순서가 반시계 방향이다.
import { cellsPerSide, isIntegerInRange } from "./levels.ts";

export type Face = 0 | 1 | 2 | 3 | 4 | 5;

export const FACES: readonly Face[] = [0, 1, 2, 3, 4, 5];

export function isFace(value: unknown): value is Face {
  return typeof value === "number" && isIntegerInRange(value, 0, 5);
}

/** 정수 성분 3차원 벡터 (면 축은 ±1, 0만 쓴다) */
export type IntVec3 = readonly [x: number, y: number, z: number];

export interface FaceFrame {
  /** 면 중심 방향 */
  readonly normal: IntVec3;
  /** u(칸 좌표 i)가 커지는 방향 */
  readonly uAxis: IntVec3;
  /** v(칸 좌표 j)가 커지는 방향 */
  readonly vAxis: IntVec3;
}

type PerFace<T> = readonly [T, T, T, T, T, T];

/** 면마다 축 (S2 FaceUVtoXYZ와 같다: 면 0 = (1, u, v), 면 1 = (-u, 1, v), 면 2 = (-u, -v, 1), …) */
export const FACE_FRAMES: PerFace<FaceFrame> = [
  { normal: [1, 0, 0], uAxis: [0, 1, 0], vAxis: [0, 0, 1] },
  { normal: [0, 1, 0], uAxis: [-1, 0, 0], vAxis: [0, 0, 1] },
  { normal: [0, 0, 1], uAxis: [-1, 0, 0], vAxis: [0, -1, 0] },
  { normal: [-1, 0, 0], uAxis: [0, 0, -1], vAxis: [0, -1, 0] },
  { normal: [0, -1, 0], uAxis: [0, 0, -1], vAxis: [1, 0, 0] },
  { normal: [0, 0, -1], uAxis: [0, 1, 0], vAxis: [1, 0, 0] },
];

/** 면의 가장자리: iMinus = i가 0인 쪽(u = -1), iPlus = i가 끝인 쪽(u = +1), jMinus·jPlus도 같다 */
export type FaceEdge = "iMinus" | "iPlus" | "jMinus" | "jPlus";

export const FACE_EDGES: readonly FaceEdge[] = ["iMinus", "iPlus", "jMinus", "jPlus"];

/** 면의 한 가장자리를 넘었을 때 들어가는 곳 */
export interface FaceEdgeLink {
  /** 맞닿은 면 */
  readonly face: Face;
  /** 맞닿은 면에서 들어가는 가장자리 */
  readonly edge: FaceEdge;
  /**
   * 가장자리를 따라가는 좌표(i 가장자리면 j, j 가장자리면 i)가 뒤집히는지.
   * 뒤집히면 이쪽 t번째 칸이 저쪽 (n - 1 - t)번째 칸과 맞닿는다.
   */
  readonly reversed: boolean;
}

/**
 * 면 경계 좌표 변환표 (12개 모서리 × 양쪽 = 24칸).
 * FACE_FRAMES에서 손으로 풀었다. 짝수 면과 홀수 면의 규칙이 다른 것은 S2처럼 홀수 면의 축이 바뀌어 있어서다.
 * 전수 시험(faces.test.ts)이 칸 꼭짓점의 3D 좌표로 맞는지 확인한다.
 */
export const FACE_EDGE_LINKS: PerFace<Readonly<Record<FaceEdge, FaceEdgeLink>>> = [
  {
    iMinus: { face: 4, edge: "jPlus", reversed: true },
    iPlus: { face: 1, edge: "iMinus", reversed: false },
    jMinus: { face: 5, edge: "jPlus", reversed: false },
    jPlus: { face: 2, edge: "iMinus", reversed: true },
  },
  {
    iMinus: { face: 0, edge: "iPlus", reversed: false },
    iPlus: { face: 3, edge: "jMinus", reversed: true },
    jMinus: { face: 5, edge: "iPlus", reversed: true },
    jPlus: { face: 2, edge: "jMinus", reversed: false },
  },
  {
    iMinus: { face: 0, edge: "jPlus", reversed: true },
    iPlus: { face: 3, edge: "iMinus", reversed: false },
    jMinus: { face: 1, edge: "jPlus", reversed: false },
    jPlus: { face: 4, edge: "iMinus", reversed: true },
  },
  {
    iMinus: { face: 2, edge: "iPlus", reversed: false },
    iPlus: { face: 5, edge: "jMinus", reversed: true },
    jMinus: { face: 1, edge: "iPlus", reversed: true },
    jPlus: { face: 4, edge: "jMinus", reversed: false },
  },
  {
    iMinus: { face: 2, edge: "jPlus", reversed: true },
    iPlus: { face: 5, edge: "iMinus", reversed: false },
    jMinus: { face: 3, edge: "jPlus", reversed: false },
    jPlus: { face: 0, edge: "iMinus", reversed: true },
  },
  {
    iMinus: { face: 4, edge: "iPlus", reversed: false },
    iPlus: { face: 1, edge: "jMinus", reversed: true },
    jMinus: { face: 3, edge: "iPlus", reversed: true },
    jPlus: { face: 0, edge: "jMinus", reversed: false },
  },
];

/** 면과 그 면 안의 칸 좌표 */
export interface FaceIJ {
  readonly face: Face;
  readonly i: number;
  readonly j: number;
}

/**
 * 면 밖으로 벗어난 칸 좌표를 맞닿은 면의 좌표로 옮긴다(면을 모서리에서 펼친 것처럼).
 * - 면 안쪽이면 그대로 돌려준다.
 * - 한 축만 벗어나면 그 가장자리 너머 면으로 옮긴다. 벗어난 깊이는 한 면 폭(2^level칸) 미만이어야 한다.
 * - 두 축이 모두 벗어나면(꼭짓점 쪽) 펼치는 방법이 하나로 정해지지 않아 null.
 */
export function wrapFaceIJ(face: Face, level: number, i: number, j: number): FaceIJ | null {
  const n = cellsPerSide(level);
  if (!isIntegerInRange(face, 0, 5)) throw new RangeError(`face must be 0..5: ${face}`);
  if (!isIntegerInRange(i, -n, 2 * n - 1) || !isIntegerInRange(j, -n, 2 * n - 1)) {
    throw new RangeError(`cell (${i}, ${j}) must be integers within one face width of level ${level}`);
  }
  const iInside = i >= 0 && i < n;
  const jInside = j >= 0 && j < n;
  if (iInside && jInside) return { face, i, j };
  if (!iInside && !jInside) return null;

  // 넘은 가장자리, 가장자리에서 몇 줄 너머인지(0 = 바로 맞닿은 줄), 가장자리를 따라가는 좌표
  let edge: FaceEdge;
  let depth: number;
  let along: number;
  if (!iInside) {
    edge = i < 0 ? "iMinus" : "iPlus";
    depth = i < 0 ? -1 - i : i - n;
    along = j;
  } else {
    edge = j < 0 ? "jMinus" : "jPlus";
    depth = j < 0 ? -1 - j : j - n;
    along = i;
  }
  const link = FACE_EDGE_LINKS[face][edge];
  // 들어간 가장자리에서 depth줄 안쪽, 가장자리를 따라가는 좌표는 t
  const t = link.reversed ? n - 1 - along : along;
  if (link.edge === "iMinus") return { face: link.face, i: depth, j: t };
  if (link.edge === "iPlus") return { face: link.face, i: n - 1 - depth, j: t };
  if (link.edge === "jMinus") return { face: link.face, i: t, j: depth };
  return { face: link.face, i: t, j: n - 1 - depth };
}
