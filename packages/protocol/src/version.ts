// 프로토콜 버전과 전송 한도 (docs/adr/2026-10-28-time-and-session-protocol.md)

/**
 * 현재 프로토콜 버전. 메시지 형식이나 의미가 바뀌면 올린다.
 * 2: 2차맵 구독·명령·전송 메시지(secondMap.ts, ADR 2026-10-28-s1-second-map.md "구현하며 정한 것 (서버 연결)").
 */
export const PROTOCOL_VERSION = 2;

/**
 * 서버가 받아주는 가장 낮은 기기 프로토콜 버전 (현재 + 직전 1개 지원 원칙).
 * 1로 인사한 기기는 2차맵 메시지를 보내지 않으므로(1에는 없다) 새 서버 메시지도 받지 않는다.
 * 1로 인사한 연결이 2차맵 메시지를 보내면 서버는 invalid_message로 거절한다.
 */
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
