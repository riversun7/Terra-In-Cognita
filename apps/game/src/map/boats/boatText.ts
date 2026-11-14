// 배 화면 문구·고르기 도우미(순수, 시험 대상) — docs/adr/2026-11-13-boats.md. 결과 코드 → 문구, 고른 유닛에 보일 배 단추.
import type { MapUnit } from "@terra/shared/mapUnits";
import { m } from "../../paraglide/messages.js";
import type { BoatOutcome } from "./boatCommands.ts";

/** 결과 → 알림 문구 */
export function boatOutcomeText(kind: "build" | "board" | "leave", outcome: BoatOutcome): string {
  if (outcome.ok) {
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
