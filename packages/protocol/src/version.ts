// 프로토콜 버전과 전송 한도 (docs/adr/2026-10-28-time-and-session-protocol.md)

/** 현재 프로토콜 버전. 메시지 형식이나 의미가 바뀌면 올린다. */
export const PROTOCOL_VERSION = 1;

/** 서버가 받아주는 가장 낮은 기기 프로토콜 버전 (현재 + 직전 1개 지원 원칙) */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 1;

/** WebSocket 메시지 1개의 최대 크기 (바이트) */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** 연결 유지 확인 간격 (ms) — 프록시 유휴 끊김 방지 */
export const HEARTBEAT_INTERVAL_MS = 25_000;

export function isProtocolSupported(version: number): boolean {
  return (
    Number.isInteger(version) && version >= MIN_SUPPORTED_PROTOCOL_VERSION && version <= PROTOCOL_VERSION
  );
}
