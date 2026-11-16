// 영토 조회 응답 모양(tRPC territory.*) — docs/adr/2026-11-03-territory-layer.md 5절
// 기기(개발 영토 화면)는 같은 자료로 @terra/shared/territory buildTerritory·claimAt(1차맵 영토 지도, D-568)을 다시 돌려 칸보다 세밀한
// 경계를 그린다(서버와 같은 함수·같은 입력이라 같은 답). 서버 권위 판정(비콘 놓기·지방)은 서버만 한다.
import type { LocalizedName } from "./roster.ts";
import type { TerritoryCoefficients, TerritoryVec, TerritoryVertexKind } from "./territory.ts";
import type { TerritoryMapValues } from "./territoryMap.ts";

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
  /** 영향권 반경(1000분율 칸, M3 — 지도가 없을 때의 새 도시 겹침 검사·도시 표·시가지 = 이 값 ÷ 3, D-104·D-572) */
  readonly radiusMilli: number;
  /** 배후지 지금 반경(1000분율 칸, 영토 원 바탕). 배후지 규칙이 꺼졌으면 null(바탕 = 영향권). 옛 서버는 없다 */
  readonly catchmentMilli?: number | null | undefined;
  /** 영토 원 반지름(1000분율 칸, 1차맵 지도와 같다 — D-568). 옛 서버는 없다 */
  readonly territoryMilli?: number | undefined;
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
  /** 지금 내구도 점(최대 = N51 × 상태, 건물 규칙 기획 336 — docs/adr/2026-11-07-buildings-runtime.md) */
  readonly durability: number;
  readonly builtAtMs: number;
  /** 지금 상태(ppm, 가득 1,000,000). 쓰지 않는 건물이라 30%까지만 노화한다(D-509). 30% 미만이면 꼭짓점이 아니다 */
  readonly conditionPpm?: number | undefined;
  /** 다 지어지는 시각(짓는 중일 때만). 다 짓기 전에는 꼭짓점이 아니다 */
  readonly readyAtMs?: number | null | undefined;
}

export interface TerritoryGroupView {
  readonly factionId: number;
  readonly members: readonly { readonly kind: TerritoryVertexKind; readonly id: number }[];
  /** 옛 볼록 껍질 꼭짓점. D-568부터 껍질 판정이 없어 늘 null(옛 화면 호환) */
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

/**
 * 비콘 시설(팩 territory_beacon 실효 값): 팩에 있나(enabled)·레벨 1 건설 재료(D-508). 놓을 때 이 재료를 주인 원장에서 빼고 건설 시간(M14)
 * 뒤에 꼭짓점이 된다(개발 대신 놓기는 옛 관리자처럼 재료 없이 바로, docs/adr/2026-11-07-buildings-runtime.md)
 */
export interface TerritoryBeaconFacilityView {
  readonly enabled: boolean;
  readonly materials: readonly { readonly item: string; readonly qty: number }[];
  /** 건설 시간(ms, M14 식). 없으면 바로 */
  readonly buildMs?: number | undefined;
}

export interface TerritoryPlanetView {
  readonly planetId: string;
  readonly faceLevel: number;
  /** 각 → 1000분율 칸(buildTerritory metric) */
  readonly milliPerRadian: number;
  readonly rules: TerritoryCoefficients;
  /** 1차맵 영토 값(설정 칸 planet_territory_* 실효 값 — 판정과 화면이 같이 쓴다, D-568). 옛 서버는 없다 → 출발값 */
  readonly mapValues?: TerritoryMapValues | undefined;
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
  /** 배치를 셈한 시간(ms, 측정용). 옛 서버는 없다 */
  readonly computeMs?: number | undefined;
  /** 칸 표를 셈한 시간(ms, 측정용 — 그 배치에서 칸 표를 셈했을 때만, 나눠 셈한 조각 CPU 합) */
  readonly rasterMs?: number | undefined;
  /** 칸 표 조각 하나의 가장 긴 시간(ms, 측정용 — 메인 스레드를 한 번에 잡은 가장 긴 시간, 질문 1930) */
  readonly rasterSliceMs?: number | undefined;
}
