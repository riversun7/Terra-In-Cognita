// 프로토콜 버전과 전송 한도 (docs/adr/2026-10-28-time-and-session-protocol.md)

/**
 * 현재 프로토콜 버전. 메시지 형식이나 의미가 바뀌면 올린다.
 * 2: 2차맵 구독·명령·전송 메시지(secondMap.ts, ADR 2026-10-28-s1-second-map.md "구현하며 정한 것 (서버 연결)").
 * 3: 2차맵 시야 전송(S3 ADR 3절) — 남의 유닛은 자른 경로(until)·사라짐(hidden), 탐사 칸(vision), 관리자 전체 보기(observe),
 *    개발 시험 명령(dev_spawn_units).
 * 4: 사이보그 만들기(cyborg.ts, ADR 2026-11-01-first-login-cyborg 4절) — cyborg_roll·cyborg_create → cyborg_result.
 *    더하기만 했다. 3판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 5: 사이보그 속성 분배(D-450, 첫 접속 ADR "바뀜 (D-450~D-453)") — cyborg_create에 elements(5판 연결은 꼭), 한 번 분배
 *    cyborg_elements, 결과 코드 elements_invalid·elements_locked·no_cyborg. 4판 기기의 만들기(elements 없음)는 그대로 받고
 *    "분배 기다림"으로 만든다. 새 코드는 5판 연결에만 간다(4판 기기는 그 코드를 부르는 메시지를 보내지 않는다).
 * 6: 보유 물건(items.ts, docs/adr/2026-11-03-item-holdings.md 5절) — item_equip·item_unequip·item_use·dev_grant_item → item_result.
 *    더하기만 했다. 5판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 7: 영토 비콘(territory.ts, docs/adr/2026-11-03-territory-layer.md 4절) — beacon_place·beacon_remove → beacon_result.
 *    구인 카드 고용(recruit.ts, D-469, docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)") — recruit_hire →
 *    recruit_result. 노동 계약(labor.ts, docs/adr/2026-11-03-labor-contracts.md) — labor_create·labor_terminate·labor_top_up·
 *    labor_set_rent → labor_result. 셋 다 더하기만 했고 한 번에 합쳐 판 하나로 올렸다. 6판 기기는 그대로 받는다(이 메시지를
 *    보내지 않는다).
 */
export const PROTOCOL_VERSION = 7;

/**
 * 서버가 받아주는 가장 낮은 기기 프로토콜 버전. 원칙은 현재 + 직전 1개 지원이다(ADR 7). 5부터 3판 기기는 인사에서
 * protocol_unsupported를 받고 새 앱을 받는다(PWA 강제 적용). 6부터 4판 기기도, 7부터 5판 기기도 같다(현재 + 직전 1개).
 * (3에서는 예외로 2를 받지 않았다: 2판 기기는 걸러지지 않은 2차맵 흐름을 기대하는데, 시야 전송은 보안 규칙이라 그 흐름을 남기지
 * 않는다, S3 ADR 3절.)
 * 속성 분배 전 사이보그(elements null)는 이제 기기가 만들지 않는다(5판부터 만들기에 분배가 꼭 든다). 화면 시험의 legacy 계정은
 * 지금 판으로 만든 뒤 서버를 끄고 DB에서 속성값을 비워 다시 켠다(e2e/global-setup.ts).
 */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 6;

/** WebSocket 메시지 1개의 최대 크기 (바이트) */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** 연결 유지 확인 간격 (ms) — 프록시 유휴 끊김 방지 */
export const HEARTBEAT_INTERVAL_MS = 25_000;

export function isProtocolSupported(version: number): boolean {
  return (
    Number.isInteger(version) && version >= MIN_SUPPORTED_PROTOCOL_VERSION && version <= PROTOCOL_VERSION
  );
}
