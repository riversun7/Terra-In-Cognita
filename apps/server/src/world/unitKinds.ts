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
 * 옛 수호신 종류 코드(기획 답 456 가 — 2026-11-07부터 신격화한 휴먼이 4 → 6으로 바뀌었다). 유닛 종류는 넷으로 고정이라(사용자 결정 2026-11-22, 기획
 * D-589 — 기반 D-018) 수호신은 종류가 아니라 휴먼(4)의 상태다(isGuardianUnit). 새로 쓰지 않는다. 마이그레이션 `guardian_state`가 옛 행을 휴먼 +
 * 수호신 칸으로 바꿨고, 직전 판 앱이 배포 사이에 다시 쓴 6은 부팅(persist/load.ts loadWorld)이 같은 문장으로 바꾼다. 다음 배포에서 그 문장을 지운다. 번호는 다시 쓰지 않는다
 */
export const LEGACY_UNIT_KIND_GUARDIAN = 6;
/**
 * 수호신 상태인가(D-311·D-5059·D-589): 신전에서 신격화한 유저 휴먼(종류 4 그대로, world_units.guardian 칸). 레벨·스탯·속성·도시·버프는
 * temple_guardians 행이다. 그 도시에 머물며(주인이 옮기지 못한다) 그 도시가 공격받는 전투에 수비로 들고, 일하지 않는다. 수명이 없다(휴먼 행을 지운다)
 */
export function isGuardianUnit(info: { readonly guardian?: boolean | undefined } | undefined): boolean {
  return info?.guardian === true;
}
/**
 * NPC 국가 지도자 사이보그(기획 46 §10.1 "NPC 지도자", 30 §5.3 대표 유닛 D-075 — docs/adr/2026-11-07-play-flow.md "WP-NPC"). 고정 NPC 국가마다
 * 하나, 주인 = 그 국가 소유 주체, 수도(그 국가의 가장 작은 ID 시작 도시) 행정 건물 앞에 선다(src/npc/leaders.ts). 스스로 움직이지 않는다
 * (봇이 아니다). 이름은 저장하지 않고 팩 국가 프리셋 leaderName에서 읽는다
 */
export const UNIT_KIND_NPC_LEADER = 7;
/**
 * 배(docs/adr/2026-11-13-boats.md 1절, 기획 D-540): 부두에서 만든 물 위 유닛. 영역 sea, 크기 등급 2, 빠르기 = 설정 칸 boat_speed(이동을 시작할 때 읽는다 —
 * D-541 1272). 물 격자로만 다니고 유닛을 태운다(승객 = world_units.aboard_id). 직무는 없고 유지비는 설정 칸 boat_upkeep_pm(D-541 1277 다)
 */
export const UNIT_KIND_BOAT = 8;

/**
 * 물 위에 있나: 배이거나 배에 탄 유닛(승객). B1·B2에서는 전투에서 뺀다(기획 D-541 1278 가 — 해상 전투는 따로 정한다, 승객도 땅 전투에 닿지 않는다).
 * docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)"
 */
export function isAfloat(
  info: { readonly kind: number; readonly aboard?: number | undefined } | undefined,
): boolean {
  return info !== undefined && (info.kind === UNIT_KIND_BOAT || info.aboard !== undefined);
}

/**
 * 보유 유닛 수(주거 상한 D-153 — 사이보그 판의 유닛 수, roster/worldUnits.ts)에 드는 종류인가: 사이보그 본체(D-445 178)와 배(기획 D-542 1326 나 —
 * 배는 사람이 아니다)는 빠진다. 배 유지비는 그대로 설정 칸 boat_upkeep_pm(D-541 1277 다)으로 낸다(world/upkeepWeights.ts)
 */
export function countsAsOwnedUnit(kind: number): boolean {
  return kind !== UNIT_KIND_CYBORG && kind !== UNIT_KIND_BOAT;
}

/**
 * 탈것으로 보이는 기본 빠르기(고정소수점 단위/초): 걷기(437 = 약 0.43칸/초)와 차(4,813 = 약 4.8칸/초) 사이, 2칸/초. 유닛의 기본 빠르기(UnitState.speed)로
 * 본다 — 움직임 빠르기(운영자 모드 이동은 100배, operatorPace.ts OPERATOR_SPEED_FACTOR)로 보지 않는다(사용자 지적 2026-11-12 "내 사이보그도 갑자기 기존
 * 노란원통 모델로 돌아가는 문제", docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 유닛 겉모습)")
 */
export const VEHICLE_MIN_SPEED = 2_000;

/**
 * 세계 유닛 종류(+ 기본 빠르기) → 2차맵 전송의 표시 종류(프로토콜 18 unitMotionSchema kind, docs/adr/2026-11-07-play-flow.md "WP-NPC3", 기획 정리 748 나).
 * 지도에 따로 그리는 유닛만: NPC 국가 지도자(이름표·지도자 표시), 탈것(기본 빠르기가 차 빠르기인 봇 — 기기가 탈것 모양으로 그린다). 나머지는
 * undefined(칸을 보내지 않는다). 사이보그·휴먼 등 사람은 빠르기와 상관없이 탈것이 아니다
 */
export function wireKindOf(kind: number, speed = 0): UnitWireKind | undefined {
  if (kind === UNIT_KIND_NPC_LEADER) return "npc_leader";
  if (kind === UNIT_KIND_BOAT) return "boat";
  return kind === UNIT_KIND_BOT && speed >= VEHICLE_MIN_SPEED ? "vehicle" : undefined;
}
