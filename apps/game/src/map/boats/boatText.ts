// 배 화면 문구·고르기 도우미(순수, 시험 대상) — docs/adr/2026-11-13-boats.md. 결과 코드 → 문구, 고른 유닛에 보일 배 단추.
import type { MapUnit } from "@terra/shared/mapUnits";
import { m } from "../../paraglide/messages.js";
import { durationText } from "../travelData.ts";
import type { BoatOutcome } from "./boatCommands.ts";

/** 결과 → 알림 문구. nowMs = 지금 서버 시각(만드는 중 남은 시간) */
export function boatOutcomeText(
  kind: "build" | "board" | "leave",
  outcome: BoatOutcome,
  nowMs: number = Date.now(),
): string {
  if (outcome.ok) {
    if (kind === "build" && outcome.readyAtMs !== undefined && outcome.boatId === undefined)
      return m.boat_build_started({ time: durationText(outcome.readyAtMs - nowMs) });
    if (kind === "build") return m.boat_build_done({ id: outcome.boatId ?? 0 });
    if (kind === "board") return outcome.walking ? m.boat_board_walking() : m.boat_board_done();
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
