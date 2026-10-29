// 타일 만들기 — 생성기 출력(PlanetFields) → 1차맵 타일(ADR 2026-10-29-s2-planet-lod(36) "타일")
// 타일 하나 = 맵 레벨 L의 size×size칸(size = min(32, 2^L)) + 꼭짓점 높이 (size+1)².
// 이진 형식(머리·바이트 배치)은 packages/protocol planetTile.ts다. 이 파일은 값만 만든다(이 묶음은 protocol을 모른다).
// 숨김 정보(자원·크리쳐)는 넣지 않는다(ADR 26). 정수 연산만 쓰고 결과는 입력이 같으면 늘 같다.
import type { Face } from "../faces.ts";
import { type PlanetLevel, aggregatePlanetLevels } from "./aggregate.ts";
import { planetCornerHeights } from "./cornerHeights.ts";
import type { PlanetFields } from "./fields.ts";
import { type PlanetTileId, planetTileIds } from "./tileIds.ts";

/**
 * 타일 값 — 렌더러가 받는 모양(이름을 바꾸지 않는다. packages/protocol PlanetTileData와 같은 필드).
 * 배열은 모두 행 우선(j 다음 i)이다.
 */
export interface PlanetTile {
  readonly faceLevel: number;
  readonly mapLevel: number;
  readonly face: Face;
  /** 첫 칸(맵 레벨 칸 좌표) */
  readonly i0: number;
  readonly j0: number;
  /** 한 변 칸 수 */
  readonly size: number;
  /**
   * 꼭짓점 높이(게임 m) (size+1)², index = cj × (size+1) + ci.
   * 꼭짓점 (ci, cj) = 그 면의 st 점 ((i0+ci)/2^mapLevel, (j0+cj)/2^mapLevel).
   */
  readonly heightsM: Int16Array;
  /** 칸 값 size², index = j × size + i */
  readonly biome: Uint8Array;
  readonly water: Uint8Array;
  readonly temperatureC: Int8Array;
  readonly humidity: Uint8Array;
  readonly forest: Uint8Array;
  readonly river: Uint8Array;
}

/** 맵 레벨 하나의 값 + 꼭짓점 높이 → 타일 하나 */
export function buildPlanetTile(
  faceLevel: number,
  level: PlanetLevel,
  corners: Int16Array,
  id: PlanetTileId,
): PlanetTile {
  if (level.level !== id.mapLevel) {
    throw new RangeError(`tile is on map level ${id.mapLevel}, values are for level ${level.level}`);
  }
  const { n } = level;
  const m = n + 1;
  const { size, face, i0, j0 } = id;
  const heightsM = new Int16Array((size + 1) * (size + 1));
  for (let cj = 0; cj <= size; cj++) {
    const from = face * m * m + (j0 + cj) * m + i0;
    heightsM.set(corners.subarray(from, from + size + 1), cj * (size + 1));
  }
  const cells = size * size;
  const biome = new Uint8Array(cells);
  const water = new Uint8Array(cells);
  const temperatureC = new Int8Array(cells);
  const humidity = new Uint8Array(cells);
  const forest = new Uint8Array(cells);
  const river = new Uint8Array(cells);
  for (let j = 0; j < size; j++) {
    const from = face * n * n + (j0 + j) * n + i0;
    const to = from + size;
    const at = j * size;
    biome.set(level.biome.subarray(from, to), at);
    water.set(level.water.subarray(from, to), at);
    temperatureC.set(level.temperatureC.subarray(from, to), at);
    humidity.set(level.humidity.subarray(from, to), at);
    forest.set(level.forest.subarray(from, to), at);
    river.set(level.river.subarray(from, to), at);
  }
  return {
    faceLevel,
    mapLevel: id.mapLevel,
    face,
    i0,
    j0,
    size,
    heightsM,
    biome,
    water,
    temperatureC,
    humidity,
    forest,
    river,
  };
}

/**
 * 행성의 모든 타일을 planetTileIds 순서(맵 레벨 오름차순 → 키 오름차순)로 하나씩 만든다.
 * 단계 값은 처음에 모두 모으고(레벨 F의 약 1/3 크기), 꼭짓점 높이는 맵 레벨마다 만들고 다음 레벨로 가면 버린다.
 */
export function* buildPlanetTiles(fields: PlanetFields): Generator<{ id: PlanetTileId; tile: PlanetTile }> {
  const faceLevel = fields.meta.faceLevel;
  const levels = aggregatePlanetLevels(fields);
  const byLevel = new Map(levels.map((level) => [level.level, level]));
  let cornersLevel = -1;
  let corners: Int16Array = new Int16Array(0);
  for (const id of planetTileIds(faceLevel)) {
    const level = byLevel.get(id.mapLevel);
    if (!level) throw new Error(`map level ${id.mapLevel} was not aggregated`);
    if (cornersLevel !== id.mapLevel) {
      corners = planetCornerHeights(level);
      cornersLevel = id.mapLevel;
    }
    yield { id, tile: buildPlanetTile(faceLevel, level, corners, id) };
  }
}
