// 프로토콜 버전과 전송 한도 (docs/adr/2026-10-28-time-and-session-protocol.md)

/**
 * 현재 프로토콜 버전. 메시지 형식이나 의미가 바뀌면 올린다.
 * 2: 2차맵 구독·명령·전송 메시지(secondMap.ts, ADR 2026-10-28-s1-second-map.md "구현하며 정한 것 (서버 연결)").
 * 3: 2차맵 시야 전송(S3 ADR 3절) — 남의 유닛은 자른 경로(until)·사라짐(hidden), 탐사 칸(vision), 관리자 전체 보기(observe),
 *    개발 시험 명령(dev_spawn_units).
 */
export const PROTOCOL_VERSION = 3;

/**
 * 서버가 받아주는 가장 낮은 기기 프로토콜 버전. 원칙은 현재 + 직전 1개 지원이다(ADR 7).
 * 3에서 예외로 2를 받지 않는다: 2판 기기는 걸러지지 않은 2차맵 흐름(남의 경로 전체)을 기대하는데, 시야 전송은 보안 규칙이라
 * 그 흐름을 남기지 않는다(S3 ADR 3절). 2판 기기는 인사에서 protocol_unsupported를 받고 새 앱을 받는다(PWA 강제 적용).
 */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 3;

/** WebSocket 메시지 1개의 최대 크기 (바이트) */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** 연결 유지 확인 간격 (ms) — 프록시 유휴 끊김 방지 */
export const HEARTBEAT_INTERVAL_MS = 25_000;

export function isProtocolSupported(version: number): boolean {
  return (
    Number.isInteger(version) && version >= MIN_SUPPORTED_PROTOCOL_VERSION && version <= PROTOCOL_VERSION
  );
}
