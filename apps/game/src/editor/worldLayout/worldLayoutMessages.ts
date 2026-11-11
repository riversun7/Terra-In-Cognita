// 세계 배치 화면 문구 표 — 코드 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다). 이 조각에만 든다.
import type { WorldPlaceBlocker, WorldPlaceCode } from "@terra/shared/worldPlacementApi";
import { m } from "../../paraglide/messages.js";
import type { NationStatus } from "./worldLayoutModel.ts";

type Text = () => string;

export const BLOCKER_TEXT: Readonly<Record<WorldPlaceBlocker, Text>> = {
  battle_running: m.dev_world_layout_block_battle_running,
  player_building: m.dev_world_layout_block_player_building,
  facility_contract: m.dev_world_layout_block_facility_contract,
  player_job: m.dev_world_layout_block_player_job,
  guardian: m.dev_world_layout_block_guardian,
  beacon: m.dev_world_layout_block_beacon,
  player_unit_on_map: m.dev_world_layout_block_player_unit_on_map,
  cyborg_busy: m.dev_world_layout_block_cyborg_busy,
  npc_human_contract: m.dev_world_layout_block_npc_human_contract,
  npc_building_goods: m.dev_world_layout_block_npc_building_goods,
  no_room: m.dev_world_layout_block_no_room,
  other_cities: m.dev_world_layout_block_other_cities,
};

export const STATUS_TEXT: Readonly<Record<NationStatus, Text>> = {
  auto: m.dev_world_layout_status_auto,
  pending: m.dev_world_layout_status_pending,
  applied: m.dev_world_layout_status_applied,
  blocked: m.dev_world_layout_status_blocked,
};

/** 놓기 실패 코드 → 문구(too_close는 가까운 국가·간격을 넣는다) */
export function placeFailText(code: Exclude<WorldPlaceCode, "ok">, near: string, gap: number): string {
  if (code === "too_close") return m.dev_world_layout_code_too_close({ near, gap });
  return PLACE_FAIL_TEXT[code]();
}

const PLACE_FAIL_TEXT: Readonly<Record<Exclude<WorldPlaceCode, "ok" | "too_close">, Text>> = {
  unknown_nation: m.dev_world_layout_code_unknown_nation,
  bad_cell: m.dev_world_layout_code_bad_cell,
  not_land: m.dev_world_layout_code_not_land,
  reserved: m.dev_world_layout_code_reserved,
};

/** 막는 것 목록 → "플레이어 건물, 영토 비콘" */
export function blockersText(list: readonly WorldPlaceBlocker[]): string {
  return list.map((code) => BLOCKER_TEXT[code]()).join(", ");
}

/** 국력 등급 ID → 이름(@terra/shared/nationTier POWER_TIERS). 등급이 없거나 모르는 값이면 "등급 없음" */
const TIER_TEXT: Readonly<Record<string, Text>> = {
  superpower: m.dev_power_tier_superpower,
  great_power: m.dev_power_tier_great_power,
  middle_power: m.dev_power_tier_middle_power,
  small_state: m.dev_power_tier_small_state,
  city_state: m.dev_power_tier_city_state,
};

export function tierText(tier: string | null | undefined): string {
  const text = tier ? TIER_TEXT[tier] : undefined;
  return text ? text() : m.dev_power_tier_none();
}
