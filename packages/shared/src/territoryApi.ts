// 영토 조회 응답 모양(tRPC territory.*) — docs/adr/2026-11-03-territory-layer.md 5절
// 기기(개발 영토 화면·1차맵 영토 층)는 같은 자료로 @terra/shared/territory buildTerritory·claimAt을 다시 돌려 칸보다 세밀한 경계를
// 그린다(서버와 같은 함수·같은 입력이라 같은 답). 서버 권위 판정(비콘 놓기)은 서버만 한다.
import type { LocalizedName } from "./roster.ts";
import type { TerritoryCoefficients, TerritoryVec, TerritoryVertexKind } from "./territory.ts";

/** 비콘을 시설로 다루는 팩 시설 ID(건물 편집기 재료 D-508, 49 N51). 시설은 늘 켜져 있다(팩 core@32) */
export const TERRITORY_BEACON_FACILITY = "territory_beacon";

export interface TerritoryFactionView {
  readonly id: number;
  readonly code: string | null;
  readonly kind: "npc" | "player";
  /** 화면 이름(팩 국가 프리셋 등). 없으면 null(코드를 보인다) */
  readonly name: LocalizedName | null;
}

export interface TerritoryCityView {
  readonly id: number;
  readonly factionId: number;
  /** 2차맵 키(1차맵 칸) */
  readonly mapKey: number;
  /** 시청 배치 칸 */
  readonly cellX: number;
  readonly cellY: number;
  readonly point: TerritoryVec;
  readonly development: number;
  /** 도시 등급 1~6(M2 문턱) */
  readonly grade: number;
  /** 영향권 반경(1000분율 칸, M3) */
  readonly radiusMilli: number;
  /** 비콘 최대 거리(1000분율 칸, N42) */
  readonly rangeMilli: number;
  /** 이 도시를 기준으로 놓은 비콘 수 / 상한(N42) */
  readonly beaconsUsed: number;
  readonly beaconsMax: number;
}

export interface TerritoryBeaconView {
  readonly id: number;
  readonly factionId: number;
  readonly cityId: number | null;
  /** 1차맵 칸 키 */
  readonly cellKey: number;
  readonly point: TerritoryVec;
  readonly durability: number;
  readonly builtAtMs: number;
}

export interface TerritoryGroupView {
  readonly factionId: number;
  readonly members: readonly { readonly kind: TerritoryVertexKind; readonly id: number }[];
  /** 껍질 꼭짓점(반시계). 셋 미만이면 null */
  readonly hull:
    | readonly { readonly kind: TerritoryVertexKind; readonly id: number; readonly point: TerritoryVec }[]
    | null;
}

/** 영토 칸 한 줄: [1차맵 칸 키, 세력 ID, 지방 도시 ID(없으면 0), 차지한 표본 수(0~16)] */
export type TerritoryCellRow = readonly [
  cellKey: number,
  factionId: number,
  province: number,
  samples: number,
];

/** 비콘 시설(팩 territory_beacon 실효 값): 팩에 있나(enabled)·레벨 1 건설 재료(D-508). 지금 놓을 때 재료를 쓰지 않는다(짓기 흐름 없음) */
export interface TerritoryBeaconFacilityView {
  readonly enabled: boolean;
  readonly materials: readonly { readonly item: string; readonly qty: number }[];
}

export interface TerritoryPlanetView {
  readonly planetId: string;
  readonly faceLevel: number;
  /** 각 → 1000분율 칸(buildTerritory metric) */
  readonly milliPerRadian: number;
  readonly rules: TerritoryCoefficients;
  readonly beacon: TerritoryBeaconFacilityView;
  readonly factions: readonly TerritoryFactionView[];
  readonly cities: readonly TerritoryCityView[];
  readonly beacons: readonly TerritoryBeaconView[];
  readonly groups: readonly TerritoryGroupView[];
  readonly cells: readonly TerritoryCellRow[];
  /** 내가 가입한 세력(없으면 null) */
  readonly myFactionId: number | null;
  /** 이 배치를 셈한 서버 시각 */
  readonly computedAtMs: number;
}
