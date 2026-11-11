// 2차맵 지형 입력 형식 — 엔진이 받는 모양. 서버 이진 형식(ADR 2026-10-28-s1-second-map)은 나중에 이 모양으로 바꿔 넣는다.
// 좌표: 세계 단위는 m. x = 열 방향(동쪽), z = 행 방향(남쪽), y = 높이. 2차맵 왼쪽 위 꼭짓점이 (0, 0)이다.
// 격자(격자 ADR): 지형 128×128칸(높이는 꼭짓점 129×129), 배치 256×256칸(지형 칸 하나 = 배치 2×2칸).

/** 지형 칸 수(한 변) */
export const TERRAIN_CELLS = 128;
/** 높이 꼭짓점 수(한 변) */
export const TERRAIN_VERTICES = TERRAIN_CELLS + 1;
/** 배치 칸 수(한 변) — 건물 배치·경로탐색·유닛 좌표의 단위 */
export const PLACEMENT_CELLS = 256;
/** 지형 칸 하나에 든 배치 칸 수(한 변) */
export const PLACEMENT_PER_TERRAIN = PLACEMENT_CELLS / TERRAIN_CELLS;
/** 높이 값 1이 나타내는 길이(m) — 높이는 데시미터(0.1m) 정수 */
export const HEIGHT_UNIT_M = 0.1;
/** 꼭짓점 물 높이에서 "물 없음" 값(int16 가장 작은 값) */
export const NO_WATER_UNITS = -32_768;

/**
 * 지표 종류 코드(칸마다 1바이트). 모르는 코드는 회색으로 그린다(서버가 더 새 코드를 보낼 수 있다).
 * enum을 쓰지 않는다: 값 목록 객체 + 타입
 */
export const SURFACE = {
  water: 0,
  grass: 1,
  dirt: 2,
  rock: 3,
  sand: 4,
  gravel: 5,
  snow: 6,
  ice: 7,
  mud: 8,
  ash: 9,
  shallowWater: 10,
} as const;
export type SurfaceCode = (typeof SURFACE)[keyof typeof SURFACE];

export interface TerrainInput {
  /** 꼭짓점 높이 129×129, 행 우선(index = 행 × 129 + 열). 단위 0.1m, baseHeightM 기준 */
  heights: Int16Array;
  /** 칸 지표 128×128, 행 우선(index = 행 × 128 + 열). SURFACE 코드 */
  surface: Uint8Array;
  /** heights 값 0이 가리키는 높이(m). 바다 높이가 0m다. int16 범위(±3,276.7m)를 넘는 땅도 담게 기준을 둔다 */
  baseHeightM: number;
  /** 지형 칸 한 변(m, 표시용). 위치에 따라 약 ±10% 다르다(평균 약 11.7m) */
  cellSizeM: number;
  /** 물 높이(m). 이보다 낮은 땅 위에 물 판을 그린다(waterLevels가 없을 때) */
  waterLevelM: number;
  /**
   * 꼭짓점 물 높이 129×129(0.1m, baseHeightM 기준, 물 없음 = NO_WATER_UNITS). 있으면 물 판 대신 이 높이로 물 면을 그린다
   * (강·호수 수면이 해수면과 다르다, 행성 값에서 만든 2차맵 = 지형 파일 TCTR 2판)
   */
  waterLevels?: Int16Array | undefined;
  /**
   * 배치 칸 256² 소품 그림 번호(@terra/shared MAP_PROP_ARTS)와 엄폐 값(0·1·2). 있으면 가까이 소품 모델을 세우고,
   * 멀리서는 땅 색에 소품 색을 섞는다(TCTR 2판, ADR 2026-10-31-second-map-from-planet U5)
   */
  art?: Uint8Array | undefined;
  cover?: Uint8Array | undefined;
}

