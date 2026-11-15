// 지도 흐름 조회 모양(tRPC world.cities·world.myPosition) — 기획 60 §4.1(D-6017·D-6018)·§7.1(D-6041), docs/adr/2026-11-07-play-flow.md
// "WP2 지도 흐름". 1차맵의 도시·국가 표시, 시작 도시 고르기(주변 땅·기후), 2차맵 들어가기(내 사이보그 자리)가 같은 자료를 쓴다.
// 읽기만 한다. 2차맵 키(mapKey)는 1차맵 칸의 셀 키(면 레벨 F, 안전 정수)다. 위도·경도는 표시용 실수(판정에 쓰지 않는다).
import type { LocalizedName } from "./roster.ts";
import { TERRITORY_MAP_START, type TerritoryMapValues } from "./territoryMap.ts";

/** 국가(세력) 한 줄 — 1차맵 색·이름 */
export interface WorldMapFaction {
  readonly id: number;
  readonly code: string | null;
  readonly kind: "npc" | "player";
  /** 화면 이름(팩 국가 프리셋 등). 없으면 null(코드를 보인다) */
  readonly name: LocalizedName | null;
  /**
   * 국가 색(`#rrggbb` 소문자) — 세력 정체성(faction_identities.color)이 있으면 그것, 없으면 팩 국가 프리셋 시그니처 색. 1차맵 영토·도시 점·
   * 범례가 쓴다(ADR 2026-11-07-planet-view "바뀜 (2026-11-14)"). 둘 다 없거나 옛 서버면 null·없음 → 화면은 여섯 색 돌려 쓰기
   */
  readonly color?: string | null | undefined;
}

/** 국가 색 모양(`#rrggbb`) — 서버가 보내기 전에, 화면이 style에 넣기 전에 본다 */
export const NATION_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

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
  /** 그 국가 도시 가운데 차례(1부터, ID 차례) — 이름이 없는 도시는 "<국가> 도시 N"으로 부른다 */
  readonly number: number;
  /** 도시 이름(번역하지 않는다 D-476, NPC 도시는 팩 국가 프리셋 목록 — 기획 답 510 다). 없으면 null */
  readonly name: string | null;
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
  /** 그 국가의 수도(세력 행 capital_city_id, D-528 — 1차맵 영토 레이어 표시). 옛 서버는 없다 */
  readonly capital?: boolean | undefined;
  /** 도시 등급 1 ~ 6(M2)·영향권 반경(1000분율 칸, M3). 영토를 셈하지 못했으면 null */
  readonly grade: number | null;
  readonly radiusMilli: number | null;
  /**
   * 도시 배후지 반경(1000분율 칸, 지금 인구·발전도 등급·기술 — @terra/shared/catchment catchmentRadiusMilli, ADR 2026-11-11-city-catchment).
   * 1차맵 영토 원의 반지름(ADR 2026-11-07-planet-view "바뀜 (2026-11-14)"). 배후지 규칙이 꺼졌거나 옛 서버면 null·없음 → 화면은 radiusMilli
   */
  readonly catchmentMilli?: number | null | undefined;
  /** 시청 자리의 영토 점(서버 판정과 같은 정수 벡터 [x, y, z], D-568). 옛 서버는 없다 → 화면은 위도·경도에서 만든다 */
  readonly point?: readonly number[] | undefined;
  /** 서버가 이 2차맵을 띄워 두었다(들어갈 수 있는 맵) */
  readonly loaded: boolean;
  /** 지금 내가 이 2차맵을 볼 수 있다(내 유닛·건물·탐사 칸, 또는 전체 보기 권한 — 서버 시야 규칙) */
  readonly viewable: boolean;
  readonly land: WorldMapLand | null;
}

/** 영토 경계 한 덩이(옛 볼록 껍질, docs/adr/2026-11-03-territory-layer.md). D-568부터 껍질 판정이 없어 서버는 빈 목록을 보낸다(옛 화면 호환) */
export interface WorldMapHull {
  readonly factionId: number;
  readonly points: readonly (readonly [latDeg: number, lonDeg: number])[];
}

/**
 * 영토 비콘 한 줄(1차맵 영토 표시 — 도시 소유 비콘은 그 도시·국가의 외곽선을 비콘까지 넓힌다, 기획 D-546 1434). 꼭짓점이 되는 비콘만(다 지었고
 * 상태가 문턱 이상, docs/adr/2026-11-03-territory-layer.md). 위도·경도는 그 1차맵 칸 가운데(표시용)
 */
export interface WorldMapBeacon {
  readonly id: number;
  readonly factionId: number;
  /** 기준 도시(없으면 null) */
  readonly cityId: number | null;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 영토 점(서버 판정과 같은 정수 벡터 [x, y, z], D-568 — tRPC가 배열로 보낸다). 옛 서버는 없다 → 화면은 위도·경도에서 만든다 */
  readonly point?: readonly number[] | undefined;
}

