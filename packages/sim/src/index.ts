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
export { compareEventKeys, type EventKey } from "./events/eventKey.ts";
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
export {
  BUILDING_VISION_CELLS,
  UNIT_VISION_CELLS,
  VISION_BYTES,
  VISION_CELL,
  VISION_CELLS,
  VISION_SIDE,
  addCoverBits,
  hasBit,
  stampVision,
  truncateMotion,
  visibleUntil,
  visionCellOf,
  visionRadius,
} from "./vision/vision.ts";
export {
  LedgerError,
  createLedgerBook,
  type LedgerAccount,
  type LedgerBook,
  type LedgerEntry,
  type LedgerErrorCode,
  type LedgerHooks,
  type LedgerPost,
} from "./ledger/ledgerBook.ts";
export {
  INVARIANT_I1_ASSETS,
  INVARIANT_I1_TRANSACTIONS,
  INVARIANT_I2_BALANCE,
  INVARIANT_I2_NEGATIVE,
  INVARIANT_I1_SYSTEM_KIND,
  INVARIANT_I6_KEYS,
  createLedgerAudit,
  type LedgerAudit,
} from "./ledger/audit.ts";
export {
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  TEST_SYSTEM_ISSUE_CREDIT,
  TEST_SYSTEM_RESERVE_ORE,
  TEST_SYSTEM_SINK_CREDIT,
  settleOwnerPeriod,
  testSettleAccounts,
  type OwnerSettleInput,
  type OwnerSettleResult,
  type SettleAccounts,
} from "./settle/owner.ts";
export { type SimLoop, createSimLoop } from "./simulator/loop.ts";
export {
  DAY_MS,
  createMetricsRecorder,
  type FactionDay,
  type FactionStart,
  type MetricsOptions,
  type MetricsRecorder,
  type MetricsSummary,
} from "./simulator/metrics.ts";
export { parseScenario, type Scenario } from "./simulator/scenario.ts";
export {
  SIM_OUTPUT_FORMAT,
  SIM_START_MS,
  runSimulation,
  type RunOptions,
  type RunSummary,
} from "./simulator/run.ts";
export {
  currencyAsset,
  itemAsset,
  prepareCatalog,
  type CatalogFacility,
  type CatalogItem,
  type CatalogNecessity,
  type CatalogPreset,
  type CatalogRecipe,
  type EconomyCatalog,
  type PreparedCatalog,
} from "./simulator/catalog.ts";
export {
  type BookFill,
  type BookOrder,
  type OrderBook,
  type OrderInput,
  type Side,
  createOrderBook,
} from "./economy/orderBook.ts";
export {
  type GoodsMarket,
  type GoodsMarketConfig,
  type PlaceResult,
  createGoodsMarket,
} from "./economy/goodsMarket.ts";
export { type AuctionOrder, type AuctionResult, clearCallAuction } from "./economy/callAuction.ts";
export { type FxMarket, type FxPair, createFxMarket } from "./economy/fxMarket.ts";
export {
  BASE_EFFICIENCY,
  HOUR_MS,
  batchDurationMs,
  maxTierForLevel,
  runRecipe,
  type ProductionAccounts,
  type RecipeSpec,
  type Stack,
} from "./economy/production.ts";
export { dueNecessities, payNecessities, type NecessitySpec, type UpkeepPaid } from "./economy/upkeep.ts";
export {
  TEST_CENTRAL_BANK_RULE,
  centralBankStep,
  initialMint,
  type CentralBankInput,
  type CentralBankRule,
  type CentralBankStep,
} from "./economy/centralBank.ts";
export { TEST_COMBAT_COEFFICIENTS, msToTicks, type CombatCoefficients } from "./combat/coefficients.ts";
export {
  ELEMENT_COUNT,
  buildingDamage,
  elementTermPm,
  resolveAttack,
  sightRadius,
  weaponScaled,
  type AttackOutcome,
  type AttackProfile,
  type DefenseProfile,
  type Rolls,
} from "./combat/formula.ts";
export {
  MAX_STAT_INPUT,
  MAX_WEIGHT_PM,
  TEST_STAT_TABLE,
  computeSecondary,
  primaryAtLevel,
  type Primaries,
  type StatRow,
} from "./combat/stats.ts";
export { specFromStats, type UnitBody, type WeaponSpec } from "./combat/unitSpec.ts";
export {
  COVER_BLOCK,
  COVER_BUSH,
  COVER_NONE,
  MAX_BATTLE_SIZE,
  MIN_BATTLE_SIZE,
  createBattleMap,
  type BattleBuildingInput,
  type BattleMap,
  type BattleMapInput,
} from "./combat/battleMap.ts";
export { BLOCK_HEIGHT, lineClear, type SightEnd } from "./combat/los.ts";
export {
  createBattle,
  restoreBattle,
  runBattle,
  snapshotBattle,
  type Battle,
  type BattleInit,
  type BattleInput,
  type BattlePartySpec,
  type BattleResult,
  type BattleSideSpec,
  type BattleState,
  type CombatUnitSpec,
  type Command,
  type Edge,
  type UnitState,
  type UnitStatus,
} from "./combat/battle.ts";
export {
  postLoot,
  resolveOutcomes,
  type CargoHolding,
  type UnitOutcome,
  type UnitResult,
} from "./combat/outcome.ts";
export { duelInit, runDuels, type DuelReport } from "./combat/duels.ts";
