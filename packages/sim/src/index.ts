// 서버 전용 판정 코드 진입점 (ADR 2026-10-28-s1-second-map.md, 2026-10-28-simulation-model.md)
// 게임 앱은 이 패키지를 import할 수 없다(scripts/check-boundaries.mjs). 정수 계산만 쓰고 초월함수는 쓰지 않는다.
export { SIM_VERSION, TEMP_TERRAIN_GENERATOR_VERSION } from "./version.ts";
export {
  CAR_SPEED,
  CELL_UNITS,
  HALF_CELL_UNITS,
  MAP_UNITS,
  MS_PER_SECOND,
  PLACEMENT_CELLS,
  PLACEMENT_PER_TERRAIN,
  PLACEMENT_SIZE,
  TERRAIN_SIZE,
  TERRAIN_VERTEX_SIZE,
  WALK_SPEED,
  type CellPoint,
  type Point,
} from "./units.ts";
export { isqrt, isqrtRound } from "./math/isqrt.ts";
export { createFnv1a, hashCoords, mix32, type Fnv1a } from "./math/hash.ts";
export {
  MAX_SIZE_CLASS,
  SIZE_HUGE,
  SIZE_LARGE,
  SIZE_SMALL,
  computeClearance,
  isSizeClass,
  type SizeClass,
} from "./grid/clearance.ts";
export {
  BASE_COST,
  MAX_TERRAIN_COST,
  ROAD_COST,
  ROAD_FOUR_LANE,
  ROAD_HIGHWAY,
  ROAD_NONE,
  ROAD_TRAIL,
  ROAD_TWO_LANE,
  ROAD_VILLAGE,
  isRoadType,
} from "./grid/costs.ts";
export {
  cellCost,
  cellIndex,
  createPlacementGrid,
  footprintCost,
  isInside,
  isPassable,
  setRoad,
  setTerrainCost,
  type CellRect,
  type PlacementGrid,
} from "./grid/placementGrid.ts";
export {
  DEFAULT_NODE_BUDGET,
  DIAGONAL_STEP,
  STRAIGHT_STEP,
  createPathfinder,
  type PathRequest,
  type PathResult,
  type Pathfinder,
} from "./path/astar.ts";
export {
  anchorAt,
  anchorCenter,
  cellPathToWaypoints,
  planRoute,
  simplifyCellPath,
  type RouteRequest,
  type RouteResult,
} from "./path/waypoints.ts";
export {
  MAX_COORDINATE,
  MAX_SPEED,
  arrivalAt,
  createMotion,
  distanceAt,
  positionAt,
  positionAtDistance,
  type Motion,
  type MotionInput,
} from "./motion/motion.ts";
export { createEventQueue, type EventQueue, type ScheduledEvent } from "./events/eventQueue.ts";
export {
  MAX_BUILDING_ID,
  applyPlacement,
  footprintRect,
  removeBuilding,
  validatePlacement,
  type BuildingPlacement,
  type PlacementCheck,
  type PlacementProblem,
  type Rotation,
} from "./placement/placement.ts";
export { NOISE_MAX, valueNoise } from "./terrain/noise.ts";
export {
  CLIFF_RELIEF_CM,
  ROCK_RELIEF_CM,
  SURFACE_COST,
  SURFACE_DIRT,
  SURFACE_GRASS,
  SURFACE_ROCK,
  SURFACE_WATER,
  generateTempTerrain,
  placementCostsFromTerrain,
  seedFromCellKey,
  terrainCellRelief,
  terrainHash,
  type TempTerrain,
} from "./terrain/tempTerrain.ts";
export {
  JOB_GATHER,
  JOB_HUNT,
  JOB_NONE,
  OFFLINE_WORK_MS,
  PHASE_REST,
  PHASE_WORK,
  TEST_JOB_RULES,
  TEST_UPKEEP_PER_UNIT,
  UPKEEP_PERIOD_MS,
  advanceJob,
  jobCutoffMs,
  settleJob,
  settleUpkeep,
  upkeepBoundaries,
  type JobAdvance,
  type JobRules,
  type JobState,
  type UpkeepResult,
} from "./settle/settle.ts";
