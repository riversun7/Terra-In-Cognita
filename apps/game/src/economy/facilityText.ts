// 건물 칸 문구·작은 셈 — 결과 코드 → 문구, 상태 이름, 재료 줄(이름 × 수량, 모자람 표지), 미리 셈(서버와 같은 식, 판정은 서버)
// docs/adr/2026-11-07-buildings-runtime.md
import type {
  FacilitiesOverviewResponse,
  FacilityJobKind,
  FacilityStackView,
} from "@terra/shared/facilities";
import type { ConditionState } from "@terra/shared/facilityRuntime";
import type { FacilityResultCode } from "@terra/protocol";
import { m } from "../paraglide/messages.js";
import { fmt, pickName } from "./economyText.ts";
import type { FacilityCommand } from "./facilityCommands.ts";

export const FACILITY_ERROR_TEXT: Readonly<Record<FacilityResultCode | "offline" | "timeout", () => string>> =
  {
    sign_in_required: m.facility_error_sign_in_required,
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
};

/** 명령 하나를 보내고 성공했는지(문구·목록 다시 받기는 칸이 한다) */
export type FacilityRun = (command: FacilityCommand) => Promise<boolean>;

/** ppm → 정수 % */
export const percentOf = (ppm: number): number => Math.floor(ppm / 10_000);

/** 아이템 이름(화면 자료의 재료 목록 → 지금 언어, 없으면 ID) */
export function stackName(data: FacilitiesOverviewResponse, item: string): string {
  return pickName(data.materials.find((entry) => entry.item === item)?.name ?? undefined, item);
}

/** 가진 수(모든 자리 합, 10진 글자 → BigInt) */
export function haveOf(data: FacilitiesOverviewResponse, item: string): bigint {
  const found = data.materials.find((entry) => entry.item === item);
  return found ? BigInt(found.have) : 0n;
}

/** 재료가 다 있나 */
export function canAfford(data: FacilitiesOverviewResponse, stacks: readonly FacilityStackView[]): boolean {
  return stacks.every((stack) => haveOf(data, stack.item) >= BigInt(stack.qty));
}

/** 재료 줄 글: "소나무 원목 12 · 철광석 7"(모자라면 "(가진 수)"를 붙인다) */
export function stacksText(data: FacilitiesOverviewResponse, stacks: readonly FacilityStackView[]): string {
  if (stacks.length === 0) return m.facility_no_materials();
  return stacks
    .map((stack) => {
      const have = haveOf(data, stack.item);
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
