// @terra/engine/planet — 1차맵(행성) 엔진. ADR 2026-10-29-s2-planet-lod "렌더러"
// 2차맵 엔진(@terra/engine)과 같은 꾸러미의 다른 진입점이다: 화면 조각마다 쓰는 엔진만 묶인다(Three.js·렌더러는 함께 쓴다).
// 이 진입점은 @terra/shared·@terra/protocol·@terra/planet만 가져온다(AGENTS.md 4장, scripts/check-boundaries.mjs).
export { createPlanetEngine } from "./planetEngine.ts";
export {
  DEFAULT_PLANET_BUDGETS,
  WATER_BITS,
  WATER_DEPTH_SHIFT,
  waterDepthClass,
  type DecodedTile,
  type PickedCell,
  type PlanetBudgets,
  type PlanetCameraView,
  type PlanetDescription,
  type PlanetEngine,
  type PlanetEngineOptions,
  type PlanetLayer,
  type PlanetStats,
  type PlanetStatus,
  type PlanetView,
  type TileRequest,
  type TileSource,
} from "./planetTypes.ts";
export { PRIMARY_LEVELS, TILE_CELLS } from "./tileTree.ts";
export { disposeSharedRenderer } from "../render/sharedRenderer.ts";
