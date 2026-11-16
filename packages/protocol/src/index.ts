// 실시간 프로토콜 진입점 — 기기·서버가 같은 정의를 쓴다.
// 의미를 바꾸면 PROTOCOL_VERSION을 올리고 ADR을 남긴다 (docs/PROTECTED.md).
// package.json "sideEffects": false: 쓰지 않는 모듈(1차맵 타일 형식 등)은 첫 화면 묶음에서 빠진다. 그래서 이 꾸러미
// 모듈은 맨 위에서 부르는 코드(전역 등록 등)를 두지 않는다(ADR 2026-10-29-s2-planet-lod "다듬기 통합", AGENTS.md 6장)
export {
  PROTOCOL_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES,
  HEARTBEAT_INTERVAL_MS,
  isProtocolSupported,
} from "./version.ts";
export {
  clientMessageSchema,
  serverMessageSchema,
  type ClientMessage,
  type ClientMessageOf,
  type ServerMessage,
  type ServerMessageOf,
} from "./messages.ts";
export {
  MAX_BUILDING_SIDE,
  MAX_PATH_POINTS,
  MAX_PATH_PACE,
  MAX_UNIT_SPEED,
  OPERATOR_PACE_MAX,
  OPERATOR_PACE_PROTOCOL_VERSION,
  POSITION_UNITS_PER_CELL,
  RESULT_CODES,
  S1_TEST_MAP_KEY,
  SECOND_MAP_CELLS,
  SECOND_MAP_PROTOCOL_VERSION,
  SECOND_MAP_UNITS,
  UNIT_CONTROL_PROTOCOL_VERSION,
  UNIT_KIND_PROTOCOL_VERSION,
  UNIT_WIRE_KINDS,
  VISION_BYTES,
  UNIT_SIZE_CLASSES,
  buildingSchema,
  unitMotionSchema,
  paceMatchesPath,
  SEGMENT_SPEED_PROTOCOL_VERSION,
  type BuildingWire,
  type ResultCode,
  type UnitMotionWire,
  type UnitWireKind,
} from "./secondMap.ts";
export {
  CYBORG_ELEMENTS_PROTOCOL_VERSION,
  CYBORG_ELEMENT_IDS,
  CYBORG_LOOK_PROTOCOL_VERSION,
  CYBORG_PROTOCOL_VERSION,
  CYBORG_RESULT_CODES,
  characterLookSchema,
  cyborgAppearanceSchema,
  cyborgElementsSchema,
  cyborgRollSchema,
  cyborgStatsSchema,
  type CyborgResultCode,
  type CyborgRollWire,
} from "./cyborg.ts";
export {
  ITEM_PROTOCOL_VERSION,
  ITEM_RESULT_CODES,
  TREAT_PROTOCOL_VERSION,
  UNPACK_PROTOCOL_VERSION,
  type ItemResultCode,
} from "./items.ts";
export {
  DEV_GRANT_CURRENCY,
  DEV_GRANT_GOODS_MAX,
  FUSION_PROTOCOL_VERSION,
  FUSION_RESULT_CODES,
  GENE_APPLY_MODES,
  GENE_OUTCOMES,
  GENE_PROTOCOL_VERSION,
  GENE_CONVERT_PROTOCOL_VERSION,
  GENE_INCUBATE_LAB_PROTOCOL_VERSION,
  type FusionResultCode,
} from "./fusion.ts";
export {
  ATTACK_PROTOCOL_VERSION,
  WATER_PLACE_PROTOCOL_VERSION,
  FACILITY_PROTOCOL_VERSION,
  FACILITY_RESULT_CODES,
  type FacilityResultCode,
  PLOT_PROTOCOL_VERSION,
  GATHER_TIER_PROTOCOL_VERSION,
  SALE_ONLY_PROTOCOL_VERSION,
  EXCHANGE_PROTOCOL_VERSION,
  OUTSOURCE_PROTOCOL_VERSION,
  STORAGE_PROTOCOL_VERSION,
} from "./facilities.ts";
export {
  RESTORATION_RESULT_CODES,
  RUINS_DEADLINE_CODES,
  RUINS_DEADLINE_PROTOCOL_VERSION,
  RUINS_PROTOCOL_VERSION,
  type RestorationResultCode,
} from "./ruins.ts";
export {
  EXCHANGE_MARKET_PROTOCOL_VERSION,
  LOCKER_PROTOCOL_VERSION,
  FX_PROTOCOL_VERSION,
  FX_RESULT_CODES,
  type FxResultCode,
  MARKET_EXPIRY_DAYS_MAX,
  MARKET_PROTOCOL_VERSION,
  MARKET_RESULT_CODES,
  type MarketResultCode,
} from "./market.ts";
export {
  CITIZENSHIP_PROTOCOL_VERSION,
  NATIONALITY_HOUSE_PROTOCOL_VERSION,
  NATIONALITY_RESULT_CODES,
  NATURALIZE_TERMS_PROTOCOL_VERSION,
  type NationalityResultCode,
  legacyNationalityCode,
} from "./citizenship.ts";
export {
  HOUSE_CITY_MODES,
  HOUSE_CITY_PROTOCOL_VERSION,
  HOUSE_CITY_RESULT_CODES,
  HOUSE_HOME_PROTOCOL_VERSION,
  HOUSE_HOME_NOTICE_PROTOCOL_VERSION,
  HOUSE_ENTRY_POLICY_PROTOCOL_VERSION,
  HOUSE_ENTRY_SCOPES,
  type HouseEntryScope,
  legacyHouseMemberAction,
  legacyHouseMemberCode,
  HOUSE_REGIMES,
  type HouseCityMode,
  type HouseCityResultCode,
  type HouseRegime,
  HOUSE_MEMBER_ACTIONS,
  HOUSE_MEMBER_PROTOCOL_VERSION,
  HOUSE_MEMBER_RESULT_CODES,
  HOUSE_PROTOCOL_VERSION,
  HOUSE_RESULT_CODES,
  type HouseMemberAction,
  type HouseMemberResultCode,
  type HouseResultCode,
} from "./house.ts";
export {
  HOUSE_RECRUIT_PAYERS,
  HOUSE_RECRUIT_PROTOCOL_VERSION,
  HOUSE_RECRUIT_RESULT_CODES,
  type HouseRecruitPayer,
  type HouseRecruitResultCode,
} from "./houseRecruit.ts";
export {
  HOSPITAL_PROTOCOL_VERSION,
  HOSPITAL_RESULT_CODES,
  type HospitalResultCode,
  INJURY_STAGE_MAX,
} from "./hospital.ts";
export {
  TELEPORT_PROTOCOL_VERSION,
  TRAVEL_KINDS,
  TRAVEL_PROTOCOL_VERSION,
  TRAVEL_RESULT_CODES,
  type TravelKind,
  type TravelResultCode,
  UNIT_TACTICS_PRESETS,
  UNIT_TACTICS_PROTOCOL_VERSION,
  UNIT_TACTICS_TARGETS,
} from "./travel.ts";
export { GATHER_PROTOCOL_VERSION, GATHER_RESULT_CODES, type GatherResultCode } from "./gather.ts";
export {
  BOAT_B2_PROTOCOL_VERSION,
  BOAT_PROTOCOL_VERSION,
  BOAT_RESULT_CODES,
  type BoatResultCode,
  HARBOR_ACCESS_VALUES,
  HARBOR_PROTOCOL_VERSION,
  SHIPYARD_MODULE_VALUES,
  CREW_POST_VALUES,
  VOYAGE_PROTOCOL_VERSION,
  HOLD_PROTOCOL_VERSION,
  GEAR_PROTOCOL_VERSION,
  legacyBoatCode,
  legacyGearCode,
  legacyHoldCode,
  legacyVoyageCode,
} from "./boats.ts";
export {
  BUSINESS_PROTOCOL_VERSION,
  BUSINESS_RESULT_CODES,
  BUSINESS_RESERVE_PROTOCOL_VERSION,
  BUSINESS_CARRY_PROTOCOL_VERSION,
  BUSINESS_SHARES_PROTOCOL_VERSION,
  type BusinessResultCode,
} from "./business.ts";
export {
  BATTLE_FORMATIONS,
  BATTLE_LIST_MAX,
  BATTLE_ORDER_PROTOCOL_VERSION,
  BATTLE_ORDER_RESULT_CODES,
  BATTLE_TACTICS,
  type BattleOrder,
  type BattleOrderResultCode,
  type BattleView,
} from "./battleOrder.ts";
export {
  GUARDIAN_BUFF_IDS,
  GUARDIAN_BUFF_PROTOCOL_VERSION,
  TEMPLE_PROTOCOL_VERSION,
  TEMPLE_RESULT_CODES,
  TEMPLE_RITE_IDS,
  type TempleResultCode,
} from "./temple.ts";
export {
  LABOR_ASSIGN_PROTOCOL_VERSION,
  LABOR_JOBS_PROTOCOL_VERSION,
  LABOR_MAP_PROTOCOL_VERSION,
  LABOR_PROTOCOL_VERSION,
  LABOR_RESULT_CODES,
  type LaborResultCode,
} from "./labor.ts";
export {
  BEACON_RESULT_CODES,
  TERRITORY_PROTOCOL_VERSION,
  type BeaconResultCode,
} from "./territory.ts";
export {
  RECRUIT_HOUSE_PROTOCOL_VERSION,
  RECRUIT_PROTOCOL_VERSION,
  RECRUIT_RESULT_CODES,
  legacyRecruitCode,
  recruitHireMessage,
  type RecruitResultCode,
} from "./recruit.ts";
export {
  TERRAIN_CACHE_CONTROL,
  TERRAIN_FORMAT_V1,
  TERRAIN_FORMAT_VERSION,
  TERRAIN_HEADER_BYTES,
  TERRAIN_HEADER_BYTES_V2,
  TERRAIN_NO_WATER,
  TERRAIN_ROUTE,
  TERRAIN_SURFACE,
  decodeTerrain,
  encodeTerrain,
  terrainPath,
  type TerrainData,
} from "./terrain.ts";
export {
  PLANET_FACE_LEVEL_MAX,
  PLANET_FACE_LEVEL_MIN,
  PLANET_MANIFEST_ROUTE,
  PLANET_TILE_CACHE_CONTROL,
  PLANET_TILE_FORMAT_VERSION,
  PLANET_TILE_HEADER_BYTES,
  PLANET_TILE_KEY_PLACEHOLDER,
  PLANET_TILE_MAX_CELLS,
  PLANET_TILE_ROUTE,
  decodePlanetTile,
  encodePlanetTile,
  planetManifestPath,
  planetTileByteLength,
  planetTilePath,
  planetTileUrlTemplate,
  planetTileVersion,
  type PlanetTileData,
} from "./planetTile.ts";
export {
  PLANET_RESOURCE_CACHE_CONTROL,
  PLANET_RESOURCE_FORMAT_VERSION,
  PLANET_RESOURCE_MAX_LEVEL,
  PLANET_RESOURCE_ROUTE,
  decodePlanetResource,
  encodePlanetResource,
  planetResourcePath,
  pmToByte,
  type PlanetResourceData,
} from "./planetResource.ts";
export {
  PLANET_FIELDS_HASH_PATTERN,
  PLANET_ID_PATTERN,
  PLANET_STATUSES,
  canReadPlanetTiles,
  planetBiomeSchema,
  planetManifestSchema,
  type PlanetBiome,
  type PlanetManifest,
  type PlanetStatus,
} from "./planetManifest.ts";
// 보내기(encode.ts)·텔레메트리 상한(telemetryLimits.ts)은 스키마(zod) 없는 모듈에서 바로 내보낸다 — 기기 첫 화면 묶음이
// 이것만 쓰고 zod는 쓰지 않는다(ADR 2026-10-29-app-shell 11절 "첫 화면 줄이기")
export { encodeMessage } from "./encode.ts";
export { decodeClientMessage, decodeServerMessage, ProtocolError, utf8ByteLength } from "./codec.ts";
export { TELEMETRY_LIMITS, TELEMETRY_MAX_BODY_BYTES, TELEMETRY_PATHS, clip } from "./telemetryLimits.ts";
export {
  clientErrorReportSchema,
  perfReportSchema,
  type ClientErrorReport,
  type PerfReport,
} from "./telemetry.ts";
export { TRPC_MAX_BATCH_SIZE, TRPC_PATH } from "./api.ts";
