// 사는 곳(거주지) 조회 응답 — 사용자 답 D-585 1(플레이어·유닛은 집을 여럿 가질 수 있지만 사는 곳은 하나만 고른다. 그 집이 선 도시·나라의 주민이 되고 주민세·신용이
// 그 사는 곳을 따른다). 조회는 tRPC gather.residence, 고르기는 WebSocket residence_set(@terra/protocol residence.ts). docs/adr/2026-11-15-business-ledger.md
// "바뀜 (residence …)".
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.

export type ResidenceStatus = "ok" | "not_ready" | "unknown_unit";

/** 지금 사는 곳이 정해진 길: chosen = 고른 집, lodging = 고르지 않아 숙소 배정(옛 길 — D-581 2372) */
export type ResidenceSource = "chosen" | "lodging";

/** 유닛 하나의 지금 사는 곳 */
export interface ResidencePlace {
  readonly buildingId: number;
  readonly cityId: number;
  readonly source: ResidenceSource;
}

/** 이 건물을 사는 곳으로 고를 수 없는 까닭(고를 수 있으면 null). full = 정원이 다 참(질문 2481 가 — 레벨(층) × 설정 칸, 줄기 governance-6) */
export type ResidenceBlock = "not_housing" | "no_city" | "not_eligible" | "unknown_building" | "full";

/**
 * 사는 곳 값을 내는 길(D-591 2 — 줄기 residence-3): own = 내 집(값 없음), lodging = 배정받은 숙소(하룻밤 숙박비를 기간만큼 미리), rent = 남의 집(주인이 정한
 * 집세를 기간마다 미리 — 그 건물 사업장 금고로)
 */
export type ResidencePayKind = "own" | "lodging" | "rent";

/** 층 올리기 견적(내 주거 건물 — D-591 1). 재료 have = 꺼낼 수 있는 자리의 지금 수량 */
export interface ResidenceFloorQuote {
  /** 더 올릴 수 없는 까닭(최고 층·짓는 중 등 — 건물 결과 코드 글자), 올릴 수 있으면 null */
  readonly block: string | null;
  readonly materials: readonly {
    readonly item: string;
    readonly name: { readonly ko: string; readonly en: string } | null;
    readonly qty: number;
    readonly have: number;
  }[];
  /** 일꾼 없이 걸리는 시간(ms) */
  readonly timeMs: number;
  /** 층 올리는 중이면 끝 시각(서버 ms) */
  readonly untilMs: number | null;
}

/** 물어본 건물 한 채의 사는 곳 자료 */
export interface ResidenceBuildingView {
  readonly buildingId: number;
  /** 이 유닛이 이 건물을 사는 곳으로 고를 수 없는 까닭(고를 수 있으면 null) */
  readonly block: ResidenceBlock | null;
  /** 층 수·최고 층·정원(층 × 설정 칸)·지금 사는(고른) 유닛 수 — 줄기 residence-3(D-591 1). 옛 서버는 없음 */
  readonly floors?: number | undefined;
  readonly maxFloors?: number | undefined;
  readonly capacity?: number | undefined;
  readonly occupants?: number | undefined;
  /** 주인이 내놓은 한 기간 집세(최소 단위 정수 글자, 세를 놓지 않으면 null — D-591 2) */
  readonly rent?: string | null | undefined;
  /** 보는 사람의 건물인가(집세 정하기·층 올리기 칸) */
  readonly mine?: boolean | undefined;
  /** 이 유닛이 여기 살면 내는 길과 한 기간 값(고를 수 없거나 셀 수 없으면 null) */
  readonly payKind?: ResidencePayKind | null | undefined;
  readonly price?: string | null | undefined;
  /** 층 올리기 견적(내 건물일 때만, 아니면 null) */
  readonly floor?: ResidenceFloorQuote | null | undefined;
}

export interface ResidenceResponse {
  readonly status: ResidenceStatus;
  readonly unitId: number;
  /** 지금 사는 곳(없으면 null — 떠도는 사람, 주민세를 내지 않는다) */
  readonly current: ResidencePlace | null;
  /** 물어본 건물(없으면 null) — 그 건물을 고를 수 있나 */
  readonly building: ResidenceBuildingView | null;
  /** 한 기간 길이(ms, 설정 칸 residence_rent_period_ms — D-591 2). 옛 서버는 없음 */
  readonly periodMs?: number | undefined;
  /** 이 유닛이 고른 집(쉬는 것 포함)과 미리 낸 기간 끝(내 집이거나 내지 않았으면 null), 쉬는지 */
  readonly choice?: {
    readonly buildingId: number;
    readonly paidUntilMs: number | null;
    readonly paused: boolean;
  } | null;
  readonly generatedAt: number;
}
