// 세계 배치 화면 응답 모양(tRPC worldLayout.*) — 기획 D-528, docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)"
// 개발자·관리자가 행성 위에 고정 NPC 국가의 자리(수도 2차맵)를 놓는다. 놓은 자리는 서버가 다음에 켤 때 세계에 든다(시작 도시가 선 국가는
// 막는 것이 없을 때만 국가째 옮긴다). 칸 키는 정밀도를 지키려고 10진 글자로 보낸다(셀 키는 2^53을 넘지 않지만 다른 조회와 같은 꼴).
import type { LocalizedName } from "./roster.ts";

/** 자리를 놓을 때 거절·고침 코드 */
export const WORLD_PLACE_CODES = [
  "ok",
  "unknown_nation",
  "bad_cell",
  "not_land",
  "too_close",
  "reserved",
] as const;
export type WorldPlaceCode = (typeof WORLD_PLACE_CODES)[number];

/** 자리를 세계에 들이지 못하게 하는 까닭(서버 world/relayout.ts RELAYOUT_REASONS + 국가 단위) */
export const WORLD_PLACE_BLOCKERS = [
  "battle_running",
  "player_building",
  "facility_contract",
  "player_job",
  "guardian",
  "beacon",
  "player_unit_on_map",
  "cyborg_busy",
  "npc_human_contract",
  "npc_building_goods",
  "no_room",
  "other_cities",
] as const;
export type WorldPlaceBlocker = (typeof WORLD_PLACE_BLOCKERS)[number];

export interface WorldPlacementCityView {
  readonly id: number;
  readonly name: string | null;
  /** 2차맵 키(10진 글자) */
  readonly mapKey: string;
  readonly start: boolean;
  readonly development: number;
  /** NPC가 고른 수도(D-528). 아직 고르지 않았으면 가장 작은 ID 시작 도시 */
  readonly capital: boolean;
}

export interface WorldPlacementView {
  /** 놓은 수도 2차맵(10진 글자) */
  readonly mapKey: string;
  readonly placedAtMs: number;
  /** 놓은 사람 이름(지워진 계정·모름이면 null) */
  readonly placedBy: string | null;
  /** 세계에 든 시각. null = 다음 서버 시작 때 들 차례 */
  readonly appliedAtMs: number | null;
  /** 들지 못하는 까닭(미리 본 값 또는 지난 시작 때 값). 없으면 빈 목록 */
  readonly blocked: readonly WorldPlaceBlocker[];
}

export interface WorldPlacementNationView {
  readonly factionId: number;
  readonly code: string;
  readonly name: LocalizedName | null;
  readonly cities: readonly WorldPlacementCityView[];
  readonly placement: WorldPlacementView | null;
  /** 국력 등급 시작 값(더한 칸 — 옛 서버 응답에는 없다) */
  readonly start?: WorldTierStartView | undefined;
  /** 국가 시그니처 컬러(#rrggbb, 팩 국가 프리셋 — 지도 표시 색. 더한 칸, 프리셋이 없으면 없다) */
  readonly color?: string | undefined;
}

export interface WorldLayoutPlanetView {
  readonly planetId: string;
  /** 2차맵 칸 키의 면 레벨 */
  readonly faceLevel: number;
  /** 국가 수도 사이 가장 짧은 거리(1차맵 칸, 설정 칸 world_layout_nation_gap_cells) */
  readonly gapCells: number;
  /** 국가를 두지 않는 2차맵(시험 2차맵 줄 — 둘레 국가 간격 안도 안 된다, 10진 글자) */
  readonly reserved: readonly string[];
  readonly nations: readonly WorldPlacementNationView[];
  /** 이 세계에 아직 서지 않은 켜진 국가 프리셋(더한 칸): 자리를 놓으면 다음 시작 때 그 국가가 선다 */
  readonly founding?: readonly WorldFoundingView[] | undefined;
}

export interface WorldPlaceResult {
  readonly code: string;
  readonly result: WorldPlaceCode;
  /** 실제로 놓은 칸(알맞은 땅으로 옮겼을 수 있다, 10진 글자). 놓지 않았으면 null */
  readonly mapKey: string | null;
  /** 시작 도시가 선 국가: 지금 막는 것(있으면 다음 시작 때 옮기지 않는다) */
  readonly blocked: readonly WorldPlaceBlocker[];
  /** too_close: 가까운 국가 코드 */
  readonly near: string | null;
}

export interface WorldLayoutSuggestion {
  /** 자리를 고르지 않은 국가마다 자동 배치가 고른 수도 2차맵(10진 글자) */
  readonly homes: readonly { readonly code: string; readonly mapKey: string }[];
  /** 등급 배치 계획(더한 칸): 빈 세계로 보고 모든 국가(세울 국가 포함)를 등급대로 고른 자리와 시작 도시 */
  readonly plan?: WorldTierPlan | undefined;
}

// ── 국력 등급(사용자 답 2026-11-11 "실제 강대국 분포처럼 알아서 배치", docs/adr/2026-11-07-world-layout.md "바뀜 (2026-11-11)") ──
// 아래 칸은 모두 더한 것이다(옛 화면은 모르는 칸을 읽지 않는다).

/** 국가 하나의 등급 시작 값 요약(등급이 없으면 tier = null, 수는 옛 규칙 값) */
export interface WorldTierStartView {
  /** @terra/shared/nationTier POWER_TIERS 가운데 하나(없으면 null) */
  readonly tier: string | null;
  readonly cities: number;
  /** 시작 도시 하나의 처음 인구·경비대 */
  readonly populationPerCity: number;
  readonly guardsPerCity: number;
  readonly tech: number;
}

