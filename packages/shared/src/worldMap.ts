// 지도 흐름 조회 모양(tRPC world.cities·world.myPosition) — 기획 60 §4.1(D-6017·D-6018)·§7.1(D-6041), docs/adr/2026-11-07-play-flow.md
// "WP2 지도 흐름". 1차맵의 도시·국가 표시, 시작 도시 고르기(주변 땅·기후), 2차맵 들어가기(내 사이보그 자리)가 같은 자료를 쓴다.
// 읽기만 한다. 2차맵 키(mapKey)는 1차맵 칸의 셀 키(면 레벨 F, 안전 정수)다. 위도·경도는 표시용 실수(판정에 쓰지 않는다).
import type { LocalizedName } from "./roster.ts";

/** 국가(세력) 한 줄 — 1차맵 색·이름 */
export interface WorldMapFaction {
  readonly id: number;
  readonly code: string | null;
  readonly kind: "npc" | "player";
  /** 화면 이름(팩 국가 프리셋 등). 없으면 null(코드를 보인다) */
  readonly name: LocalizedName | null;
}

/**
 * 도시 둘레 땅(행성 값, 그 2차맵 = 1차맵 칸 하나). 시작 도시 고르기의 "주변 자원·기후"(D-6041)와 1차맵 도시 판이 보인다.
 * 행성 값이 아직 없으면(서버가 굽는 중) 도시의 land는 null이다
 */
export interface WorldMapLand {
  /** 바이옴 ID(팩 biomes)와 이름. 표 밖이면 null */
  readonly biomeId: string | null;
  readonly biomeName: LocalizedName | null;
  /** 칸 고도(게임 m, 해수면 0) */
  readonly elevationM: number;
  readonly temperatureC: number;
  /** 습도 0 ~ 255 */
  readonly humidity: number;
  /** 연 강수(mm) */
  readonly precipitationMm: number;
  /** 물 비트(바다 1·호수 2·강 4·해안 8, @terra/planet WATER_*) */
  readonly water: number;
  /** 숲 밀도 0 ~ 255 */
  readonly forest: number;
}

/** 도시 한 줄 */
export interface WorldMapCity {
  readonly id: number;
  readonly factionId: number;
  /** 그 국가 도시 가운데 차례(1부터, ID 차례) — [임시] 도시 이름 칸이 없어 "도시 N"으로 부른다(질문 510) */
  readonly number: number;
  /** 2차맵 키(1차맵 칸 셀 키, 면 레벨 F) */
  readonly mapKey: number;
  /** 1차맵 칸(면 레벨 F) */
  readonly face: number;
  readonly i: number;
  readonly j: number;
  /** 시청 배치 칸(2차맵 안 0 ~ 255) */
  readonly cellX: number;
  readonly cellY: number;
  /** 시청 자리의 위도·경도(°, 표시용) */
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 기본 NPC 국가의 시작 도시(D-341) */
  readonly start: boolean;
  /** 도시 등급 1 ~ 6(M2)·영향권 반경(1000분율 칸, M3). 영토를 셈하지 못했으면 null */
  readonly grade: number | null;
  readonly radiusMilli: number | null;
  /** 서버가 이 2차맵을 띄워 두었다(들어갈 수 있는 맵) */
  readonly loaded: boolean;
  /** 지금 내가 이 2차맵을 볼 수 있다(내 유닛·건물·탐사 칸, 또는 전체 보기 권한 — 서버 시야 규칙) */
  readonly viewable: boolean;
  readonly land: WorldMapLand | null;
}

/** 영토 경계 한 덩이(같은 세력 도시·비콘의 볼록 껍질, docs/adr/2026-11-03-territory-layer.md). 꼭짓점은 반시계 위도·경도 */
export interface WorldMapHull {
  readonly factionId: number;
  readonly points: readonly (readonly [latDeg: number, lonDeg: number])[];
}

export interface WorldCitiesResponse {
  /** not_ready = 세계·DB가 없거나 부팅 복구 전(빈 목록) */
  readonly status: "ready" | "not_ready";
  /** 월드 행성(콘텐츠 ID)과 면 레벨 */
  readonly planetId: string;
  readonly faceLevel: number;
  readonly factions: readonly WorldMapFaction[];
  readonly cities: readonly WorldMapCity[];
  readonly hulls: readonly WorldMapHull[];
  /** 영향권 반경 환산(1000분율 칸 → 라디안 = 값 ÷ milliPerRadian). 영토를 셈하지 못했으면 0 */
  readonly milliPerRadian: number;
  /** 내가 가입한 국가(없으면 null) */
  readonly myFactionId: number | null;
  readonly generatedAt: number;
}

/** 내 사이보그가 있는 곳 */
export interface WorldPosition {
  readonly planetId: string;
  readonly mapKey: number;
  readonly face: number;
  readonly i: number;
  readonly j: number;
  /** 지금 배치 칸(2차맵 안, 움직이는 중이면 지금 시각의 자리) */
  readonly cellX: number;
  readonly cellY: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 사이보그 본체 세계 유닛 ID(2차맵 화면이 카메라를 맞춘다) */
  readonly unitId: number;
  /** 시작 도시 ID */
  readonly startCityId: number;
}

export interface WorldPositionResponse {
  readonly status: "ready" | "not_ready";
  /** 사이보그가 없거나 본체가 띄운 2차맵에 없으면 null */
  readonly position: WorldPosition | null;
  /** 내 자리가 없을 때 2차맵 화면이 여는 맵(띄운 첫 2차맵, 없으면 null) */
  readonly fallbackMapKey: number | null;
  readonly generatedAt: number;
}
