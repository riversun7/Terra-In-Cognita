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
}
