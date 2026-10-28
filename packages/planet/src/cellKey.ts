// 셀 키 — ADR 2026-10-28-planet-grid-contract "ID: 행성 ID + 셀 키(면 3비트 + 레벨 5비트 + 힐베르트 순서), 53비트 안"
// 정수 연산만 쓴다(판정 보조 코드에서 써도 된다). BigInt를 쓰지 않는다.
//
// 비트 배치 (위 → 아래, 52비트):
//   [면 3비트][힐베르트 위치 44비트][레벨 5비트]
//   키 = 면 × 2^49 + 힐베르트 번호 × 2^(49 - 2·레벨) + 레벨
// - 힐베르트 위치는 번호를 44비트 왼쪽에 맞춘 값이다(번호 × 4^(22 - 레벨)). 그래서
//   1) 같은 레벨은 키 순서 = 면 순서 다음 힐베르트 순서다.
//   2) 한 칸과 그 모든 하위 칸(어느 레벨이든)이 연속한 키 구간 하나에 들어간다(cellKeyRange).
//      지역 하나의 상태를 레벨이 섞인 표에서도 `BETWEEN min AND max` 한 번으로 고른다.
// - 행성 ID는 키에 넣지 않는다. 전체 ID = (행성 ID, 셀 키) 쌍이다(DB 복합 키).
//   최대 레벨 22가 52비트를 쓰므로 키에 행성 ID를 담을 자리가 없다.
// - 키는 2^52 미만이라 DB int8 열을 JS number로 읽어도 정확하다(Drizzle bigint mode "number").
// - 53비트 정수는 32비트 비트 연산을 못 쓰므로 2의 거듭제곱 곱셈·나눗셈과 나머지로 나눈다.
//   값이 모두 2^53 미만 정수이고 2의 거듭제곱 나눗셈은 IEEE 754에서 정확해서 결과는 정수 연산과 같다.
import { FACES, type Face, type FaceIJ } from "./faces.ts";
import { hilbertToIJ, ijToHilbert } from "./hilbert.ts";
import { MAX_LEVEL, assertLevel, cellsPerSide, isIntegerInRange, pow2 } from "./levels.ts";

declare const cellKeyBrand: unique symbol;

/** 셀 키: 면 + 힐베르트 위치 + 레벨을 담은 52비트 정수 (JS 안전 정수). isCellKey·parseCellKey로 검사한다 */
export type CellKey = number & { readonly [cellKeyBrand]: true };

/** 셀 키를 푼 값 */
export interface CellCoords extends FaceIJ {
  readonly level: number;
}

/** 레벨 필드 = 아래 5비트 */
const LEVEL_FIELD = 32;
/** 면 하나가 차지하는 키 구간 = 2^49 */
const FACE_SPAN = pow2(49);
/** 면 6개가 쓰는 키 구간의 끝(이 값 미만) */
const KEY_LIMIT = 6 * FACE_SPAN;

/** 레벨 `level` 칸 하나가 차지하는 키 구간 = 2^(49 - 2·level) (패키지 안에서만 쓴다) */
export function cellSpan(level: number): number {
  return pow2(49 - 2 * level);
}

/** 가장 큰 셀 키 (면 5, 레벨 22, 마지막 힐베르트 번호) = 6 × 2^49 - 10 */
export const MAX_CELL_KEY = KEY_LIMIT - LEVEL_FIELD + MAX_LEVEL;

/** 범위를 확인한 숫자를 셀 키 타입으로 바꾼다. 브랜드 타입은 이 함수에서만 만든다(패키지 안에서만 쓴다) */
export function brandCellKey(value: number): CellKey {
  // 브랜드 타입(숫자에 붙인 표식)은 단언 없이 만들 수 없다. 값의 범위는 부르는 쪽이 이미 확인했다
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as CellKey;
}

function assertFace(face: number): void {
  if (!isIntegerInRange(face, 0, 5)) throw new RangeError(`face must be an integer in [0, 5]: ${face}`);
}

/** 키 값의 면 (면 0~5 밖이면 키가 아니므로 RangeError) */
function faceOf(key: number): Face {
  const face = FACES[Math.floor(key / FACE_SPAN)];
  if (face === undefined) throw new RangeError(`not a cell key: ${key}`);
  return face;
}

/** 칸 (face, level, i, j)의 셀 키 */
export function cellKey(face: Face, level: number, i: number, j: number): CellKey {
  assertFace(face);
  const n = cellsPerSide(level);
  if (!isIntegerInRange(i, 0, n - 1) || !isIntegerInRange(j, 0, n - 1)) {
    throw new RangeError(`cell (${i}, ${j}) is outside level ${level} face (${n} × ${n})`);
  }
  return brandCellKey(face * FACE_SPAN + ijToHilbert(face, level, i, j) * cellSpan(level) + level);
}

/** 면 `face`, 레벨 `level`의 `hilbert`번째 칸의 셀 키 */
export function cellKeyFromHilbert(face: Face, level: number, hilbert: number): CellKey {
  assertFace(face);
  assertLevel(level);
  if (!isIntegerInRange(hilbert, 0, pow2(2 * level) - 1)) {
    throw new RangeError(`hilbert index must be an integer in [0, 4^${level}): ${hilbert}`);
  }
  return brandCellKey(face * FACE_SPAN + hilbert * cellSpan(level) + level);
}

/** 셀 키의 레벨 */
export function cellLevel(key: CellKey): number {
  return key % LEVEL_FIELD;
}

/** 셀 키의 면 */
export function cellFace(key: CellKey): Face {
  return faceOf(key);
}

/** 셀 키의 힐베르트 번호 (0 ≤ 번호 < 4^레벨) */
export function hilbertIndex(key: CellKey): number {
  const level = key % LEVEL_FIELD;
  return (key - level - faceOf(key) * FACE_SPAN) / cellSpan(level);
}

/** 셀 키 → 칸 좌표 */
export function decodeCellKey(key: CellKey): CellCoords {
  const level = key % LEVEL_FIELD;
  const face = faceOf(key);
  const { i, j } = hilbertToIJ(face, level, (key - level - face * FACE_SPAN) / cellSpan(level));
  return { face, level, i, j };
}

/** 셀 키가 될 수 있는 값인지 (안전 정수, 면 0~5, 레벨 0~22, 힐베르트 위치가 레벨 칸 단위에 맞음) */
export function isCellKey(value: unknown): value is CellKey {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= KEY_LIMIT) {
    return false;
  }
  const level = value % LEVEL_FIELD;
  if (level > MAX_LEVEL) return false;
  return (value - level) % cellSpan(level) === 0;
}

/** DB·전송에서 받은 숫자를 셀 키로 확인한다. 틀리면 RangeError */
export function parseCellKey(value: number): CellKey {
  if (!isCellKey(value)) throw new RangeError(`not a cell key: ${value}`);
  return value;
}
