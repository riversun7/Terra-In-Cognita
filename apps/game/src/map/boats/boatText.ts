// 배 화면 문구·고르기 도우미(순수, 시험 대상) — docs/adr/2026-11-13-boats.md. 결과 코드 → 문구, 고른 유닛에 보일 배 단추.
import type { MapUnit } from "@terra/shared/mapUnits";
import { m } from "../../paraglide/messages.js";
import { durationText } from "../travelData.ts";
import type { BoatOutcome } from "./boatCommands.ts";

/** 결과 → 알림 문구. nowMs = 지금 서버 시각(만드는 중 남은 시간) */
export type BoatOutcomeKind =
  | "build"
  | "board"
  | "leave"
  | "repair"
  | "berth"
  | "dock_time"
  | "policy"
  | "release"
  | "refuel"
  | "overheat"
  | "crew"
  | "seize"
  | "unload"
  | "gear"
  | "load";

export function boatOutcomeText(
  kind: BoatOutcomeKind,
  outcome: BoatOutcome,
  nowMs: number = Date.now(),
): string {
  if (outcome.ok) {
    if (kind === "build" && outcome.readyAtMs !== undefined && outcome.boatId === undefined)
      return m.boat_build_started({ time: durationText(outcome.readyAtMs - nowMs) });
    if (kind === "build") return m.boat_build_done({ id: outcome.boatId ?? 0 });
    if (kind === "board") return outcome.walking ? m.boat_board_walking() : m.boat_board_done();
    if (kind === "repair")
      return outcome.walking
        ? m.boat_repair_sailing()
        : m.boat_repair_started({ time: durationText((outcome.readyAtMs ?? nowMs) - nowMs) });
    if (kind === "berth") return outcome.walking ? m.boat_berth_sailing() : m.boat_berth_done();
    if (kind === "dock_time") return outcome.walking ? m.boat_dock_time_sailing() : m.boat_dock_time_done();
    if (kind === "policy") return m.boat_policy_done();
    if (kind === "release") return m.boat_release_done({ id: outcome.boatId ?? 0 });
    if (kind === "refuel") return m.boat_refuel_done();
    if (kind === "overheat") return m.boat_overheat_done();
    if (kind === "crew") return m.boat_crew_done();
    if (kind === "seize") return m.boat_seize_done({ id: outcome.boatId ?? 0 });
    if (kind === "unload") return m.boat_unload_done();
    if (kind === "gear") return m.boat_gear_done();
    if (kind === "load") return m.boat_load_done();
    return m.boat_leave_done();
  }
  switch (outcome.code) {
    case "forbidden":
      return m.boat_error_forbidden();
    case "not_dock":
      return m.boat_error_not_dock();
    case "not_ready":
      return m.boat_error_not_ready();
    case "insufficient_materials":
      return m.boat_error_materials();
    case "no_water":
      return m.boat_error_no_water();
    case "boat_full":
      return m.boat_error_full();
    case "no_shore":
      return m.boat_error_no_shore();
    case "no_path":
      return m.boat_error_no_path();
    case "unavailable":
      return m.boat_error_unavailable();
    case "already_aboard":
      return m.boat_error_already_aboard();
    case "empty":
      return m.boat_error_empty();
    case "dock_busy":
      return outcome.readyAtMs === undefined
        ? m.boat_error_dock_busy_plain()
        : m.boat_error_dock_busy({ time: durationText(outcome.readyAtMs - nowMs) });
    case "not_shipyard":
      return m.boat_error_not_shipyard();
    case "not_berth":
      return m.boat_error_not_berth();
    case "not_trade_dock":
      return m.boat_error_not_trade_dock();
    case "unknown_boat_type":
      return m.boat_error_unknown_type();
    case "no_berth":
      return m.boat_error_no_berth();
    case "trade_full":
      return m.boat_error_trade_full();
    case "berth_denied":
      return m.boat_error_berth_denied();
    case "harbor_closed":
      return m.boat_error_harbor_closed();
    case "insufficient_funds":
      return m.boat_error_funds();
    case "hull_full":
      return m.boat_error_hull_full();
    case "module_locked":
      return m.boat_error_module_locked();
    case "invalid_policy":
      return m.boat_error_invalid_policy();
    case "wrong_map":
      return m.boat_error_wrong_map();
    case "not_docked":
      return m.boat_error_not_docked();
    case "not_moored":
      return m.boat_error_not_moored();
    case "fuel_full":
      return m.boat_error_fuel_full();
    case "fuel_empty":
      return m.boat_error_fuel_empty();
    case "cooling":
      return m.boat_error_cooling({ time: durationText((outcome.readyAtMs ?? nowMs) - nowMs) });
    case "not_aboard":
      return m.boat_error_not_aboard();
    case "post_full":
      return m.boat_error_post_full();
    case "own_boat":
      return m.boat_error_own_boat();
    case "not_drifting":
      return m.boat_error_not_drifting();
    case "no_fuel_items":
      return m.boat_error_no_fuel_items();
    case "hold_empty":
      return m.boat_error_hold_empty();
    case "not_catch_gear":
      return m.boat_error_not_catch_gear();
    case "bad_slot":
      return m.boat_error_bad_slot();
    case "hold_full":
      return m.boat_error_hold_full();
    case "busy":
    case "rate_limited":
    case "offline":
    case "timeout":
      return m.boat_error_busy();
    default:
      return m.boat_error_other({ code: outcome.code });
  }
}

