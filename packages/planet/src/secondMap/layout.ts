// 2차맵 격자와 전역 좌표 — ADR 2026-10-31-second-map-from-planet(46) 2·3절. 정수 연산만 쓴다(판정 자료를 만드는 코드).
// - 2차맵 = 면 레벨 F 칸 하나. 지형 칸 128² = 레벨 F+7, 꼭짓점 129², 배치 칸 256² = 레벨 F+8(격자 계약, PLAN 5.2).
// - 2차맵 세계 축 = 면 격자 축(ADR 33 "2차맵 낮밤"): 열 x = 면 i 쪽, 행 z = 면 j가 작아지는 쪽(오른손 좌표).
//   그래서 꼭짓점 (열 c, 행 r)의 면 좌표는 (I, J) = (i·128 + c, j·128 + 128 − r)이다(레벨 F+7).
// - 정육면체 점(cube point): 면 f 레벨 L 꼭짓점 (I, J)의 정수 3D 좌표 Q = N·법선 + (2I − N)·u축 + (2J − N)·v축 (N = 2^L).
//   면 칸 좌표(s, t)를 그대로 쓴 정육면체 위 점이라 면 경계·정육면체 꼭짓점을 나누는 면들이 같은 Q를 낸다
//   (탄젠트 투영은 축마다 같은 단조 함수라 s 좌표 정육면체에서 맞닿는 점이 구에서도 같은 점이다, projection.ts).
//   노이즈 격자점의 정본 열쇠로 쓴다: 어느 면에서 계산해도 같은 격자점은 같은 값이다.
import { type CellKey, decodeCellKey, isCellKey } from "../cellKey.ts";
import { FACE_FRAMES, type Face, wrapFaceIJ } from "../faces.ts";
import { PLACEMENT_SUBLEVELS, TERRAIN_SUBLEVELS, cellsPerSide, pow2 } from "../levels.ts";

/** 지형 칸 한 변(128), 꼭짓점 한 변(129), 배치 칸 한 변(256) */
export const SM_TERRAIN = 1 << TERRAIN_SUBLEVELS;
export const SM_VERTICES = SM_TERRAIN + 1;
export const SM_PLACEMENT = 1 << PLACEMENT_SUBLEVELS;

/** 2차맵 하나의 면 위 자리 */
export interface MapCoords {
  readonly key: CellKey;
  readonly face: Face;
  /** 면 레벨 F(2차맵 키의 레벨) */
  readonly faceLevel: number;
  readonly i: number;
  readonly j: number;
  /** 면 한 변 칸 수 2^F */
  readonly n: number;
}

/** 2차맵 키 → 면 위 자리. 셀 키가 아니면 RangeError */
export function mapCoords(mapKey: number): MapCoords {
  if (!isCellKey(mapKey)) throw new RangeError(`map key must be a cell key: ${mapKey}`);
  const { face, level, i, j } = decodeCellKey(mapKey);
  return { key: mapKey, face, faceLevel: level, i, j, n: cellsPerSide(level) };
}

/** 꼭짓점 (열 c, 행 r)의 면 좌표 I(레벨 F+7) */
export const vertexI = (map: MapCoords, c: number): number => map.i * SM_TERRAIN + c;
/** 꼭짓점 (열 c, 행 r)의 면 좌표 J(레벨 F+7). 행이 커지면 J가 작아진다 */
export const vertexJ = (map: MapCoords, r: number): number => map.j * SM_TERRAIN + SM_TERRAIN - r;

/**
 * 면 face 레벨 level의 꼭짓점 (I, J)(0 ≤ I, J ≤ 2^level)의 정육면체 점. 같은 점을 나누는 면들이 같은 값을 낸다(시험).
 * 성분은 −2^level ~ 2^level 정수다.
 */
export function cubePoint(face: Face, level: number, I: number, J: number): [number, number, number] {
  const N = pow2(level);
  const { normal: n, uAxis: a, vAxis: b } = FACE_FRAMES[face];
  const u = 2 * I - N;
  const v = 2 * J - N;
  return [N * n[0] + u * a[0] + v * b[0], N * n[1] + u * a[1] + v * b[1], N * n[2] + u * a[2] + v * b[2]];
}

/**
 * 정수 나눗셈 내림(b > 0) — 음수에서도 바닥 쪽. |a| < 2^53인 정수면 Math.floor(a / b)가 정확하다:
 * 참 몫이 정수가 아니면 가장 가까운 정수까지 1/b 이상 떨어져 있고, 나눗셈 반올림 오차는 |a / b| × 2^−53 < 1/b라 넘지 않는다.
 * 참 몫이 정수면 나눗셈이 정확하다. (나머지 연산 두 번보다 빠르다, 시험이 나머지 식과 비교한다)
 */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** 면 레벨 F 칸 (face, i, j)의 행성 값 배열 번호(면 × n² + j × n + i). 칸이 없으면 −1 */
export function cellIndexAt(face: Face, faceLevel: number, i: number, j: number): number {
  const n = cellsPerSide(faceLevel);
  const target = wrapFaceIJ(face, faceLevel, i, j);
  return target ? target.face * n * n + target.j * n + target.i : -1;
}

/**
 * 2차맵 둘레 3×3 칸(이 2차맵의 면 틀에서 (di, dj) ∈ {−1, 0, 1}²)의 행성 값 배열 번호. 순서 = (dj + 1) × 3 + (di + 1).
 * 정육면체 꼭짓점 쪽 대각선은 칸이 없어 −1이다. 면 경계를 넘은 칸은 이웃 면 칸이다(이 2차맵 틀로 펼친 자리).
 */
export function neighbourhood(map: MapCoords): Int32Array {
  const out = new Int32Array(9);
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      out[(dj + 1) * 3 + (di + 1)] = cellIndexAt(map.face, map.faceLevel, map.i + di, map.j + dj);
    }
  }
  return out;
}
