// 건물 칸 문구·작은 셈 — 결과 코드 → 문구, 상태 이름, 재료 줄(이름 × 수량, 모자람 표지), 미리 셈(서버와 같은 식, 판정은 서버)
// docs/adr/2026-11-07-buildings-runtime.md
import {
  type FacilitiesOverviewResponse,
  type FacilityJobKind,
  type FacilityStackView,
  materialStockAt,
} from "@terra/shared/facilities";
import type { ConditionState } from "@terra/shared/facilityRuntime";
import type { FacilityResultCode } from "@terra/protocol";
import { m } from "../paraglide/messages.js";
import { fmt, pickName } from "./economyText.ts";
import type { FacilityCommand } from "./facilityCommands.ts";

export const FACILITY_ERROR_TEXT: Readonly<Record<FacilityResultCode | "offline" | "timeout", () => string>> =
  {
    sign_in_required: m.facility_error_sign_in_required,
    insufficient_funds: m.facility_error_insufficient_funds,
    plot_full: m.facility_error_plot_full,
    floor_full: m.facility_error_floor_full,
    no_plot: m.facility_error_no_plot,
    tier_locked: m.facility_error_tier_locked,
    sale_only: m.facility_error_sale_only,
    exchange_locked: m.facility_error_exchange_locked,
    exchange_exists: m.facility_error_exchange_exists,
    no_shop_worker: m.facility_error_no_shop_worker,
    service_closed: m.facility_error_service_closed,
    access_denied: m.facility_error_access_denied,
    busy: m.facility_error_busy,
    rate_limited: m.facility_error_rate_limited,
    forbidden: m.facility_error_forbidden,
    unknown_map: m.facility_error_unknown_map,
    unknown_facility: m.facility_error_unknown_facility,
    unknown_item: m.facility_error_unknown_item,
    not_buildable: m.facility_error_not_buildable,
    out_of_bounds: m.facility_error_out_of_bounds,
    overlaps_building: m.facility_error_overlaps_building,
    overlaps_road: m.facility_error_overlaps_road,
    blocked_terrain: m.facility_error_blocked_terrain,
    overlaps_unit: m.facility_error_overlaps_unit,
    building_limit: m.facility_error_building_limit,
    insufficient_materials: m.facility_error_insufficient_materials,
    unknown_building: m.facility_error_unknown_building,
    not_facility: m.facility_error_not_facility,
    unknown_beacon: m.facility_error_unknown_beacon,
    job_running: m.facility_error_job_running,
    under_construction: m.facility_error_under_construction,
    max_level: m.facility_error_max_level,
    not_damaged: m.facility_error_not_damaged,
    facility_disabled: m.facility_error_facility_disabled,
    cannot_repair: m.facility_error_cannot_repair,
    unknown_unit: m.facility_error_unknown_unit,
    unit_busy: m.facility_error_unit_busy,
    unknown_holding: m.facility_error_unknown_holding,
    not_equipment: m.facility_error_not_equipment,
    equipped: m.facility_error_equipped,
    holding_busy: m.facility_error_holding_busy,
    broken: m.facility_error_broken,
    not_storage: m.facility_error_not_storage,
    storage_full: m.facility_error_storage_full,
    no_place: m.facility_error_no_place,
    own_target: m.facility_error_own_target,
    target_ruined: m.facility_error_target_ruined,
    out_of_reach: m.facility_error_out_of_reach,
    safe_zone: m.facility_error_safe_zone,
    not_ruin: m.facility_error_not_ruin,
    ruin_claimed: m.facility_error_ruin_claimed,
    needs_water: m.facility_error_needs_water,
    internal_error: m.facility_error_internal_error,
    offline: m.facility_error_offline,
    timeout: m.facility_error_timeout,
  };

export const STATE_TEXT: Readonly<Record<ConditionState, () => string>> = {
  ok: m.facility_state_ok,
  damaged: m.facility_state_damaged,
  disabled: m.facility_state_disabled,
  ruin: m.facility_state_ruin,
};

export const JOB_TEXT: Readonly<Record<FacilityJobKind, () => string>> = {
  build: m.facility_job_build,
  upgrade: m.facility_job_upgrade,
  repair: m.facility_job_repair,
  beacon_repair: m.facility_job_repair,
  equipment: m.facility_job_equipment,
  plot: m.facility_job_plot,
  floor: m.facility_job_floor,
};

/** 명령 하나를 보내고 성공했는지(문구·목록 다시 받기는 칸이 한다) */
export type FacilityRun = (command: FacilityCommand) => Promise<boolean>;

/** ppm → 정수 % */
export const percentOf = (ppm: number): number => Math.floor(ppm / 10_000);

/** 아이템 이름(화면 자료의 재료 목록·자리 줄 → 지금 언어, 없으면 ID) */
export function stackName(data: FacilitiesOverviewResponse, item: string): string {
  const name =
    data.materials.find((entry) => entry.item === item)?.name ??
    data.places.flatMap((place) => place.lines).find((line) => line.item === item)?.name;
  return pickName(name ?? undefined, item);
}

/** 쓸 수 있는 재료(아이템 ID → 수량) */
export type Stock = ReadonlyMap<string, bigint>;

/**
 * 그 2차맵·도시에서 건물 재료로 쓸 수 있는 물자(서버와 같은 자리 규칙, D-516 361): 그 도시 창고 + 그 도시의 내 창고 시설 + 그 2차맵 내
 * 유닛 화물
 */
export const stockAt = (data: FacilitiesOverviewResponse, mapKey: number, cityId: number | null): Stock =>
  materialStockAt(data.places, mapKey, cityId);

/**
 * 영토 비콘(1차맵) 재료로 쓸 수 있는 물자(서버와 같은 자리 규칙, 질문 410 ①): 그 세력에서 비콘 칸과 가장 가까운 도시의 내 도시 창고 + 그
 * 도시의 내 창고 시설(화물 없음). 도시가 없으면 비었다
 */
export const beaconStock = (data: FacilitiesOverviewResponse, cityId: number | null): Stock =>
  cityId === null ? new Map() : materialStockAt(data.places, null, cityId);

/** 재료가 다 있나 */
export function canAfford(stock: Stock, stacks: readonly FacilityStackView[]): boolean {
  return stacks.every((stack) => (stock.get(stack.item) ?? 0n) >= BigInt(stack.qty));
}

/** 재료 줄 글: "소나무 원목 12 · 철광석 7"(모자라면 "(가진 수)"를 붙인다) */
export function stacksText(
  data: FacilitiesOverviewResponse,
  stock: Stock,
  stacks: readonly FacilityStackView[],
): string {
  if (stacks.length === 0) return m.facility_no_materials();
  return stacks
    .map((stack) => {
      const have = stock.get(stack.item) ?? 0n;
      const base = `${stackName(data, stack.item)} ${fmt(String(stack.qty))}`;
      return have >= BigInt(stack.qty) ? base : `${base} ${m.facility_have_short({ have: fmt(have) })}`;
    })
    .join(" · ");
}

/** 일꾼 수로 줄어든 시간(서버 withBuilders와 같다) */
export function cutTime(ms: number, units: number, data: FacilitiesOverviewResponse): number {
  const cut = Math.min(data.rules.builderCutMaxPm, Math.max(0, units) * data.rules.builderCutPm);
  return Math.round((ms * (1000 - cut)) / 1000);
}
