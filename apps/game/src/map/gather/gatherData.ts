// 채집·들어가기 자료(tRPC gather.objects·loops·building)와 문구 도우미 — docs/adr/2026-11-07-gather-objects.md 6절. 엔진을 가져오지 않는다.
// 시각은 서버 ms다. 남은 시간은 기기 시계에 앱 연결이 잰 시계 차이(serverLink.clockOffsetMs)를 더해 센다.
import type { GatherResultCode } from "@terra/protocol";
import type {
  GatherBuildingResponse,
  GatherDepositKind,
  GatherEnterResult,
  GatherLoopsResponse,
  GatherName,
  GatherObjectsResponse,
  GatherPhase,
  GatherStop,
} from "@terra/shared/gather";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";

const REQUEST_TIMEOUT_MS = 10_000;
/** 오브젝트를 다시 묻는 간격(ms) */
export const OBJECTS_POLL_MS = 20_000;
/** 내 채집을 다시 묻는 간격(ms, 진행 중인 줄이 있을 때) */
export const LOOPS_POLL_MS = 3_000;
/** 진행 중인 줄이 없을 때 */
export const LOOPS_IDLE_POLL_MS = 15_000;

export function loadGatherObjects(mapKey: number, signal?: AbortSignal): Promise<GatherObjectsResponse> {
  return api.gather.objects.query({ mapKey }, { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

export function loadGatherLoops(signal?: AbortSignal): Promise<GatherLoopsResponse> {
  return api.gather.loops.query(undefined, { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

export function loadGatherBuilding(
  buildingId: number,
  signal?: AbortSignal,
): Promise<GatherBuildingResponse> {
  return api.gather.building.query(
    { buildingId },
    { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
}

/** 지금 언어의 이름 */
export const nameText = (name: GatherName | null, fallback: string): string =>
  name ? (getLocale() === "en" ? name.en : name.ko) : fallback;

/** 남은 ms → "N분"(1분 안이면 "1분 안") */
export function minutesText(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / 60_000);
  return minutes <= 1 ? m.gather_minute_under() : m.gather_minutes({ minutes });
}

/** g → kg 글자(소수 한 자리) */
export function kgText(grams: number): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(Math.max(0, grams) / 1000);
}

export function phaseText(phase: GatherPhase): string {
  switch (phase) {
    case "to_object":
      return m.gather_phase_to_object();
    case "gathering":
      return m.gather_phase_gathering();
    case "to_deposit":
      return m.gather_phase_to_deposit();
    case "entering":
      return m.gather_phase_entering();
    case "done":
      return m.gather_phase_done();
    default: {
      const unhandled: never = phase;
      return unhandled;
    }
  }
}

export function depositText(kind: GatherDepositKind): string {
  switch (kind) {
    case "camp":
      return m.gather_deposit_camp();
    case "storage":
      return m.gather_deposit_storage();
    case "city":
      return m.gather_deposit_city();
    default: {
      const unhandled: never = kind;
      return unhandled;
    }
  }
}

export function stopText(stop: GatherStop): string {
  switch (stop) {
    case "stopped":
      return m.gather_stop_stopped();
    case "depleted":
      return m.gather_stop_depleted();
    case "storage_full":
      return m.gather_stop_storage_full();
    case "tired":
      return m.gather_stop_tired();
    case "interrupted":
      return m.gather_stop_interrupted();
    case "no_path":
      return m.gather_stop_no_path();
    case "no_deposit":
      return m.gather_stop_no_deposit();
    case "tier_too_high":
      return m.gather_stop_tier_too_high();
    case "entered":
      return m.gather_stop_entered();
    default: {
      const unhandled: never = stop;
      return unhandled;
    }
  }
}

export function enterText(result: GatherEnterResult, units: number): string {
  switch (result) {
    case "deposited":
      return m.gather_enter_deposited({ count: units });
    case "assigned":
      return m.gather_enter_assigned();
    case "inside":
      return m.gather_enter_inside();
    default: {
      const unhandled: never = result;
      return unhandled;
    }
  }
}

/** 보내지 못한 까닭 → 문구 */
export function gatherErrorText(code: GatherResultCode | "offline" | "timeout"): string {
  switch (code) {
    case "forbidden":
      return m.gather_error_forbidden();
    case "unknown_unit":
      return m.gather_error_unknown_unit();
    case "unknown_object":
    case "unknown_building":
      return m.gather_error_gone();
    case "wrong_map":
      return m.gather_error_wrong_map();
    case "depleted":
      return m.gather_error_depleted();
    case "unavailable":
      return m.gather_error_unavailable();
    case "no_path":
      return m.gather_error_no_path();
    case "not_gathering":
      return m.gather_error_not_gathering();
    case "offline":
      return m.map_command_offline();
    case "sign_in_required":
    case "busy":
    case "rate_limited":
    case "internal_error":
    case "timeout":
      return m.gather_error_retry();
    default: {
      const unhandled: never = code;
      return unhandled;
    }
  }
}
