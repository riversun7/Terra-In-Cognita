// 2차맵 건물 겉모습 조회 응답 모양(tRPC facilities.mapLooks) — ADR 2026-11-08-building-art.
// 지도 자료(WebSocket map_snapshot)의 건물에는 칸·크기·돌림만 있다. 화면은 이 조회로 건물마다 시설 종류·레벨·상태·국가를 받아
// 2차맵 엔진의 건물 모델(packages/engine buildings/)을 고른다. 판정에 쓰지 않는 그림 자료다(읽기만).
// 시설 이름·내 건물인가는 2차맵 근처 목록의 건물 탭이 쓴다(docs/adr/2026-11-08-seamless-second-map.md WP-2).
import type { FacilityLookJson } from "./facilityLook.ts";
import type { LocalizedName } from "./roster.ts";

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
  /** 시설 이름(팩). 시설 줄이 없거나 팩에 없으면 없음 */
  readonly name?: LocalizedName;
  /** 묻는 사람(소유 주체)의 건물인가 */
  readonly mine: boolean;
  /**
   * 시설의 겉모습 자료(실효 팩 facilities.look: 모델 종류·벽·지붕 색·높이 배율 — 건물 편집기가 바로 바꾼다, 2026-11-09).
   * 없으면 화면이 시설 ID로 모델을 고른다(옛 서버·팩에 칸이 없을 때)
   */
  readonly art?: FacilityLookJson;
}

export interface MapLooksResponse {
  readonly status: MapLooksStatus;
  readonly mapKey: number;
  /** 건물 ID 차례 */
  readonly buildings: readonly MapBuildingLook[];
  readonly generatedAt: number;
}
