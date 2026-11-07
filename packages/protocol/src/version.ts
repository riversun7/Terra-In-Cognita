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
 * 8: 구인 게시(labor.ts, docs/adr/2026-11-03-labor-contracts.md "바뀜 (기획 338~342·구인 게시판)") — labor_post_job·
 *    labor_withdraw_job·labor_accept_job → labor_result(jobId, 결과 코드 job_not_open·employer_insufficient_funds).
 *    더하기만 했다. 7판 기기는 그대로 받는다(이 메시지를 보내지 않고, 새 코드는 이 메시지에만 간다).
 * 9: 개발 시험 병원 치료(items.ts, D-514 — 병원 시설이 생기기 전 규칙 고리) — dev_treat_unit → item_result. 사이보그 유닛 융합·유전자
 *    환생(fusion.ts, docs/adr/2026-11-07-cyborg-fusion-genes.md) — cyborg_fuse·unit_rebirth·dev_grant_goods → fusion_result. 둘 다
 *    더하기만 했고 한 번에 합쳐 판 하나로 올렸다. 8판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 10: 건물 짓기·레벨업·수리·장비 수리(facilities.ts, docs/adr/2026-11-07-buildings-runtime.md) — facility_build·facility_upgrade·
 *    facility_repair·equipment_repair·dev_facility_grant·dev_facility_finish → facility_result. 영토 비콘 놓기에 재료가 들어
 *    beacon_result에 insufficient_materials가 생겼다(10판 연결에만 간다, 9판은 forbidden). 9판 기기는 그대로 받는다.
 * 11: 유전자(fusion.ts, docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)") — 유전자 환생 unit_rebirth를 뺐다(D-516 "무작위 +1은
 *    불가능", 10판 기기가 보내면 invalid_message). gene_synthesize·gene_inject·gene_incubate·dev_grant_gene·dev_expire_unit을 더했고
 *    fusion_result의 결과 코드(alive·insufficient_genes를 빼고 unknown_gene 등을 더함)와 성공 칸(shards를 빼고 gene·genes·outcome·
 *    total·skill)이 바뀌었다. 창고 옮기기(facilities.ts storage_move, docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)") →
 *    facility_result(새 코드 not_storage·storage_full·no_place는 이 판 메시지의 답에만 간다), dev_facility_grant에 짓는 자리 칸
 *    (mapKey·x·y, 선택). 두 줄기를 배포 전에 합쳐 한 판으로 올렸다.
 * 12: 건물·영토 비콘 공격(facilities.ts facility_attack, 질문 381, docs/adr/2026-11-07-buildings-runtime.md "바뀜 (전투·건물)") →
 *    facility_result(doneAtMs = 전투 결과 적용 시각, 새 코드 own_target·target_ruined·out_of_reach·safe_zone은 이 메시지의 답에만 간다).
 *    신전·종교(temple.ts, docs/adr/2026-11-07-temple-religion.md, D-517) — temple_pray·temple_offer·temple_rite·dev_inactivate_unit →
 *    temple_result. 비활성 휴먼 유전자 변환(fusion.ts gene_convert → fusion_result, 새 코드 not_inactive·not_lab·lab_closed·wrong_city는
 *    이 판 메시지의 답에만 간다). 두 줄기를 배포 전에 합쳐 한 판으로 올렸다. 더하기만 했고 11판 기기는 그대로 받는다.
 * 13: 폐허 복원(ruins.ts, docs/adr/2026-11-07-ruins-restoration.md, D-510) — restoration_open·restoration_fund·dev_make_ruin →
 *    restoration_result. 행정 건물(시설 단계 government) 짓기의 facility_result 새 코드 not_ruin·ruin_claimed는 13판 연결에만 가고
 *    더 낮은 판은 not_buildable을 받는다. 신전 2(docs/adr/2026-11-07-temple-religion.md "바뀜 (기획 답 451~459)") — 생명과학 연구소
 *    인큐베이터(fusion.ts gene_incubate에 연구소 칸 buildingId·cost, 칸이 없으면 판 11 그대로 개발 시험)·개발 편집 수호신 버프
 *    (temple.ts dev_guardian_buff → temple_result). 두 줄기를 배포 전에 합쳐 한 판으로 올렸다. 더하기만 했고 12판 기기는 그대로 받는다.
 * 14: 직무 배치(labor.ts labor_assign·labor_unassign → labor_result, docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산") — 내 유닛을 내 채집
 *    시설에 돈 없이 둔다(새 결과 코드 not_workplace·facility_full·not_assigned는 이 메시지의 답에만 간다). 물자 거래소(market.ts, 같은 ADR
 *    "WP4 도시 경제·거래소") — market_place·market_cancel·market_watch → market_result, 체결 알림 market_fill(알림을 켠 연결에만). 두 줄기를
 *    배포 전에 합쳐 한 판으로 올렸다. 더하기만 했고 13판 기기는 그대로 받는다(이 메시지를 보내지 않는다).
 * 15: 환전(market.ts fx_place·fx_cancel → fx_result, docs/adr/2026-11-07-play-flow.md "WP6 나라 화폐·체결 알림") — 나라 화폐 ↔ 기준 통화
 *    동시호가에 주문 내기·회차 전 거두기. 더하기만 했고 14판 기기는 그대로 받는다(이 메시지를 보내지 않는다). 거래소 값이 나라 화폐가 되어
 *    market_* 메시지의 값은 그 도시 화폐 최소 단위다(모양은 같다).
 */
export const PROTOCOL_VERSION = 15;

/**
 * 서버가 받아주는 가장 낮은 기기 프로토콜 버전. 원칙은 현재 + 직전 1개 지원이다(ADR 7). 5부터 3판 기기는 인사에서
 * protocol_unsupported를 받고 새 앱을 받는다(PWA 강제 적용). 6부터 4판 기기도, 7부터 5판 기기도, 8부터 6판 기기도, 9부터 7판 기기도,
 * 10부터 8판 기기도, 11부터 9판 기기도, 12부터 10판 기기도, 13부터 11판 기기도, 14부터 12판 기기도, 15부터 13판 기기도 같다(현재 + 직전 1개).
 * (3에서는 예외로 2를 받지 않았다: 2판 기기는 걸러지지 않은 2차맵 흐름을 기대하는데, 시야 전송은 보안 규칙이라 그 흐름을 남기지
 * 않는다, S3 ADR 3절.)
 * 속성 분배 전 사이보그(elements null)는 이제 기기가 만들지 않는다(5판부터 만들기에 분배가 꼭 든다). 화면 시험의 legacy 계정은
 * 지금 판으로 만든 뒤 서버를 끄고 DB에서 속성값을 비워 다시 켠다(e2e/global-setup.ts).
 */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 14;

/** WebSocket 메시지 1개의 최대 크기 (바이트) */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** 연결 유지 확인 간격 (ms) — 프록시 유휴 끊김 방지 */
export const HEARTBEAT_INTERVAL_MS = 25_000;

export function isProtocolSupported(version: number): boolean {
  return (
    Number.isInteger(version) && version >= MIN_SUPPORTED_PROTOCOL_VERSION && version <= PROTOCOL_VERSION
  );
}
