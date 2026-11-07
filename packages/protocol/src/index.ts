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
  MAX_UNIT_SPEED,
  POSITION_UNITS_PER_CELL,
  RESULT_CODES,
  S1_TEST_MAP_KEY,
  SECOND_MAP_CELLS,
  SECOND_MAP_PROTOCOL_VERSION,
  SECOND_MAP_UNITS,
  VISION_BYTES,
  MAX_DEV_SPAWN_UNITS,
  UNIT_SIZE_CLASSES,
  buildingSchema,
  unitMotionSchema,
  type BuildingWire,
  type ResultCode,
  type UnitMotionWire,
} from "./secondMap.ts";
export {
  CYBORG_ELEMENTS_PROTOCOL_VERSION,
  CYBORG_ELEMENT_IDS,
  CYBORG_PROTOCOL_VERSION,
  CYBORG_RESULT_CODES,
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
  type ItemResultCode,
} from "./items.ts";
export {
  LABOR_JOBS_PROTOCOL_VERSION,
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
  RECRUIT_PROTOCOL_VERSION,
  RECRUIT_RESULT_CODES,
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
