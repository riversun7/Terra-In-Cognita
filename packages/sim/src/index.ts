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
export * from "./terrain/layerCosts.ts";
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
  restIdle,
  settleJob,
  settleUpkeep,
  switchJob,
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
  bonusCycles,
  settleOwnerPeriod,
  testSettleAccounts,
  type GoodsLine,
  type OutputSegment,
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
export {
  DEFAULT_SCENARIO_SOCIETY,
  parseScenario,
  type Scenario,
  type ScenarioSociety,
} from "./simulator/scenario.ts";
// NPC 판단(R5, docs/adr/2026-11-01-npc-brain-r5.md): 판단 틀·규칙식·성향, 시뮬·서버가 같이 쓰는 실행 접착
export {
  chooseAction,
  decideAction,
  peaceScore,
  scoreActions,
  type FactionView,
  type NpcAction,
  type RestoreView,
  type RivalView,
  type ScoredAction,
} from "./npc/brain.ts";
export { TEST_NPC_COEFFICIENTS, type NpcCoefficients } from "./npc/coefficients.ts";
export {
  answerOffer,
  foundingChoice,
  independenceYes,
  nextTaxBp,
  recruitPicks,
  tradePolicy,
  type FoundingChoice,
  type TradePolicy,
} from "./npc/policy.ts";
export {
  TRAIT_AXES,
  inheritTraits,
  rollTraits,
  traitsFromArray,
  traitsToArray,
  type Traits,
} from "./npc/traits.ts";
export {
  declareWar,
  endWar,
  endedWars,
  inTruce,
  makePeace,
  recordFight,
  warCost,
  type WarState,
} from "./society/wars.ts";
export {
  EVENT_DECIDE,
  blocsOf,
  decide,
  emptyNpcCounts,
  factionView,
  recruitPolicy,
  rivalView,
  scheduleDecide,
  type Blocs,
  type NpcContext,
  type NpcCounts,
  type SimEvent,
  type SimHooks,
} from "./simulator/npcRun.ts";
export {
  HOMELESS,
  STREAM_TRAITS,
  newFaction,
  rulingFamilyOf,
  streamRng,
  restoreEscrow,
  type SimCity,
  type SimFaction,
  type SimRuin,
  type SimUnit,
  defenseOrder,
  expeditionOrder,
  type SimWorld,
} from "./simulator/world.ts";
// 폐허 복원(docs/adr/2026-11-07-ruins-restoration.md)·공성 결과 셋(docs/adr/2026-11-07-war-outcomes.md): 규칙·시뮬·서버 같은 실행
export * from "./simulator/ruinsEntry.ts";
export * from "./simulator/warEntry.ts";
// 세계 씨앗(docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"): 고정 NPC 국가 시작 도시 수·기본 시설 수 [임시]. 서버만 읽는다
export {
  START_CITIES_LIMIT,
  START_WORLD_SEED,
  type WorldSeedCoefficients,
  catchmentGrowthOf,
  catchmentSupplyOf,
  plannedCityRadiusMilli,
  startCitiesFor,
} from "./society/worldSeed.ts";
// 오염·정원사(R5b, docs/adr/2026-11-01-gardener-r5b.md): 순수 규칙, 시뮬·서버가 같이 쓰는 실행 접착·웨이브 전투
export { TEST_GARDENER_COEFFICIENTS, type GardenerCoefficients } from "./gardener/coefficients.ts";
export {
  RELATION_STAGES,
  type RelationStage,
  clampRelation,
  isPeaceDay,
  nextRelation,
  relationCap,
  relationChancePm,
  relationStage,
  stageChancePm,
} from "./gardener/relations.ts";
export {
  type GardenerWaveKind,
  NO_REWARD,
  type WaveReward,
  isEmptyReward,
  waveReward,
} from "./gardener/rewards.ts";
export {
  addPollution,
  dailyPollutionStep,
  facilityPollution,
  humanPollution,
  influenceCells,
  influenceSum,
  purify,
  squareGrid,
  unionInfluenceSum,
  type PollutionGrid,
  type PollutionLayer,
} from "./gardener/pollution.ts";
export {
  bitLength,
  floorLog2,
  grantGardenerUnits,
  mothershipCap,
  physicalCount,
  physicalPm,
  raidStrength,
  waveArrivalMs,
  waveChancePm,
  waveStrength,
  type FactionScale,
} from "./gardener/waves.ts";
export {
  NOMAD_KINDS,
  nomadFits,
  nomadSize,
  nomadTarget,
  roamCell,
  startingNomads,
  type NomadKind,
  type NomadParty,
} from "./gardener/nomads.ts";
export {
  EVENT_NOMAD,
  EVENT_WAVE,
  STREAM_GARDENER,
  attachGardener,
  type GardenerOptions,
  type GardenerRestore,
  type GardenerRun,
  type GardenerSummary,
  type GardenerWave,
  type ResolvedWave,
  type WaveState,
} from "./simulator/gardenerRun.ts";
export {
  GARDENER_SIDE_FACTION,
  WAVE_CHECK_TICKS,
  finishSpentWave,
  isWaveBattle,
  runWaveToEnd,
  waveBattleInit,
  waveSiegeSpent,
  type WaveBattleInput,
} from "./simulator/waveBattle.ts";
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
  lotSizeOf,
  prepareCatalog,
  type CatalogFacility,
  type CatalogGather,
  type CatalogItem,
  type CatalogNecessity,
  type CatalogPreset,
  type CatalogRecipe,
  type EconomyCatalog,
  type PreparedCatalog,
} from "./simulator/catalog.ts";
// 경제 실행·NPC 거래 규칙(서버 NPC 도시 경제가 같은 함수를 쓴다, docs/adr/2026-11-07-play-flow.md WP4)
export * from "./simulator/serverEconomy.ts";
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
export * from "./economy/fxMarket.ts";
export {
  BASE_EFFICIENCY,
  HOUR_MS,
  batchDurationMs,
  maxTierForLevel,
  runRecipe,
  tierCappedByLevel,
  type GatherMode,
  type ProductionAccounts,
  type RecipeSpec,
  type Stack,
} from "./economy/production.ts";
export { dueNecessities, payNecessities, type NecessitySpec, type UpkeepPaid } from "./economy/upkeep.ts";
export {
  ACCESSIBLE_TIER_STEP,
  GATHER_TIERS,
  GATHER_WEIGHT_TOTAL,
  TEST_GATHER_BANDS,
  accessibleTier,
  gatherBandIndex,
  gatherChancesPm,
  gatherLadderKey,
  gatherProgress,
  gatherStat,
  gatherSubcategories,
  gatherYield,
  pickGatherItem,
  rollGatherOutputs,
  rollGatherTier,
  tierRequiredProgress,
  type GatherBand,
  type GatherRoll,
  type GatherSubcategorySource,
  type GatherYieldRule,
} from "./economy/gather.ts";
export {
  INVARIANT_LABOR_ESCROW,
  LABOR_END_REASONS,
  LABOR_KINDS,
  LABOR_STATES,
  OLD_LABOR_RULES,
  checkLaborEscrow,
  depositCyclesLeft,
  laborAccounts,
  laborEscrowCode,
  laborWarning,
  openLabor,
  requiredDeposit,
  setLeaseRent,
  settleLabor,
  terminateLabor,
  topUpLabor,
  wagePerCycle,
  type LaborAccounts,
  type LaborContract,
  type LaborEndReason,
  type LaborFailure,
  type LaborKind,
  type LaborMode,
  type LaborOpenInput,
  type LaborRules,
  type LaborSegment,
  type LaborState,
} from "./economy/laborContract.ts";
export {
  LABOR_JOB_KINDS,
  LABOR_JOB_STATES,
  acceptLaborJob,
  closeLaborJob,
  laborJobWage,
  postLaborJob,
  type LaborJob,
  type LaborJobAcceptInput,
  type LaborJobFailure,
  type LaborJobInput,
  type LaborJobKind,
  type LaborJobState,
} from "./economy/laborJobs.ts";
export {
  TEST_CENTRAL_BANK_RULE,
  centralBankStep,
  initialMint,
  type CentralBankInput,
  type CentralBankRule,
  type CentralBankStep,
} from "./economy/centralBank.ts";
export {
  AFFINITY_RELATION,
  TEST_COMBAT_COEFFICIENTS,
  affinityRatePm,
  armorRegenOf,
  msToTicks,
  regenOnTick,
  specStaminaCostMilli,
  staminaAppropriateOf,
  staminaCostMilli,
  staminaScore,
  type CombatCoefficients,
  type StaminaOwner,
} from "./combat/coefficients.ts";
export {
  ELEMENT_COUNT,
  buildingDamage,
  elementAddPm,
  familyValue,
  matchupPm,
  APPROPRIATE_CAP_PM,
  realAttackOf,
  realCritPm,
  realHitPm,
  resolveAttack,
  sightRadius,
  statPlusWeapon,
  weaponRatioPm,
  weaponScaled,
  withAttackModifiers,
  withDefenseModifiers,
  type AttackOutcome,
  type AttackProfile,
  type AttackResult,
  type DefenseProfile,
  type Rolls,
} from "./combat/formula.ts";
export {
  rollUseAmount,
  useAmountRange,
  type UseAmountRange,
  type UseScale,
} from "./combat/useAmount.ts";
export {
  DEFAULT_COMBAT_FORMULA_SET,
  attackIntervalMs,
  attackValue,
  bareAppropriateMilli,
  combatFormulaSetFrom,
  critMultiplierPm,
  dexFrameValue,
  evadeChancePm,
  isValidCombatFormula,
  realStaminaRegen,
  staminaAppropriateMilli,
  staminaCostMilliOf,
  staminaScoreOf,
  type CombatFormulaSet,
} from "./combat/formulas.ts";
export {
  MAX_STAT_INPUT,
  MAX_WEIGHT_PM,
  TEST_STAT_TABLE,
  computeSecondary,
  explainSecondary,
  primaryAtLevel,
  type Primaries,
  type SecondaryExplanation,
  type SecondaryTerm,
  type StatRow,
} from "./combat/stats.ts";
export {
  type AttackField,
  appropriateMilliOf,
  basicFieldOf,
  weaponFieldsOf,
  specFromStats,
  type UnitBody,
  type WeaponAppropriate,
  type WeaponAttackField,
  type WeaponSpec,
} from "./combat/unitSpec.ts";
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
export { createBattle, restoreBattle, runBattle, snapshotBattle } from "./combat/battle.ts";
export {
  createBattleTally,
  type BattleHit,
  type BattleTally,
  type TallyEvent,
  type UnitTally,
} from "./combat/observe.ts";
export type { BattleTrace } from "./combat/battleTrace.ts";
export {
  recordBattleReplay,
  skillShape,
  type RecordBattleOptions,
  type RecordedBattle,
} from "./combat/replay.ts";
export { DEMO_ROLES, demoSkirmish, type DemoRole, type DemoSkirmish } from "./combat/replayDemo.ts";
export { arenaFromSecondMap, pickArenaOrigin, type SecondMapLayers } from "./combat/arena.ts";
export { activeStartEffects } from "./combat/battleState.ts";
export type {
  Battle,
  BattleInit,
  BattleInput,
  BattlePartySpec,
  BattlePotion,
  BattlePotions,
  BattleResult,
  BattleSideSpec,
  BattleState,
  CombatUnitSpec,
  Command,
  Edge,
  PartyState,
  StartEffect,
  UnitState,
  UnitStatus,
} from "./combat/battleTypes.ts";
export {
  consumablesUsed,
  drinkPotion,
  potionHeal,
  type ConsumablesUsed,
  type PotionDrink,
} from "./combat/consumables.ts";
export {
  postLoot,
  resolveOutcomes,
  type CargoHolding,
  type UnitOutcome,
  type UnitResult,
} from "./combat/outcome.ts";
export {
  duelInit,
  runDuels,
  runStatDuels,
  statFighterSpecs,
  type DuelOptions,
  type DuelReport,
  type StatFighter,
} from "./combat/duels.ts";
export { componentLabels } from "./grid/components.ts";
export {
  MIN_MOVE_SPEED_PM,
  applyEffect,
  hasStatus,
  modifiersOf,
  moveIntervalMs,
  shieldRegenPerMinute,
  statusResistPm,
  tickEffects,
  type ActiveEffect,
  type EffectDef,
  type EffectHolder,
  type EffectKind,
  type Modifiers,
  type ModifierStat,
  type StatusKind,
} from "./combat/effects.ts";
export {
  singleAlly,
  skillFromData,
  skillUsable,
  type SkillWeaponField,
  type CombatSkill,
  type SkillChain,
  type SkillCondition,
  type SkillData,
  type SkillEffectData,
  type SkillFormulaPart,
  type SkillPick,
  type SkillShape,
} from "./combat/skills.ts";
export {
  PRIMARY_CODES,
  PRIMARY_SLOTS,
  SLOT_KINDS,
  itemAt,
  loadoutOf,
  rollItem,
  skillSlotCount,
  wrongStatGroup,
  type EquipDef,
  type EquippedItem,
  type GearCombat,
  type IgnoredItem,
  type IgnoredReason,
  type Loadout,
  type PrimaryCode,
  type SlotKind,
  type StatRange,
} from "./combat/equipment.ts";
export {
  TEST_COMBAT_CATALOG,
  UNARMED,
  UNARMED_ELEMENTAL,
  skillsOf,
  withStatTable,
  type CombatCatalog,
  type UnitKindDef,
} from "./combat/catalog.ts";
export {
  combatCatalogFrom,
  combatFormulasFromPack,
  droppedReferences,
  equipDefOf,
  statRowFrom,
  weaponSpecOf,
  type CombatPackEntries,
  type DroppedReferences,
} from "./combat/packCatalog.ts";
export { SIM_ITEM_REFS } from "./itemRefs.ts";
export {
  TUNING_KEYS,
  combatCoefficientsFrom,
  societyCoefficientsFrom,
  tuningValue,
  type TuningKey,
} from "./tuning.ts";
export { newTuningProblems, statTableProblems, tuningProblems } from "./tuningChecks.ts";
export { tuningPageOf, tuningPageTable } from "./tuningPages.ts";
// 랭킹(20 §8, docs/adr/2026-11-07-ranking.md): 감쇠형 점수·백분위 등급·언더독·로그 압축(정수), 계수표 ranking 칸
export {
  type RankingCoefficients,
  type RankingFactionWeights,
  TEST_RANKING_COEFFICIENTS,
} from "./ranking/coefficients.ts";
export {
  type FactionSize,
  type RankedEntry,
  type ScoredEntry,
  citiesValue,
  decayScore,
  facilitiesValue,
  factionScore,
  log2Milli,
  logOver,
  nextScore,
  periodGain,
  productionValue,
  rankEntries,
  tierCuts,
  tierPmOf,
  underdogPm,
} from "./ranking/score.ts";
export { RANKING_TUNING_KEYS } from "./tuningRanking.ts";
export { TEST_SOCIETY_COEFFICIENTS, type SocietyCoefficients } from "./society/coefficients.ts";
export { SWITCH_TUNING_KEYS, TEST_SYSTEM_SWITCHES, type SystemSwitches } from "./tuningSwitches.ts";
export {
  PROTECTOR_ASSET,
  TEST_GEM_RULES,
  enchant,
  extractGene,
  gemAsset,
  type EnchantOutcome,
  type GemRef,
  type GemRules,
  type InnateSkill,
  type SocketedItem,
} from "./combat/gems.ts";
export {
  allocateShares,
  burnShares,
  holdingsOf,
  issueShares,
  rulerHasMajority,
  shareAsset,
  totalShares,
  transferShares,
  type Holding,
  type Regime,
  type TransferResult,
} from "./society/shares.ts";
export {
  makeOffers,
  occupationShifts,
  reissueHolders,
  resolveOffer,
  settleShares,
  shareOwnerOf,
  type IncorporationOffer,
  type OccupationResult,
  type OfferState,
  type ShareChoice,
  type ShareOccupier,
  type Treatment,
} from "./society/occupation.ts";
export {
  capitalistIndependence,
  democraticIndependence,
  independenceAllowed,
  rebelsOf,
  unrestBand,
  type IndependenceVote,
  type UnrestBand,
} from "./society/uprising.ts";
export {
  payCityProfit,
  profitRecipient,
  settleCityTaxes,
  type CityProfitPayment,
  type CityRevenue,
  type CityTaxSettlement,
  type ProfitRecipient,
  type TaxSettlement,
} from "./society/dividends.ts";
export {
  rebirthBlockers,
  rebirthCyborg,
  skillGradeCap,
  type CyborgProgress,
  type ItemNeed,
  type RebirthBlocker,
  type RebirthChoice,
  type RebirthResult,
  type RebirthWallet,
  type ReligionItem,
  type ReligionItemUse,
} from "./society/cyborgRebirth.ts";
export {
  FAITH_MAX,
  FAITH_POINTS_MAX,
  convertReligion,
  gainFaith,
  resetFaithForRebirth,
  spendFaithPoints,
  type UnitFaith,
} from "./society/faith.ts";
export { grantMultiplierPm, settlementGrant, type GrantFaction } from "./society/settlementGrant.ts";
export {
  livingEfficiencyPm,
  organWorks,
  repairDurable,
  repairOrgan,
  wearOrgan,
  withEfficiency,
  type Durable,
  type DurableRepair,
  type RepairResult,
} from "./society/cyborgUpkeep.ts";
export * from "./items/holdingExports.ts";
export * from "./items/foodPack.ts";
export {
  CRAFT_JOB_ROW,
  craftScore,
  craftSkillPm,
  planEquipmentRepair,
  repairMaterials,
  repairRuleFor,
  type EquipmentRepairPlan,
  type RepairMaterial,
  type RepairRule,
  type RepairTarget,
} from "./items/repair.ts";
export {
  firstStatRoll,
  kFromRolls,
  PRIMARY_STATS,
  rerollStats,
  rollStatSpread,
  temperamentOf,
  type CyborgTemperament,
  type PrimaryStat,
  type StatRolls,
} from "./society/cyborgStats.ts";
export { deathFate, inherit, lifespanMs, type DeathFate } from "./society/population.ts";
export {
  OLD_TEMPLE_COEFFICIENTS,
  TEMPLE_RITES,
  DEFAULT_GUARDIAN_BUFF,
  GUARDIAN_BUFFS,
  addDevotion,
  devotionGain,
  guardianBuffValue,
  guardianDefensePm,
  isGuardianBuff,
  inactiveWindow,
  isInactiveAt,
  rebirthHuman,
  riteBlockers,
  riteCost,
  type InactiveWindow,
  type GuardianBuff,
  type RiteBlocker,
  type TempleCoefficients,
  type TempleRite,
} from "./society/temple.ts";
export {
  ADMIN_LEVEL_MAX,
  OLD_RECRUIT_COEFFICIENTS,
  RECRUIT_CARDS_CAP,
  RECRUIT_STAT_COUNT,
  distributeRecruitElements,
  distributeRecruitStats,
  recruitCards,
  recruitCost,
  recruitElementSlots,
  recruitElementsFromSlots,
  recruitLevelRule,
  recruitProfileOf,
  recruitWindow,
  recruitWindowEndMs,
  rollFoundingProfile,
  rollRecruitCards,
  takeRecruitSlot,
  takenNow,
  type RecruitCard,
  type RecruitCoefficients,
  type RecruitDraw,
  type RecruitElements,
  type RecruitLevelRule,
  type RecruitProfile,
} from "./society/recruitment.ts";
export { STREAM_RECRUIT, type RecruitView, type SocietyRecruit } from "./simulator/societyRecruit.ts";
export {
  FUSION_STAT_COUNT,
  OLD_FUSION_COEFFICIENTS,
  waveGeneDrops,
  fuseStatRange,
  fuseStats,
  fusionBonusPm,
  geneItemOf,
  partsDonorStats,
  sixStats,
  upkeepWeightPm,
  type FusionCoefficients,
  type GeneItem,
} from "./society/fusion.ts";
export {
  GENE_DIST_TOTAL,
  GENE_ELEMENT_COUNT,
  apportion,
  geneStatValues,
  incubateStats,
  mainStatIndex,
  statGeneOf,
  synthesizeStatGenes,
  twelveElements,
  type GeneApply,
  type GeneSynthesisOutcome,
  type StatGene,
} from "./society/genes.ts";
export {
  advanceTech,
  researchCost,
  techCeiling,
  type ResearchSite,
  type TechChange,
  type TechState,
} from "./society/tech.ts";
export * from "./society/labor.ts";
export * from "./society/logistics.ts";
export * from "./society/injury.ts";
export * from "./society/condition.ts";
export {
  attachSociety,
  foundingProfileOf,
  STREAM_SOCIETY,
  WALLET_BASE,
  type SocietyOptions,
  type SocietyRun,
  type SocietySummary,
} from "./simulator/society.ts";
