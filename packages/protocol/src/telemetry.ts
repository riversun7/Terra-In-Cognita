// 기기 → 서버 관측 보고(텔레메트리) 형식 — HTTP POST로 보낸다. 게임 상태는 바꾸지 않는다 (PLAN 9.5).
// WebSocket 메시지가 아니라서 PROTOCOL_VERSION과 무관하다. 기기·서버가 같은 정의를 쓴다.
// 길이 상한은 서버가 받는 기준이자 기기가 보내기 전에 자르는 기준이다.
import { z } from "zod";

export const TELEMETRY_LIMITS = {
  build: 64,
  message: 2_000,
  stack: 8_000,
  page: 512,
} as const;

/** 보고 1건의 본문 상한(바이트) — 서버의 bodyLimit */
export const TELEMETRY_MAX_BODY_BYTES = 16 * 1024;

export const TELEMETRY_PATHS = {
  errors: "/api/telemetry/errors",
  perf: "/api/telemetry/perf",
} as const;

const build = z.string().min(1).max(TELEMETRY_LIMITS.build);
const page = z.string().max(TELEMETRY_LIMITS.page).optional();
/** 0 이상, 상한 이하의 유한한 수 (NaN·Infinity는 JSON에서 null이 되므로 여기서 걸러진다) */
const amount = (max: number) => z.number().nonnegative().max(max);
const count = (max: number) => z.number().int().nonnegative().max(max);

/** 기기 오류 1건 — window의 error·unhandledrejection 이벤트 */
export const clientErrorReportSchema = z.object({
  clientBuild: build,
  kind: z.enum(["error", "rejection"]),
  message: z.string().max(TELEMETRY_LIMITS.message),
  stack: z.string().max(TELEMETRY_LIMITS.stack).optional(),
  page,
});
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

/** 성능 요약 1건 — 화면이 보이는 동안 일정 구간마다 (S1 측정 기준: 프레임 시간 p95, 메모리) */
export const perfReportSchema = z.object({
  clientBuild: build,
  page,
  /** 측정 구간 길이(초) */
  windowSec: amount(600),
  frames: count(1_000_000),
  fps: amount(1_000),
  frameP50Ms: amount(60_000),
  frameP95Ms: amount(60_000),
  frameMaxMs: amount(60_000),
  /** 50ms를 넘긴 프레임 수 */
  longFrames: count(1_000_000),
  /** JS 힙 사용량(MB). 크롬 계열에서만 읽힌다 */
  memoryMb: amount(1_000_000).optional(),
  device: z.object({
    screenW: count(100_000),
    screenH: count(100_000),
    dpr: amount(16),
    cores: count(1_024).optional(),
    /** navigator.deviceMemory (GB, 크롬 계열) */
    memoryGb: amount(1_024).optional(),
    /** navigator.connection.effectiveType (예: 4g) */
    connection: z.string().max(16).optional(),
  }),
});
export type PerfReport = z.infer<typeof perfReportSchema>;

/** 문자열을 상한 길이로 자른다 (기기에서 보내기 전에 쓴다) */
export function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}
