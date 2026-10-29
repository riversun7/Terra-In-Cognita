// 1차맵 타일 (ADR 2026-10-29-s2-planet-lod "타일") — 생성기 출력 → 단계별 모으기 → 꼭짓점 높이 → 32×32칸 타일.
// 서버(굽기)와 기기(렌더러가 타일 ID를 고를 때)가 함께 쓴다. 정수 연산만 쓴다.
export {
  WATER_COAST,
  WATER_DEPTH_MASK,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  assertPlanetFields,
  planetCellCount,
  type PlanetFields,
  type PlanetFieldsMeta,
} from "./fields.ts";
export {
  PLANET_TILE_CELLS,
  PLANET_TILE_LEVEL_OFFSET,
  planetMapLevels,
  planetTileCount,
  planetTileIdFromKey,
  planetTileIds,
  planetTileKey,
  planetTileSize,
  type PlanetTileId,
} from "./tileIds.ts";
export { aggregatePlanetLevels, type PlanetLevel } from "./aggregate.ts";
export { planetCornerHeights } from "./cornerHeights.ts";
export { buildPlanetTile, buildPlanetTiles, type PlanetTile } from "./buildTiles.ts";
