// 구인 카드 화면 자료(tRPC recruit.board) — 기획 D-469(출생 없음, 인구는 정부기관(행정 건물) 구인 카드로만), 49 N45,
// docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)". 고용은 WebSocket recruit_hire(프로토콜 7)다.
// 서버(src/recruit/service.ts)와 개발자 구인 화면(/dev/recruit)이 같이 쓴다. 값(화폐)은 최소 단위 10진 문자열이다.
import type { PrimaryStat } from "./roster.ts";

/** 구인 휴먼 속성: 기본 4원소(D-450, 빛·어둠은 구인 카드에 없다) */
export const RECRUIT_ELEMENTS = ["water", "fire", "wind", "earth"] as const;
export type RecruitElement = (typeof RECRUIT_ELEMENTS)[number];

/** 카드 한 장 */
export interface RecruitCardView {
  /** 그 창 안의 자리(고용 명령이 보낸다) */
  readonly slot: number;
  /** 행정 건물 레벨(옛 등급) */
  readonly level: number;
  readonly total: number;
  readonly stats: Readonly<Record<PrimaryStat, number>>;
  readonly elements: Readonly<Record<RecruitElement, number>>;
  /** 도시 화폐 최소 단위 */
  readonly cost: string;
  /** 이 창에 이미 산 카드 */
  readonly taken: boolean;
}

/** 구인할 수 있는 도시(NPC 사회 런타임의 도시) */
export interface RecruitCityView {
  readonly id: number;
  /** 행정 건물 레벨 1~5 */
  readonly adminLevel: number;
  /** 도시 주인 세력 코드(없으면 null) */
  readonly factionCode: string | null;
  /** 기본 NPC 국가의 시작 도시(D-341) */
  readonly start: boolean;
  /** 그 도시 휴먼 수·주거 수(NPC 구인 목표) */
  readonly population: number;
  readonly housing: number;
}

export interface RecruitBoardResponse {
  /** 고른 도시(없으면 null: 구인할 수 있는 도시가 없다) */
  readonly cityId: number | null;
  readonly cities: readonly RecruitCityView[];
  /** 갱신 창 번호(고용 명령이 보낸다)·다음 갱신 시각·갱신 주기 */
  readonly window: number;
  readonly endsAtMs: number;
  readonly refreshMs: number;
  /** 그 도시 행정 건물 레벨 */
  readonly level: number;
  /** 내가 보는 카드(고용 주체 = 나) */
  readonly cards: readonly RecruitCardView[];
  /** 내 도시 화폐 잔고(최소 단위) */
  readonly balance: string;
  /** 사이보그가 있는가(고용한 휴먼의 소유자 = 사이보그, D-469. 없으면 고용할 수 없다) */
  readonly hasCyborg: boolean;
  /** 가문에 들어 있나(D-565 — 유닛을 고용하려면 가문이 있어야 한다). 옛 서버는 보내지 않는다(없으면 막지 않은 것으로 본다) */
  readonly hasHouse?: boolean | undefined;
  /** dev·admin만: 그 도시 주인(NPC 세력)이 지금 창에 보는 카드와 산 칸. 아니면 null */
  readonly owner: { readonly cards: readonly RecruitCardView[] } | null;
  readonly generatedAt: number;
}
