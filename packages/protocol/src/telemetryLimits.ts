// 텔레메트리 상한·경로·자르기 — 기기가 보내기 전에 자르는 기준이자 서버가 받는 기준(형식은 telemetry.ts).
// 따로 둔 이유: 기기의 보고 모듈(첫 화면 묶음)은 이 값만 쓴다. 스키마(zod)와 한 파일이면 zod 전체가 첫 화면에 들어온다
// (errors.ts와 같은 까닭, ADR 2026-10-29-app-shell 11절 "첫 화면 줄이기").

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

/** 문자열을 상한 길이로 자른다 (기기에서 보내기 전에 쓴다) */
export function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}