/** 고른 유닛에 보일 배 단추: 배(승객 내리기), 탄 유닛(내리기), 걷는 유닛(가장 가까운 자리 있는 내 배에 타기), 없음 */
export type BoatChoice =
  | { readonly kind: "boat"; readonly boatId: number; readonly passengers: number; readonly capacity: number }
  | { readonly kind: "rider"; readonly boatId: number }
  | { readonly kind: "board"; readonly boatId: number }
  | { readonly kind: "none" };

export function boatChoiceOf(unit: MapUnit | undefined, units: readonly MapUnit[] | null): BoatChoice {
  if (!unit) return { kind: "none" };
  if (unit.kind === "boat") {
    const boat = unit.boat;
    return {
      kind: "boat",
      boatId: unit.unitId,
      passengers: boat?.passengers.length ?? 0,
      capacity: boat?.capacity ?? 0,
    };
  }
  if (unit.aboard !== null && unit.aboard !== undefined) return { kind: "rider", boatId: unit.aboard };
  if (unit.hold !== null) return { kind: "none" };
  let best: { id: number; d: number } | undefined;
  for (const other of units ?? []) {
    if (other.kind !== "boat" || !other.boat || other.boat.passengers.length >= other.boat.capacity) continue;
    const d = Math.max(Math.abs(other.cellX - unit.cellX), Math.abs(other.cellY - unit.cellY));
    if (!best || d < best.d || (d === best.d && other.unitId < best.id)) best = { id: other.unitId, d };
  }
  return best ? { kind: "board", boatId: best.id } : { kind: "none" };
}

/** 배 줄 상태: 내구도(‰ → %)·연료·집 정박장(없으면 "집 없음 — 빨리 닳음")·표류·오버히트(D-559). 정보가 없으면 null */
export function boatStatusText(boat: MapUnit["boat"]): string | null {
  if (boat?.hullPm === undefined) return null;
  const hull = m.boat_hull({ percent: Math.floor(boat.hullPm / 10) });
  const home =
    boat.homeId === null || boat.homeId === undefined ? m.boat_home_none() : m.boat_home({ id: boat.homeId });
  const parts = [hull];
  if (boat.fuelPm !== undefined) parts.push(m.boat_fuel({ percent: Math.floor(boat.fuelPm / 10) }));
  parts.push(home);
  if (boat.drifting === true) parts.push(m.boat_drifting());
  if (boat.overheat === true) parts.push(m.boat_overheating());
  return parts.join(" · ");
}

/** 부두 판: 만드는 중인 배의 남은 시간 문구(없으면 null) */
export function dockJobText(job: { readonly readyAt: number } | undefined, nowMs: number): string | null {
  return job ? m.boat_dock_building({ time: durationText(job.readyAt - nowMs) }) : null;
}

/**
 * 오브젝트 판의 배 몫(기획 D-541 1280 가, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B3)" — 서버 gather/service.ts begin과 같은 규칙):
 * - from_boat: 명령 유닛이 배에 탔고 바다 오브젝트(배로만 닿는 것·어군) — [채집]이 배를 몬다
 * - not_from_boat: 배에 탔는데 땅 오브젝트 — 내려야 캔다
 * - boat_only: 걷는 유닛인데 배로만 닿는 오브젝트
 * - none: 배와 상관없음
 */
export type BoatGather = "from_boat" | "not_from_boat" | "boat_only" | "none";

export function boatGatherOf(
  kind: { readonly boat?: boolean | undefined } | undefined,
  moving: boolean,
  aboard: boolean,
): BoatGather {
  const sea = kind?.boat === true || moving;
  if (aboard) return sea ? "from_boat" : "not_from_boat";
  return kind?.boat === true ? "boat_only" : "none";
}
