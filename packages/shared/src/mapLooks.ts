// 2차맵 건물 겉모습 조회 응답 모양(tRPC facilities.mapLooks) — ADR 2026-11-08-building-art.
// 지도 자료(WebSocket map_snapshot)의 건물에는 칸·크기·돌림만 있다. 화면은 이 조회로 건물마다 시설 종류·레벨·상태·국가를 받아
// 2차맵 엔진의 건물 모델(packages/engine buildings/)을 고른다. 판정에 쓰지 않는 그림 자료다(읽기만).

export type MapLooksStatus = "ok" | "not_ready" | "unknown_map";

/** 건물 상태: 짓는 중(처음 짓기, 레벨 0)·정상·손상·멈춤·폐허(@terra/shared facilityRuntime ConditionState + 짓는 중) */
export type MapLookState = "building" | "ok" | "damaged" | "disabled" | "ruin";

/** 건물 하나의 겉모습 */
export interface MapBuildingLook {
  readonly buildingId: number;
  /** 시설 ID(콘텐츠 팩). 시설 줄이 없는 건물(관리자 시험 건물)은 null */
  readonly facilityId: string | null;
  /** 다 지은 레벨(처음 짓는 동안 0) */
  readonly level: number;
  readonly state: MapLookState;
  /** 레벨을 올리는 중 */
  readonly upgrading: boolean;
  /** 주인의 국가(세력 ID). 주인이 없거나 국가가 없으면 null */
  readonly factionId: number | null;
}

export interface MapLooksResponse {
  readonly status: MapLooksStatus;
  readonly mapKey: number;
  /** 건물 ID 차례 */
  readonly buildings: readonly MapBuildingLook[];
  readonly generatedAt: number;
}
