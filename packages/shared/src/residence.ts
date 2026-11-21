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

/** 이 건물을 사는 곳으로 고를 수 없는 까닭(고를 수 있으면 null) */
export type ResidenceBlock = "not_housing" | "no_city" | "not_eligible" | "unknown_building";

export interface ResidenceResponse {
  readonly status: ResidenceStatus;
  readonly unitId: number;
  /** 지금 사는 곳(없으면 null — 떠도는 사람, 주민세를 내지 않는다) */
  readonly current: ResidencePlace | null;
  /** 물어본 건물(없으면 null) — 그 건물을 고를 수 있나 */
  readonly building: {
    readonly buildingId: number;
    readonly block: ResidenceBlock | null;
  } | null;
  readonly generatedAt: number;
}
