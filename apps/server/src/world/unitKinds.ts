// 월드 유닛 종류 코드(world_units.kind) — S3 시험용 [임시]. 실제 유닛 종(콘텐츠 팩)이 생기면 그 ID로 바꾼다.
// 저장된 값이라 번호를 바꾸거나 다시 쓰지 않는다.
import type { UnitWireKind } from "@terra/protocol";

/** 시험 NPC 세력이 움직이는 봇(S1_TEST_BOTS) */
export const UNIT_KIND_BOT = 0;
/**
 * 없앤 시험 일꾼(옛 개발 시험 명령 dev_spawn_units로 받던 유닛 — 사용자 지적 2026-11-09 "시험일꾼 다 없애라고"). 새로 만들지 않는다.
 * 남은 옛 행은 부팅이 지운다(world/retireOldWorkers.ts). 번호는 다시 쓰지 않는다
 */
export const UNIT_KIND_OLD_WORKER = 1;
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
/**
 * 수호신(기획 답 456 가, D-311·D-5059): 신전에서 신격화한 유저 휴먼. 바탕 휴먼의 유닛 ID를 그대로 쓰고 종류만 4 → 6으로 바뀐다(융합과 같은 꼴).
 * 레벨·스탯·속성·도시·버프는 temple_guardians 행이다. 그 도시에 머물며(주인이 옮기지 못한다) 그 도시가 공격받는 전투에 수비로 들고, 일하지
 * 않는다. 수명이 없다
 */
export const UNIT_KIND_GUARDIAN = 6;
/**
 * NPC 국가 지도자 사이보그(기획 46 §10.1 "NPC 지도자", 30 §5.3 대표 유닛 D-075 — docs/adr/2026-11-07-play-flow.md "WP-NPC"). 고정 NPC 국가마다
 * 하나, 주인 = 그 국가 소유 주체, 수도(그 국가의 가장 작은 ID 시작 도시) 행정 건물 앞에 선다(src/npc/leaders.ts). 스스로 움직이지 않는다
 * (봇이 아니다). 이름은 저장하지 않고 팩 국가 프리셋 leaderName에서 읽는다
 */
export const UNIT_KIND_NPC_LEADER = 7;

/**
 * 세계 유닛 종류 → 2차맵 전송의 표시 종류(프로토콜 18 unitMotionSchema kind, docs/adr/2026-11-07-play-flow.md "WP-NPC3", 기획 정리 748 나).
 * 지도에 따로 그리는 유닛만(지금은 NPC 국가 지도자 — 이름표·지도자 표시), 나머지는 undefined(칸을 보내지 않는다)
 */
export function wireKindOf(kind: number): UnitWireKind | undefined {
  return kind === UNIT_KIND_NPC_LEADER ? "npc_leader" : undefined;
}