/** 입력이 모양에 맞는지 — 맞지 않으면 무엇이 틀렸는지 문장을 돌려준다(없으면 null) */
export function terrainProblem(input: TerrainInput): string | null {
  const vertices = TERRAIN_VERTICES * TERRAIN_VERTICES;
  const cells = TERRAIN_CELLS * TERRAIN_CELLS;
  if (!(input.heights instanceof Int16Array) || input.heights.length !== vertices) {
    return `heights must be Int16Array(${vertices})`;
  }
  if (!(input.surface instanceof Uint8Array) || input.surface.length !== cells) {
    return `surface must be Uint8Array(${cells})`;
  }
  if (!Number.isFinite(input.cellSizeM) || input.cellSizeM <= 0) return "cellSizeM must be > 0";
  if (!Number.isFinite(input.baseHeightM)) return "baseHeightM must be finite";
  if (!Number.isFinite(input.waterLevelM)) return "waterLevelM must be finite";
  if (
    input.waterLevels !== undefined &&
    (!(input.waterLevels instanceof Int16Array) || input.waterLevels.length !== vertices)
  ) {
    return `waterLevels must be Int16Array(${vertices})`;
  }
  const placement = PLACEMENT_CELLS * PLACEMENT_CELLS;
  for (const [name, layer] of [
    ["art", input.art],
    ["cover", input.cover],
  ] as const) {
    if (layer !== undefined && (!(layer instanceof Uint8Array) || layer.length !== placement)) {
      return `${name} must be Uint8Array(${placement})`;
    }
  }
  return null;
}

/** 2차맵 한 변의 길이(m) */
export function mapSizeM(input: Pick<TerrainInput, "cellSizeM">): number {
  return TERRAIN_CELLS * input.cellSizeM;
}

/** 배치 칸 한 변(m) */
export function placementCellM(input: Pick<TerrainInput, "cellSizeM">): number {
  return input.cellSizeM / PLACEMENT_PER_TERRAIN;
}

/** 땅 높이 범위(m) — 꼭짓점 높이의 가장 낮은 값·높은 값(누르기의 시선 ∩ 땅 범위) */
export function heightRangeM(input: Pick<TerrainInput, "heights" | "baseHeightM">): {
  minHeightM: number;
  maxHeightM: number;
} {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const value of input.heights) {
    if (value < low) low = value;
    if (value > high) high = value;
  }
  if (low > high) return { minHeightM: input.baseHeightM, maxHeightM: input.baseHeightM };
  return {
    minHeightM: input.baseHeightM + low * HEIGHT_UNIT_M,
    maxHeightM: input.baseHeightM + high * HEIGHT_UNIT_M,
  };
}

/** 꼭짓점 (열, 행)의 높이(m). 범위 밖은 가장자리 값 */
export function vertexHeightM(input: TerrainInput, col: number, row: number): number {
  const c = Math.min(TERRAIN_VERTICES - 1, Math.max(0, col));
  const r = Math.min(TERRAIN_VERTICES - 1, Math.max(0, row));
  return input.baseHeightM + (input.heights[r * TERRAIN_VERTICES + c] ?? 0) * HEIGHT_UNIT_M;
}

/**
 * 세계 좌표 (x, z)의 땅 높이(m). 지형 메시와 같은 삼각형으로 나눠 계산한다 — 유닛·건물이 그린 땅 위에 정확히 선다.
 * 칸은 왼쪽 위(a)에서 오른쪽 아래(d)로 가르는 대각선으로 나눈다(terrainMesh.ts의 인덱스 순서와 같다).
 * 2차맵 밖은 가장자리 높이로 본다.
 */
export function sampleHeightM(input: TerrainInput, x: number, z: number): number {
  const u = Math.min(TERRAIN_CELLS, Math.max(0, x / input.cellSizeM));
  const v = Math.min(TERRAIN_CELLS, Math.max(0, z / input.cellSizeM));
  const col = Math.min(TERRAIN_CELLS - 1, Math.floor(u));
  const row = Math.min(TERRAIN_CELLS - 1, Math.floor(v));
  const fu = u - col;
  const fv = v - row;
  const a = vertexHeightM(input, col, row);
  const b = vertexHeightM(input, col + 1, row);
  const c = vertexHeightM(input, col, row + 1);
  const d = vertexHeightM(input, col + 1, row + 1);
  // 대각선 a–d 위쪽(오른쪽 위) 삼각형 a·d·b, 아래쪽(왼쪽 아래) 삼각형 a·c·d
  if (fu >= fv) return a + fu * (b - a) + fv * (d - b);
  return a + fv * (c - a) + fu * (d - c);
}

/** 세계 좌표가 가리키는 지형 칸의 지표 코드. 2차맵 밖이면 -1 */
export function surfaceAt(input: TerrainInput, x: number, z: number): number {
  const col = Math.floor(x / input.cellSizeM);
  const row = Math.floor(z / input.cellSizeM);
  if (col < 0 || row < 0 || col >= TERRAIN_CELLS || row >= TERRAIN_CELLS) return -1;
  return input.surface[row * TERRAIN_CELLS + col] ?? -1;
}
