// 실시간 프로토콜 진입점 — 기기·서버가 같은 정의를 쓴다.
// 의미를 바꾸면 PROTOCOL_VERSION을 올리고 ADR을 남긴다 (docs/PROTECTED.md).
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
  UNIT_SIZE_CLASSES,
  buildingSchema,
  unitMotionSchema,
  type BuildingWire,
  type ResultCode,
  type UnitMotionWire,
} from "./secondMap.ts";
export {
  TERRAIN_CACHE_CONTROL,
  TERRAIN_FORMAT_VERSION,
  TERRAIN_HEADER_BYTES,
  TERRAIN_ROUTE,
  TERRAIN_SURFACE,
  decodeTerrain,
  encodeTerrain,
  terrainPath,
  type TerrainData,
} from "./terrain.ts";
export {
  encodeMessage,
  decodeClientMessage,
  decodeServerMessage,
  ProtocolError,
  utf8ByteLength,
} from "./codec.ts";
export {
  TELEMETRY_LIMITS,
  TELEMETRY_MAX_BODY_BYTES,
  TELEMETRY_PATHS,
  clientErrorReportSchema,
  perfReportSchema,
  clip,
  type ClientErrorReport,
  type PerfReport,
} from "./telemetry.ts";
export { TRPC_PATH } from "./api.ts";
