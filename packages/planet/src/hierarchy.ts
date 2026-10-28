// 셀 계층: 부모·자식·조상, 키 구간, 하위 칸 좌표 — 정수 연산만 쓴다.
// 레벨이 1 깊어지면 칸 하나가 2×2로 나뉜다. 2차맵 지형(128×128)·배치(256×256) 칸도 같은 계층의 하위 칸이다.
import { type CellKey, brandCellKey, cellKey, cellLevel, cellSpan, decodeCellKey } from "./cellKey.ts";
import { MAX_LEVEL, isIntegerInRange } from "./levels.ts";

/** 바로 위 레벨 칸. 레벨 0(면 하나)은 부모가 없어 RangeError */
export function parentKey(key: CellKey): CellKey {
  const level = cellLevel(key);
  if (level === 0) throw new RangeError("a level-0 cell (a whole face) has no parent");
  return ancestorKey(key, level - 1);
}

/** 레벨 `level`(0 ≤ level ≤ 이 칸의 레벨)에서 이 칸을 품은 칸 */
export function ancestorKey(key: CellKey, level: number): CellKey {
  const own = cellLevel(key);
  if (!isIntegerInRange(level, 0, own)) {
    throw new RangeError(`ancestor level must be an integer in [0, ${own}]: ${level}`);
  }
  // 레벨 필드를 뺀 면 + 위치에서 조상 칸 단위 아래를 지운다 (면 구간 2^49는 모든 칸 단위의 배수)
  const base = key - own;
  return brandCellKey(base - (base % cellSpan(level)) + level);
}

/** 자식 4칸 (힐베르트 순서). 최대 레벨 칸은 자식이 없어 RangeError */
export function childKeys(key: CellKey): readonly [CellKey, CellKey, CellKey, CellKey] {
  const level = cellLevel(key);
  if (level >= MAX_LEVEL) throw new RangeError(`a level-${MAX_LEVEL} cell has no children`);
  const base = key - level;
  const span = cellSpan(level + 1);
  const childLevel = level + 1;
  return [
    brandCellKey(base + childLevel),
    brandCellKey(base + span + childLevel),
    brandCellKey(base + 2 * span + childLevel),
    brandCellKey(base + 3 * span + childLevel),
  ];
}

/** 키 구간 [min, max] (양 끝 포함) */
export interface CellKeyRange {
  readonly min: number;
  readonly max: number;
}

/**
 * 이 칸과 그 모든 하위 칸(레벨 무관)이 들어가는 키 구간. 다른 칸의 키는 들어가지 않는다.
 * 지역 하나의 상태를 `WHERE cell_key BETWEEN min AND max`로 고를 때 쓴다. max는 키가 아닐 수 있다.
 */
export function cellKeyRange(key: CellKey): CellKeyRange {
  const level = cellLevel(key);
  return { min: key, max: key - level + cellSpan(level) - 1 };
}

/** `key`가 `ancestor` 자신이거나 그 하위 칸인지 */
export function containsCell(ancestor: CellKey, key: CellKey): boolean {
  const { min, max } = cellKeyRange(ancestor);
  return key >= min && key <= max;
}

/**
 * 이 칸을 `depth`레벨 더 나눈 칸 중 (x, y)번째 (0 ≤ x, y < 2^depth).
 * x·y 축은 이 칸이 있는 면의 i·j 축이다(면마다 방향이 다르다 — 이웃 면으로 넘어갈 때는 wrapFaceIJ).
 * 예: 1차맵 최소 칸(레벨 F)의 지형 칸 = descendantAt(칸, TERRAIN_SUBLEVELS, x, y)
 */
export function descendantAt(key: CellKey, depth: number, x: number, y: number): CellKey {
  const { face, level, i, j } = decodeCellKey(key);
  if (!isIntegerInRange(depth, 0, MAX_LEVEL - level)) {
    throw new RangeError(`depth must be an integer in [0, ${MAX_LEVEL - level}]: ${depth}`);
  }
  const size = 1 << depth;
  if (!isIntegerInRange(x, 0, size - 1) || !isIntegerInRange(y, 0, size - 1)) {
    throw new RangeError(`sub-cell (${x}, ${y}) is outside ${size} × ${size}`);
  }
  return cellKey(face, level + depth, i * size + x, j * size + y);
}

/** 레벨 `ancestorLevel`의 조상 칸과 그 안에서 이 칸의 위치 (descendantAt의 반대) */
export function offsetInAncestor(
  key: CellKey,
  ancestorLevel: number,
): { readonly ancestor: CellKey; readonly x: number; readonly y: number } {
  const { face, level, i, j } = decodeCellKey(key);
  if (!isIntegerInRange(ancestorLevel, 0, level)) {
    throw new RangeError(`ancestor level must be an integer in [0, ${level}]: ${ancestorLevel}`);
  }
  const depth = level - ancestorLevel;
  const mask = (1 << depth) - 1;
  return { ancestor: cellKey(face, ancestorLevel, i >> depth, j >> depth), x: i & mask, y: j & mask };
}
