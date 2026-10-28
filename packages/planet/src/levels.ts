// 격자 단계(레벨) — ADR 2026-10-28-planet-grid-contract
// 레벨 L의 면 하나는 2^L × 2^L 칸이다. 레벨 0 = 면 하나 전체, 레벨이 1 오르면 칸 하나가 2×2로 나뉜다.
// 정수 연산만 쓴다(판정 보조 코드에서 써도 된다).

/**
 * 셀 키에 담을 수 있는 가장 깊은 레벨.
 * 키 = 면 3비트 + 힐베르트 위치 2×22비트 + 레벨 5비트 = 52비트라 JS 안전 정수(53비트) 안에 들어간다.
 * 레벨 23은 54비트가 되어 넘친다.
 */
export const MAX_LEVEL = 22;

// 2의 거듭제곱 표: 곱셈으로만 만들어 정확하다(2^53까지 실수로 정확히 표현된다)
const POW2_TABLE: number[] = [];
for (let k = 0, value = 1; k <= 53; k++, value *= 2) POW2_TABLE.push(value);

/** 2^k (0 ≤ k ≤ 53, 정확한 값). 32비트 시프트로 못 만드는 큰 값에 쓴다 */
export function pow2(k: number): number {
  const value = POW2_TABLE[k];
  if (value === undefined) throw new RangeError(`2^k is only tabled for integer k in [0, 53]: ${k}`);
  return value;
}

/** 정수이고 [min, max] 안인지. 타입을 좁히지 않는다(검사에 실패한 값을 오류 문구에 그대로 쓰려고) */
export function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function isLevel(value: unknown): value is number {
  return typeof value === "number" && isIntegerInRange(value, 0, MAX_LEVEL);
}

export function assertLevel(level: number): void {
  if (!isIntegerInRange(level, 0, MAX_LEVEL)) {
    throw new RangeError(`level must be an integer in [0, ${MAX_LEVEL}]: ${level}`);
  }
}

/** 레벨 `level`에서 면 한 변의 칸 수 = 2^level */
export function cellsPerSide(level: number): number {
  assertLevel(level);
  // level ≤ 22라 32비트 시프트로 정확하다
  return 1 << level;
}

// ── 행성 크기와 맵 단계 (ADR 격자 표) ──
// 행성 크기는 "면 레벨" F로 정한다: 1차맵 최소 칸(= 2차맵 하나)의 레벨이 F다.
// 1차맵은 F-4 ~ F의 5단계, 2차맵 지형은 F+7(최소 칸 하나 = 128×128), 배치는 F+8(256×256).

/** 지구 기본 면 레벨: 면당 512 × 512칸 (축척 약 1:12, 반지름 약 531km) */
export const EARTH_FACE_LEVEL = 9;
/** 1차맵 확대 단계 수 (지구: 면당 32 → 64 → 128 → 256 → 512칸) */
export const PRIMARY_MAP_LEVEL_COUNT = 5;
/** 1차맵 최소 칸 하나를 2차맵 지형 칸으로 나누는 단계 수: 2^7 = 128 */
export const TERRAIN_SUBLEVELS = 7;
/** 1차맵 최소 칸 하나를 2차맵 배치 칸으로 나누는 단계 수: 2^8 = 256 */
export const PLACEMENT_SUBLEVELS = 8;
/** 2차맵 한 변의 지형 칸 수 */
export const TERRAIN_CELLS_PER_SIDE = 1 << TERRAIN_SUBLEVELS;
/** 2차맵 한 변의 배치 칸 수 */
export const PLACEMENT_CELLS_PER_SIDE = 1 << PLACEMENT_SUBLEVELS;
/** 가장 작은 면 레벨: 1차맵 5단계의 가장 거친 단계가 레벨 0 */
export const MIN_FACE_LEVEL = PRIMARY_MAP_LEVEL_COUNT - 1;
/** 가장 큰 면 레벨: 배치 칸 레벨이 MAX_LEVEL 안에 들어가야 한다 */
export const MAX_FACE_LEVEL = MAX_LEVEL - PLACEMENT_SUBLEVELS;

/** 행성 하나가 쓰는 레벨들 */
export interface PlanetLevels {
  /** 면 레벨 = 1차맵 최소 칸 레벨 (2차맵 하나 = 이 레벨 칸 하나) */
  readonly faceLevel: number;
  /** 1차맵 단계 (거친 단계 → 세밀한 단계) */
  readonly primaryMapLevels: readonly number[];
  /** 2차맵 지형 칸 레벨 */
  readonly terrainLevel: number;
  /** 2차맵 배치 칸 레벨 (건물 배치·충돌·경로탐색) */
  readonly placementLevel: number;
}

export function isFaceLevel(value: unknown): value is number {
  return typeof value === "number" && isIntegerInRange(value, MIN_FACE_LEVEL, MAX_FACE_LEVEL);
}

export function assertFaceLevel(faceLevel: number): void {
  if (!isIntegerInRange(faceLevel, MIN_FACE_LEVEL, MAX_FACE_LEVEL)) {
    throw new RangeError(
      `face level must be an integer in [${MIN_FACE_LEVEL}, ${MAX_FACE_LEVEL}]: ${faceLevel}`,
    );
  }
}

/** 면 레벨 `faceLevel`인 행성의 1차맵·지형·배치 레벨 */
export function planetLevels(faceLevel: number): PlanetLevels {
  assertFaceLevel(faceLevel);
  const primaryMapLevels: number[] = [];
  for (let step = PRIMARY_MAP_LEVEL_COUNT - 1; step >= 0; step--) primaryMapLevels.push(faceLevel - step);
  return {
    faceLevel,
    primaryMapLevels,
    terrainLevel: faceLevel + TERRAIN_SUBLEVELS,
    placementLevel: faceLevel + PLACEMENT_SUBLEVELS,
  };
}
