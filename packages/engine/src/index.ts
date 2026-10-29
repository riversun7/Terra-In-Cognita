// @terra/engine — 2차맵 Three.js 엔진(React와 나눈 모듈). ADR 2026-10-28-s1-second-map
// 이 패키지는 @terra/shared·@terra/protocol·@terra/planet만 가져온다(AGENTS.md 4장, scripts/check-boundaries.mjs).
// 시험 화면용 임시 자료(지형·유닛·건물, 가짜 행성)는 따로 `@terra/engine/mock`에 있다.
// 1차맵(행성 LOD) 엔진은 다른 진입점 `@terra/engine/planet`이다(화면 조각마다 쓰는 엔진만 묶이게).
export { createSecondMapEngine } from "./secondMapEngine.ts";
export type {
  EngineStats,
  EngineStatus,
  SecondMapEngine,
  SecondMapEngineOptions,
  UnitSpawn,
  UnitState,
} from "./engineTypes.ts";
export {
  HEIGHT_UNIT_M,
  PLACEMENT_CELLS,
  SURFACE,
  TERRAIN_CELLS,
  TERRAIN_VERTICES,
  type SurfaceCode,
  type TerrainInput,
} from "./terrain/terrainData.ts";
export { FIXED_POINT_SCALE, type UnitPath } from "./units/unitMotion.ts";
export type { UnitDisplayMode, UnitLook } from "./units/unitView.ts";
export type { BuildingFootprint, QuarterTurns } from "./buildings/footprint.ts";
export { disposeSharedRenderer } from "./render/sharedRenderer.ts";
