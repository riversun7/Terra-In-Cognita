// 칸 이웃 (4이웃·8이웃) — 면 안과 면 경계를 넘는 경우 모두. 정수 연산만 쓴다.
// 면 경계는 faces.ts의 변환표(wrapFaceIJ)로 넘는다.
// 정육면체 꼭짓점 8곳에는 칸이 3개만 모인다. 그래서 꼭짓점에 닿은 칸(레벨 1 이상, 꼭짓점마다 3칸)은
// 꼭짓점 쪽 대각선 칸이 없고 8이웃이 7칸이다. 레벨 0(면 하나)의 8이웃은 맞닿은 면 4개다.
import { type CellKey, cellKey, decodeCellKey } from "./cellKey.ts";
import { wrapFaceIJ } from "./faces.ts";

/** 4이웃 방향 (di, dj): i-1, i+1, j-1, j+1 */
const STEPS_4: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** 8이웃 방향 (di, dj): j-1 줄, 같은 줄, j+1 줄 순서로 i-1 → i+1 */
const STEPS_8: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * 한 칸 옆 칸 (di, dj ∈ {-1, 0, 1}, 둘 다 0은 안 됨). 면 경계를 넘으면 이웃 면의 칸이다.
 * 꼭짓점 칸에서 꼭짓점 쪽 대각선(두 축이 모두 면을 벗어남)은 칸이 없어 null.
 */
export function stepCell(key: CellKey, di: number, dj: number): CellKey | null {
  if (!isUnit(di) || !isUnit(dj) || (di === 0 && dj === 0)) {
    throw new RangeError(`step must be one cell (di, dj in -1..1, not both 0): (${di}, ${dj})`);
  }
  const { face, level, i, j } = decodeCellKey(key);
  const target = wrapFaceIJ(face, level, i + di, j + dj);
  return target ? cellKey(target.face, level, target.i, target.j) : null;
}

/** 변을 공유하는 4칸. 순서: i-1, i+1, j-1, j+1 방향 (면을 넘으면 그 방향으로 넘어간 칸) */
export function neighbors4(key: CellKey): CellKey[] {
  return collect(key, STEPS_4);
}

/**
 * 꼭짓점을 하나라도 공유하는 칸 (4이웃 포함). 보통 8칸, 정육면체 꼭짓점에 닿은 칸은 7칸, 레벨 0은 4칸.
 * 순서는 방향 (-1,-1), (0,-1), (1,-1), (-1,0), (1,0), (-1,1), (0,1), (1,1)에서 없는 칸을 뺀 것이다.
 * 방향이 필요하면(대각선 비용 등) stepCell을 쓴다.
 */
export function neighbors8(key: CellKey): CellKey[] {
  return collect(key, STEPS_8);
}

function collect(key: CellKey, steps: readonly (readonly [number, number])[]): CellKey[] {
  const { face, level, i, j } = decodeCellKey(key);
  const result: CellKey[] = [];
  for (const [di, dj] of steps) {
    const target = wrapFaceIJ(face, level, i + di, j + dj);
    if (target) result.push(cellKey(target.face, level, target.i, target.j));
  }
  return result;
}

function isUnit(value: number): boolean {
  return value === -1 || value === 0 || value === 1;
}