/**
 * 1차맵 영토 값(설정 칸 [임시] — 기획 D-544 "표시 상수는 설정 칸"·D-546 1431). D-568부터 판정(비콘 놓기·세금·지방)도 같은 값을 쓴다
 * (@terra/shared/territoryMap TerritoryMapValues와 같은 모양). 칸 = 1차맵 칸
 * - corridorCells: 같은 국가 도시를 띠로 잇는 가장 먼 거리(칸, 0이면 잇지 않는다. 비콘과 기준 도시는 늘 잇는다)
 * - radiusScalePm: 도시 원 반지름 = max(지금 배후지 반경 × radiusScalePm ÷ 1000, minCells칸) — 2000 = 2배
 * - minCells: 도시 원 반지름 아래 끝(칸)
 * - beaconCells: 도시 소유 비콘 둘레 여유(칸) — 외곽선이 비콘 밖으로 이만큼 지나간다
 */
export type WorldTerritoryDisplay = TerritoryMapValues;

/** 영토 값 출발값(팩 tuning planet_territory_* 와 같다, 옛 서버면 화면이 이 값을 쓴다) */
export const TERRITORY_DISPLAY_START: WorldTerritoryDisplay = TERRITORY_MAP_START;

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
  /** 아는 영토 비콘(꼭짓점인 것만, 안개 — 내 국가·기준 도시를 아는 비콘·전체 보기). 옛 서버는 없다 */
  readonly beacons?: readonly WorldMapBeacon[] | undefined;
  /** 영토 표시 값(설정 칸 실효 값). 옛 서버는 없다 → 화면은 TERRITORY_DISPLAY_START */
  readonly territoryDisplay?: WorldTerritoryDisplay | undefined;
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
  /**
   * 띄우지 않은 2차맵을 건너뛰는 중(질문 593 나): mapKey는 그 2차맵(서버가 띄우지 않음), 칸은 곧은 선을 따라 지금 있을 자리(보기 값).
   * 2차맵 화면은 이 자리를 열지 않는다. 좌표 유닛으로 서 있으면 false(그 2차맵을 열면 서버가 띄운다 — ADR 2026-11-15-unloaded-second-maps)
   */
  readonly hidden: boolean;
}

export interface WorldPositionResponse {
  readonly status: "ready" | "not_ready";
  /** 사이보그가 없거나 본체가 띄운 2차맵에 없으면(건너뛰는 중은 빼고) null */
  readonly position: WorldPosition | null;
  /** 내 자리가 없을 때 2차맵 화면이 여는 맵(띄운 첫 2차맵, 없으면 null) */
  readonly fallbackMapKey: number | null;
  readonly generatedAt: number;
}

/*
 * 2차맵 사이 이동(tRPC world.travelPlan·world.travels, WebSocket travel_start·travel_cancel) — docs/adr/2026-11-07-play-flow.md
 * "WP9 2차맵 사이 이동", 기획 D-197·D-6019·D-6021·질문 571 가. 1차맵 명령 판의 확인 단계(길·걸리는 시간)와 가는 중 표시가 쓴다.
 * 시각은 서버 ms, 거리 m·시간 ms는 보기 값(곧은 거리 ÷ 유닛 속도 — 실제 길은 2차맵마다 서버가 찾는다).
 * WP11(질문 590 나·591 나·593 나·594 나): 줄에 띄우지 않은 2차맵이 들 수 있고(건너뛴다), 확인 단계에 위험 구간·비용이 붙는다.
 */
/** 확인 단계의 위험 구간 하나(내가 아는 것만 — 안개 규칙, 질문 594 나) */
export interface WorldTravelDanger {
  /** 지나는 2차맵의 route 차례(출발 = 0은 넣지 않는다) */
  readonly leg: number;
  readonly mapKey: number;
  /** 그 2차맵의 정원사 오염(내가 아는 2차맵만, 모르면 null) */
  readonly pollution: number | null;
  /** 오염이 위험 문턱 이상(유목 부대가 노리는 오염 — 설정 칸 S17) */
  readonly pollutionHigh: boolean;
  /** 그 2차맵에 내가 아는 도시가 있는 전쟁 중 세력(세력 행 ID 차례) */
  readonly warFactionIds: readonly number[];
}

/** 비용 종류: 걷기는 돈·물자가 들지 않는다(탈것·운송이 생기면 연료·운임 — 질문 594 다) */
export type WorldTravelCost = "walk";

export interface WorldTravelPlan {
  /** 보낼 유닛(지정하지 않으면 내 사이보그 본체) */
  readonly unitId: number;
  /** 지나는 2차맵(출발 포함, 마지막 = 목적 2차맵) */
  readonly route: readonly number[];
  readonly distanceM: number;
  readonly durationMs: number;
  /** 지금 보내면 도착 예상 시각 */
  readonly arriveAt: number;
  /** 지금 직무(채집·계약)가 있다 — 출발 2차맵을 떠나면 직무가 끝난다(질문 582) */
  readonly working: boolean;
  /** 줄에 든 띄우지 않은 2차맵 수(그 구간은 건너뛴다 — 그동안 지도에 보이지 않는다, 질문 593 나). 닿을 때 띄울 목적지는 세지 않는다 */
  readonly hiddenMaps: number;
  /**
   * 목적 2차맵을 서버가 아직 띄우지 않아 유닛이 닿을 때 띄운다(기획 답 730 다, docs/adr/2026-11-07-play-flow.md "WP15"). 없으면 false
   */
  readonly opensMap?: boolean | undefined;
  readonly cost: WorldTravelCost;
  /** 위험 구간(내가 아는 것만, route 차례) */
  readonly dangers: readonly WorldTravelDanger[];
  /** 내가 모르는 2차맵 수(출발을 뺀 줄에서 — 위험을 알 수 없다) */
  readonly unknownMaps: number;
}