/** 이 세계에 아직 서지 않은 켜진 국가 프리셋(세울 수 있는 국가). mapKey가 있으면 자리를 놓아 다음 시작 때 선다 */
export interface WorldFoundingView {
  readonly code: string;
  readonly name: LocalizedName | null;
  readonly start: WorldTierStartView;
  readonly color?: string | undefined;
  /** 놓은 수도 2차맵(10진 글자). 없으면 아직 자리를 놓지 않은 후보 */
  readonly mapKey: string | null;
  readonly placedAtMs: number | null;
  readonly placedBy: string | null;
}

/** 등급 배치 계획(빈 세계로 보고 등급대로 고른 자리 — 미리 보기)의 국가 한 줄 */
export interface WorldTierPlanNation {
  readonly code: string;
  readonly tier: string | null;
  /** 수도 2차맵(10진 글자) */
  readonly home: string;
  /** 시작 도시가 설 2차맵(수도 먼저, 10진 글자) */
  readonly cities: readonly string[];
  /** 등급이 바라는 시작 도시 수(자리가 모자라면 cities가 더 짧다) */
  readonly wantCities: number;
  readonly population: number;
  readonly guards: number;
  /** 사람이 놓은 자리를 그대로 썼나 */
  readonly placed: boolean;
}

export interface WorldTierPlan {
  readonly nations: readonly WorldTierPlanNation[];
  /** 국가 수도 사이 가장 짧은 거리(1차맵 칸, 등급 간격으로 나눈 값)·찾은 반경 */
  readonly minGapCells: number | null;
  readonly regionCells: number;
  /** 자리가 모자라 세우지 못한 시작 도시 수 */
  readonly short: number;
}

/** 이미 선 세계에 등급 분포를 반영할 때의 국가 한 줄(미리 보기 — DB 읽기만) */
export interface WorldTierApplyNation {
  readonly code: string;
  readonly name: LocalizedName | null;
  readonly tier: string | null;
  /** 시작 도시: 지금·등급이 바라는 수·더 세울 수(자리가 있는 만큼)·등급보다 많은 수(지우지 않는다) */
  readonly cities: {
    readonly have: number;
    readonly want: number;
    readonly add: number;
    readonly surplus: number;
  };
  /** 더 세울 도시의 2차맵(10진 글자) */
  readonly addAt: readonly string[];
  /** 지금 있는 시작 도시에서: 주거를 올릴 도시 수, 더 세울 휴먼·경비대(새 도시 몫은 newHumans·newGuards) */
  readonly housingRaised: number;
  readonly humans: { readonly have: number; readonly add: number };
  readonly guards: { readonly have: number; readonly add: number };
  readonly newHumans: number;
  readonly newGuards: number;
  /** 기술 단계: 지금 → 반영 뒤(내리지 않는다) */
  readonly tech: { readonly from: number; readonly to: number };
}

export interface WorldTierApplyView {
  readonly nations: readonly WorldTierApplyNation[];
  readonly totals: {
    readonly cities: number;
    readonly humans: number;
    readonly guards: number;
    readonly housingRaised: number;
    /** 등급보다 많아 그대로 두는 시작 도시 수 */
    readonly surplusCities: number;
  };
  /** 지금 세계의 유닛 수(world_units 줄 수 — 늘어나는 양을 견줄 바탕) */
  readonly unitsNow: number;
  /** 걸려 있는 요청(없으면 null). appliedAtMs가 null이면 다음 서버 시작 때 든다 */
  readonly request: {
    readonly requestedAtMs: number;
    readonly requestedBy: string | null;
    readonly appliedAtMs: number | null;
    readonly report: Readonly<Record<string, unknown>> | null;
  } | null;
}

/**
 * 배후지 덮개 도시 하나(docs/adr/2026-11-11-city-catchment.md): 가운데 칸에서 걸음(di, dj — 면 경계는 걸어서 넘은 칸)·배후지 덮임(‰, 그 국가
 * 채집 시설 수로 가중)·국가 코드·고른 국가인가
 */
export interface WorldCatchmentCity {
  readonly di: number;
  readonly dj: number;
  readonly cover: number;
  readonly code: string;
  readonly own: boolean;
}

/** 세계 배치 화면 배후지 덮개(tRPC worldLayout.catchment — 고른 국가 수도 둘레) */
export interface WorldCatchmentView {
  readonly code: string;
  /** 배후지 반경·지방 도시 찾는 반경(1차맵 칸, 설정 칸 city_catchment_*). 반경 0 = 배후지 규칙 끔(옛 배치) */
  readonly radiusCells: number;
  readonly searchCells: number;
  /** 같은 국가·다른 국가 도시 사이 가장 짧은 거리(1차맵 칸) */
  readonly sameGapCells: number;
  readonly foreignGapCells: number;
  /** 격자 반 폭(칸): 격자 = (2 × span + 1)², 가운데 = 고른 국가 수도(지금 세계, 없으면 빈 세계 계획) */
  readonly span: number;
  /** 칸마다 여섯 원자재 비트(@terra/shared/catchment MATERIAL_BIT), 줄 차례(dj → di). 칸이 없으면(꼭짓점 너머) −1 */
  readonly cells: readonly number[];
  /** 지금 세계 도시(격자 안) */
  readonly world: readonly WorldCatchmentCity[];
  /** 빈 세계 등급 배치 계획(세계 새로 시작 뒤 설 자리, 격자 안) */
  readonly plan: readonly WorldCatchmentCity[];
  /** 배후지가 겹친 도시 쌍 수(행성 전체 — 지금 세계·계획) */
  readonly overlapWorld: number;
  readonly overlapPlan: number;
}
