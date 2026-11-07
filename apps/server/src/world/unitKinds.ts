// 월드 유닛 종류 코드(world_units.kind) — S3 시험용 [임시]. 실제 유닛 종(콘텐츠 팩)이 생기면 그 ID로 바꾼다.
// 저장된 값이라 번호를 바꾸거나 다시 쓰지 않는다.

/** 시험 NPC 세력이 움직이는 봇(S1_TEST_BOTS) */
export const UNIT_KIND_BOT = 0;
/** 시험 일꾼(개발자 시험 명령으로 받는 유닛, 정산 직무를 한다) */
export const UNIT_KIND_WORKER = 1;
/** 관리자 시험 유닛(addUnit, 스스로 움직이지 않는다) */
export const UNIT_KIND_TEST = 2;

/** S3 시험 NPC 세력 코드(factions.code) */
export const TEST_NPC_FACTION_CODE = "s3_test_npc";
/** 사이보그 본체(플레이어 하나에 하나, docs/adr/2026-11-01-first-login-cyborg.md 2절). 보유 유닛 수·유지비에 넣지 않는다 */
export const UNIT_KIND_CYBORG = 3;
/**
 * 유저가 정부기관 구인 카드로 고용한 휴먼(D-469, src/recruit/service.ts). 레벨·스탯·속성·수명은 world_humans 행이다.
 * NPC 나라의 휴먼은 시험 봇(0)이다
 */
export const UNIT_KIND_HUMAN = 4;
/**
 * 사이보그 유닛(D-470): 유저가 휴먼 + 기계 부품을 융합해 만든 유닛(src/fusion/service.ts). 바탕 휴먼의 유닛 ID를 그대로 쓰고
 * 종류만 4 → 5로 바뀐다. 레벨·스탯·속성은 cyborg_units 행이다. 수명이 없고 유지비가 비싸다(설정 칸 n46_upkeep)
 */
export const UNIT_KIND_CYBORG_UNIT = 5;
