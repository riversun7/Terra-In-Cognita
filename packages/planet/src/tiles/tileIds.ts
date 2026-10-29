// 1차맵 타일 나누기와 타일 ID — ADR 2026-10-29-s2-planet-lod(36) "타일"
// 1차맵 5단계(맵 레벨 F−4 ~ F)마다 면을 쿼드트리로 나눈다. 타일 하나 = 그 맵 레벨의 32×32칸이다.
// 타일 ID = 쿼드트리 칸(레벨 = 맵 레벨 − 5)의 셀 키(ADR 34). 지구 크기(F = 9)는 맵 레벨 5~9 = 깊이 0~4다.
//
// 면이 32칸보다 작은 맵 레벨(L < 5, 면 레벨 8 이하 행성에만 있다)은 면 전체가 타일 하나다.
// 이 타일의 ID는 그 맵 레벨 L의 (0, 0) 칸 키로 정한다. L ≥ 5 타일이 쓰는 키 레벨은 0 ~ F−5이고
// L < 5 타일은 F−4 ~ 4라서 한 행성 안에서 겹치지 않는다(F ≥ 9 행성에는 L < 5가 없어 ADR 규칙 그대로다).
// 정수 연산만 쓴다.
import { type CellKey, cellKey, cellKeyFromHilbert, decodeCellKey } from "../cellKey.ts";
import { FACES, type Face } from "../faces.ts";
import { cellsPerSide, isIntegerInRange, planetLevels } from "../levels.ts";

/** 타일 한 변의 칸 수(그 맵 레벨의 칸). 면이 이보다 작으면 면 전체가 타일 하나다 */
export const PLANET_TILE_CELLS = 32;
/** log2(PLANET_TILE_CELLS) — 타일 ID의 셀 키 레벨 = 맵 레벨 − 이 값 */
export const PLANET_TILE_LEVEL_OFFSET = 5;

/** 타일 하나가 덮는 곳 */
export interface PlanetTileId {
  /** 타일 ID(셀 키) */
  readonly key: CellKey;
  /** 이 타일 칸의 레벨(1차맵 단계) */
  readonly mapLevel: number;
  readonly face: Face;
  /** 첫 칸(맵 레벨 칸 좌표) */
  readonly i0: number;
  readonly j0: number;
  /** 한 변 칸 수 = min(32, 2^mapLevel) */
  readonly size: number;
}

/** 맵 레벨 `mapLevel` 타일의 한 변 칸 수 */
export function planetTileSize(mapLevel: number): number {
  return Math.min(PLANET_TILE_CELLS, cellsPerSide(mapLevel));
}

/** 행성의 1차맵 단계(거친 → 세밀) = F−4 ~ F */
export function planetMapLevels(faceLevel: number): readonly number[] {
  return planetLevels(faceLevel).primaryMapLevels;
}

/**
 * 맵 레벨 `mapLevel`에서 첫 칸이 (i0, j0)인 타일의 ID.
 * i0·j0는 타일 크기의 배수여야 한다(면이 32칸보다 작으면 0, 0).
 */
export function planetTileKey(mapLevel: number, face: Face, i0: number, j0: number): CellKey {
  const size = planetTileSize(mapLevel);
  const n = cellsPerSide(mapLevel);
  if (
    !isIntegerInRange(i0, 0, n - size) ||
    !isIntegerInRange(j0, 0, n - size) ||
    i0 % size !== 0 ||
    j0 % size !== 0
  ) {
    throw new RangeError(`(${i0}, ${j0}) is not the first cell of a level-${mapLevel} tile`);
  }
  if (mapLevel < PLANET_TILE_LEVEL_OFFSET) return cellKey(face, mapLevel, 0, 0);
  return cellKey(face, mapLevel - PLANET_TILE_LEVEL_OFFSET, i0 / size, j0 / size);
}

/** 맵 레벨 하나의 타일들 (면 순서, 면 안에서는 힐베르트 순서 = 키 오름차순) */
function tilesAtLevel(mapLevel: number): PlanetTileId[] {
  const size = planetTileSize(mapLevel);
  const result: PlanetTileId[] = [];
  if (mapLevel < PLANET_TILE_LEVEL_OFFSET) {
    for (const face of FACES)
      result.push({ key: cellKey(face, mapLevel, 0, 0), mapLevel, face, i0: 0, j0: 0, size });
    return result;
  }
  const keyLevel = mapLevel - PLANET_TILE_LEVEL_OFFSET;
  const count = cellsPerSide(keyLevel) * cellsPerSide(keyLevel);
  for (const face of FACES) {
    for (let h = 0; h < count; h++) {
      const key = cellKeyFromHilbert(face, keyLevel, h);
      const { i, j } = decodeCellKey(key);
      result.push({ key, mapLevel, face, i0: i * size, j0: j * size, size });
    }
  }
  return result;
}

/**
 * 행성의 모든 타일. 순서: 맵 레벨 오름차순(거친 것 먼저), 그 안에서 키 오름차순(면 → 힐베르트).
 * 처음 화면에 쓰는 거친 단계가 앞에 온다. 지구 크기(F = 9)는 2,046개다.
 */
export function planetTileIds(faceLevel: number): PlanetTileId[] {
  return planetMapLevels(faceLevel).flatMap((mapLevel) => tilesAtLevel(mapLevel));
}

/** 행성의 타일 수 */
export function planetTileCount(faceLevel: number): number {
  let count = 0;
  for (const mapLevel of planetMapLevels(faceLevel)) {
    const perSide = cellsPerSide(mapLevel) / planetTileSize(mapLevel);
    count += 6 * perSide * perSide;
  }
  return count;
}

/** 타일 ID → 덮는 곳. 이 행성의 타일 ID가 아니면 undefined */
export function planetTileIdFromKey(faceLevel: number, key: CellKey): PlanetTileId | undefined {
  const levels = planetMapLevels(faceLevel);
  const first = levels[0] ?? 0;
  const last = levels.at(-1) ?? 0;
  const { face, level, i, j } = decodeCellKey(key);
  const tiled = level + PLANET_TILE_LEVEL_OFFSET;
  if (tiled >= Math.max(first, PLANET_TILE_LEVEL_OFFSET) && tiled <= last) {
    return {
      key,
      mapLevel: tiled,
      face,
      i0: i * PLANET_TILE_CELLS,
      j0: j * PLANET_TILE_CELLS,
      size: PLANET_TILE_CELLS,
    };
  }
  // 면 전체 타일(L < 5): 그 맵 레벨의 (0, 0) 칸 키
  if (level >= first && level < PLANET_TILE_LEVEL_OFFSET && i === 0 && j === 0) {
    return { key, mapLevel: level, face, i0: 0, j0: 0, size: cellsPerSide(level) };
  }
  return undefined;
}
