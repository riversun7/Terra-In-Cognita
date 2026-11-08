// 정부(행정 건물) 판 자료(tRPC world.government) — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도
// 없음"), 기획 46 §2(행정 건물 = 도시의 정부, 구인 카드 D-469)·D-510(행정 건물 = 옛 마을회관). 2차맵에서 행정 건물을 누르면 그 도시와 주인
// 나라(이름·지도자·시장)·세율·행정 레벨·휴먼 수를 보이고, 구인 카드(recruit.board → WebSocket recruit_hire)·창고·거래소로 잇는다.
// 읽기만 한다. 서버가 거른다: 내가 모르는 도시(1차맵 도시 안개와 같은 규칙)의 건물이면 unknown_building(없는 건물과 같은 답).
import type { LocalizedName } from "./roster.ts";

/**
 * ready 정부 판 · not_ready 세계·NPC 사회 런타임 준비 전 · unknown_building 없는 건물이거나 모르는 도시 · not_government 행정 건물이 아니다
 * (또는 도시에 묶이지 않은 행정 건물 — 폐허 복원 중인 정부)
 */
export type GovernmentStatus = "ready" | "not_ready" | "unknown_building" | "not_government";

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

export interface GovernmentResponse {
  readonly status: GovernmentStatus;
  readonly buildingId: number;
  readonly city: GovernmentCity | null;
  readonly nation: GovernmentNation | null;
  readonly leader: GovernmentLeader | null;
  /** 시장(46 §2 시장·관리인, D-5062). 서버에 시장 임명이 아직 없어 늘 null(화면 "없음") — 질문 744 */
  readonly mayor: null;
  readonly generatedAt: number;
}
