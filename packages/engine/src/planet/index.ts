// @terra/engine/planet — 1차맵(행성) 엔진. ADR 2026-10-29-s2-planet-lod "렌더러"
// 2차맵 엔진(@terra/engine)과 같은 꾸러미의 다른 진입점이다: 화면 조각마다 쓰는 엔진만 묶인다(Three.js·렌더러는 함께 쓴다).
// 이 진입점은 @terra/shared·@terra/protocol·@terra/planet만 가져온다(AGENTS.md 4장, scripts/check-boundaries.mjs).
export { createPlanetEngine } from "./planetEngine.ts";
export {
  DEFAULT_MAX_ELEVATION_M,
  DEFAULT_PLANET_BUDGETS,
  MAX_RENDER_FACE_LEVEL,
  PLANET_LAYERS,
  WATER_BITS,
  WATER_DEPTH_SHIFT,
  isEncodedTile,
  waterDepthClass,
  type DecodedTile,
  type EncodedTile,
  type GpuBenchStats,
  type PickedCell,
  type PlanetBudgets,
  type PlanetCameraView,
  type PlanetDescription,
  type PlanetEngine,
  type PlanetEngineOptions,
  type PlanetLayer,
  type PlanetMoonDescription,
  type PlanetResourceMap,
  type PlanetSkyDescription,
  type PlanetSkyFeatures,
  type PlanetSkyMode,
  type PlanetSkyStats,
  type PlanetStats,
  type PlanetStatus,
  type PlanetView,
  type SkyClockSource,
  type SkyClockState,
  type TileRequest,
  type TileSource,
} from "./planetTypes.ts";
export {
  ELEVATION_LAKE_COLOR,
  ELEVATION_LAND_RAMP,
  ELEVATION_SEA_RAMP,
  ELEVATION_SEA_SCALE,
  MUTED_WATER_COLOR,
  RESOURCE_COLORS,
  RESOURCE_HIGH_COLOR,
  RESOURCE_MATERIALS,
  type RampStop,
  cssColor,
  rampGradient,
  resourceRamp,
} from "./layerColors.ts";
export { RESOURCE_MAP_MAX_LEVEL } from "./resourceLayer.ts";
export { MAX_BENCH_REPEAT, MIN_BENCH_REPEAT } from "./gpuBench.ts";
export {
  type PlanetProjector,
  type ProjectedPoint,
  latLonOfMapKey,
  mapKeyAtLatLon,
  placementAtLatLon,
  pointVisible,
} from "./planetOverlay.ts";
export { skySeedOfHash } from "./cloudNoise.ts";
export { PRIMARY_LEVELS, TILE_CELLS } from "./tileTree.ts";
export { disposeSharedRenderer } from "../render/sharedRenderer.ts";
