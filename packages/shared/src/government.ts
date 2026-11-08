// 정부(행정 건물) 판 자료(tRPC world.government) — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도
// 없음"), 기획 46 §2(행정 건물 = 도시의 정부, 구인 카드 D-469)·D-510(행정 건물 = 옛 마을회관). 2차맵에서 행정 건물을 누르면 그 도시와 주인
// 나라(이름·지도자·시장)·세율·행정 레벨·휴먼 수를 보이고, 구인 카드(recruit.board → WebSocket recruit_hire)·창고·거래소로 잇는다.
// 읽기만 한다. 서버가 거른다: 내가 모르는 도시(1차맵 도시 안개와 같은 규칙)의 건물이면 unknown_building(없는 건물과 같은 답).
import type { LocalizedName, PrimaryStat } from "./roster.ts";

/**
 * ready 정부 판 · not_ready 세계·NPC 사회 런타임 준비 전 · unknown_building 없는 건물이거나 모르는 도시 · not_government 행정 건물이 아니다
 * (또는 도시에 묶이지 않은 행정 건물 — 폐허 복원 중인 정부) · unknown_unit 지도자로 물었는데 그 유닛이 지금 내 시야 밖이거나 없거나 지도자가
 * 아니다(셋을 나누지 않는다 — 시야 밖 유닛이 있는지 새지 않게, world.leaderGovernment)
 */
export type GovernmentStatus = "ready" | "not_ready" | "unknown_building" | "not_government" | "unknown_unit";

/**
 * 정부 판의 도시 하루 값(기획 정리 743 나 — docs/adr/2026-11-07-play-flow.md "WP-NPC3"). 서버가 이미 셈하는 값을 읽기만 한다(새 규칙 없음):
 * NPC 사회 런타임 하루 끝(만족도·발전도)과 도시 경제 정시 유지비(생필품). 값이 없으면 null(화면 "—")
 */
export interface GovernmentCityDay {
  /** 그 도시 휴먼 평균 만족도 0~100(하루 끝마다 목표값으로 다가감, D-433). 휴먼이 없으면 null */
  readonly satisfaction: number | null;
  /** 발전도 0~100(하루 끝마다, [임시] 만족도·인구·연구 시설로 계산 — D-254 7요소 전) */
  readonly development: number;
  /**
   * 오늘 생필품 충족 ‰(0~1000, 도시 경제가 정시 유지비마다 셈 — 낼 몫 중 낸 몫, 하루 끝 만족도의 포만감, D-438 5). 도시 경제가 돌지 않거나
   * 오늘 아직 셈 전이면(UTC 0시 뒤 첫 정시 전) null
   */
  readonly necessitiesPm: number | null;
}

/** 정부 판의 도시 */
export interface GovernmentCity {
  readonly id: number;
  /** 도시 이름(번역 안 함 D-476). 없으면 null(화면은 "도시 #ID") */
  readonly name: string | null;
  readonly mapKey: string;
  /** 기본 NPC 국가의 시작 도시(주인이 바뀌지 않는다, D-341) */
  readonly start: boolean;
  /** 그 국가의 수도(그 국가의 가장 작은 ID 시작 도시 — 지도자가 서는 곳, [임시]) */
  readonly capital: boolean;
  /** 행정 건물 레벨 1~5(구인 카드 수·토탈 범위, D-469) */
  readonly adminLevel: number;
  /** 그 도시 휴먼 수(NPC 사회 런타임 거울 세계)·주거 수 */
  readonly humans: number;
  readonly housing: number;
  /** 도시 하루 값(만족도·발전도·생필품 충족, 743 나) */
  readonly day: GovernmentCityDay;
}

/** 정부 판의 주인 나라 */
export interface GovernmentNation {
  readonly id: number;
  readonly code: string | null;
  /** 화면 이름(팩 국가 프리셋). 없으면 null(화면은 코드) */
  readonly name: LocalizedName | null;
  /** 고정 NPC 국가(D-324) */
  readonly fixed: boolean;
  /** 내가 든 나라인가(사이보그를 만들 때 고른 나라) */
  readonly mine: boolean;
  /** 거래세(만분율, 그 나라 지금 세율 — NPC 세율 규칙식이 바꾼다). 도시 경제가 돌지 않으면 null */
  readonly taxBp: number | null;
}

/** 정부 판의 지도자(NPC 국가 지도자 사이보그) */
export interface GovernmentLeader {
  /** 지도자 유닛(지도의 한눈 정보와 같은 유닛) */
  readonly unitId: number;
  /** 팩 국가 프리셋 leaderName. 없으면 null(화면은 "지도자") */
  readonly name: LocalizedName | null;
  /** 이 도시 2차맵에 있나(아니면 화면은 "수도에 있음" — 지도자는 수도 행정 건물 곁에 선다) */
  readonly here: boolean;
}

/**
 * 정부 판의 시장(46 §2 시장, 기획 답 744 나): NPC 도시는 그 도시 휴먼 가운데 하나를 서버가 자동으로 고른다 [임시 규칙: INT + WIS → 스탯 합 →
 * 작은 유닛 ID, 떠나거나 죽으면 다시 고름]. 휴먼에게 이름이 아직 없어 화면은 "휴먼 #유닛 ID"로 부른다
 */
export interface GovernmentMayor {
  readonly unitId: number;
  /** 레벨(구인 카드 휴먼은 그 레벨, 처음부터 있던 휴먼은 1) */
  readonly level: number;
  /** 1차 스탯. baseline이면 저장된 스탯이 없어 [임시] 기본값(모두 10 — 유닛 화면 기본 스탯과 같다) */
  readonly stats: Readonly<Record<PrimaryStat, number>>;
  readonly baseline: boolean;
  /** 만족도(0~100, D-219) */
  readonly satisfaction: number;
}

export interface GovernmentResponse {
  readonly status: GovernmentStatus;
  readonly buildingId: number;
  readonly city: GovernmentCity | null;
  readonly nation: GovernmentNation | null;
  readonly leader: GovernmentLeader | null;
  /** 행정 건물 기준 칸(그 도시 2차맵 배치 칸 — 지도가 그곳으로 카메라를 옮길 때). 모르면 null */
  readonly building: { readonly x: number; readonly y: number } | null;
  /** 시장(46 §2 시장·관리인, D-5062). NPC 도시는 서버가 자동 지정(744 나). 없으면 null(화면 "없음" — 휴먼이 없는 도시) */
  readonly mayor: GovernmentMayor | null;
  readonly generatedAt: number;
}