/** 이동 서비스가 정하는 몫(위험 구간은 조회가 붙인다) */
export type WorldTravelRoute = Omit<WorldTravelPlan, "dangers" | "unknownMaps">;

/** 확인 단계에서 보낼 수 없는 까닭(WebSocket travel_result 코드와 같은 이름, no_cyborg = 보낼 유닛이 없다) */
export type WorldTravelProblem =
  | "no_cyborg"
  | "unknown_unit"
  | "forbidden"
  | "unknown_map"
  | "no_route"
  | "border_blocked"
  | "goal_blocked"
  | "unavailable"
  /** 띄우지 않은 2차맵을 건너뛰는 중(다음 띄운 2차맵에 나타난 뒤 보낼 수 있다) */
  | "in_transit"
  /** 목적 2차맵을 띄워야 하는데 서버가 지금 더 띄울 수 없다(그때 띄운 2차맵 상한, WP15) — 잠시 뒤 다시 */
  | "map_full";

export interface WorldTravelPlanResponse {
  readonly status: "ready" | "not_ready";
  readonly plan: WorldTravelPlan | null;
  /** plan이 null일 때 까닭(not_ready면 null) */
  readonly problem: WorldTravelProblem | null;
  readonly generatedAt: number;
}

/**
 * 멈춘 까닭: 멈추기·다른 명령·전투 등으로 길에서 벗어남·막힘(넘는 변·목표·길 없음)·움직일 수 없음·띄우지 않은 2차맵을 건너뛰는 동안 습격을 받아
 * 졌다(raided — 다음 띄운 2차맵 변에서 부상으로 멈춤, 기획 답 610 나, docs/adr/2026-11-07-play-flow.md "WP13")
 */
export type WorldTravelStop =
  | "cancelled"
  | "interrupted"
  | "blocked"
  | "unavailable"
  | "raided"
  /** 목적 2차맵에 들어서려 했지만 서버가 더 띄울 수 없었다(WP15 상한) — 변 앞(건너뛰던 중이면 사라진 자리)에 멈춤 */
  | "map_full";

export interface WorldTravel {
  readonly unitId: number;
  readonly kind: "move" | "scout";
  /** 지나는 2차맵(출발 포함, 마지막 = 목적 2차맵) */
  readonly route: readonly number[];
  /** 지금 있는 2차맵의 route 차례 */
  readonly leg: number;
  /** 지금(또는 멈춘·도착한) 2차맵과 배치 칸, 위도·경도(1차맵 표시) */
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 목표 칸(마지막 2차맵 안) */
  readonly targetX: number;
  readonly targetY: number;
  readonly startedAt: number;
  /** 도착 예상 시각(가는 중: 지금 자리에서 곧은 거리 ÷ 속도, 도착: 도착한 시각, 멈춤: 멈춘 시각) */
  readonly arriveAt: number;
  /** going 가는 중, arrived 도착(최근 10분), stopped 멈춤(최근 10분, 까닭 stop) */
  readonly state: "going" | "arrived" | "stopped";
  readonly stop: WorldTravelStop | null;
  /** 정찰이 목표를 보고 출발한 자리로 돌아오는 중(또는 돌아왔다) — route·target은 돌아오는 길(질문 591 나) */
  readonly returning: boolean;
  /** 정찰한 2차맵(돌아오는 정찰만, 아니면 null) */
  readonly scoutedMapKey: number | null;
  /** 띄우지 않은 2차맵을 건너뛰는 중(mapKey·칸은 곧은 선을 따라 지금 있을 자리, 질문 593 나) */
  readonly hidden: boolean;
}

/**
 * 내 좌표 유닛(서 있음) — 띄우지 않은 2차맵 위에 선 유닛(docs/adr/2026-11-15-unloaded-second-maps.md). 1차맵에만 보인다.
 * 가는 중인 좌표 유닛은 travels 줄(hidden)이다
 */
export interface WorldParkedUnit {
  readonly unitId: number;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 사이보그 본체인가 */
  readonly cyborg: boolean;
  /** 배인가 */
  readonly boat: boolean;
}

export interface WorldTravelsResponse {
  readonly status: "ready" | "not_ready";
  /** 내 유닛의 길(가는 중 + 최근 끝난 것), 유닛 ID 차례 */
  readonly travels: readonly WorldTravel[];
  /** 내 좌표 유닛(서 있음, 승객 빼고), 유닛 ID 차례. 옛 서버는 없음 */
  readonly parked?: readonly WorldParkedUnit[] | undefined;
  readonly generatedAt: number;
}
