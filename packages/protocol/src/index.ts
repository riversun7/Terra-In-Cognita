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
  type ServerMessage,
} from "./messages.ts";
export { encodeMessage, decodeClientMessage, decodeServerMessage, ProtocolError } from "./codec.ts";
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
