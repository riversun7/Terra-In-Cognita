// 2차맵 사이 이동 자료(tRPC world.travelPlan·world.travels)와 순수 도우미 — docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동"·"WP11".
// 1차맵 명령 판(확인 단계·가는 중)과 2차맵 화면(따라가기)이 같이 쓴다. 엔진을 가져오지 않는다.
// WP11: 위험 구간·비용 줄(594 나), 건너뛰는 2차맵(593 나), 정찰이 돌아오는 중(591 나).
// 시각은 서버 ms다. 기기 시계로 보일 때는 앱 연결이 잰 시계 차이(serverLink.clockOffsetMs)를 뺀다.
import type { TravelResultCode } from "@terra/protocol";
import type {
  WorldMapFaction,
  WorldTravel,
  WorldTravelPlan,
  WorldTravelPlanResponse,
  WorldTravelProblem,
  WorldTravelStop,
  WorldTravelsResponse,
} from "@terra/shared/worldMap";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { factionName } from "./worldMapData.ts";

const REQUEST_TIMEOUT_MS = 10_000;
/** 가는 중인 길을 다시 묻는 간격(ms, 1차맵 명령 판·2차맵 따라가기) */
export const TRAVEL_POLL_MS = 5_000;

/** 확인 단계 길. unitId가 없으면 내 사이보그 본체 */
export function loadTravelPlan(
  target: { readonly mapKey: number; readonly x: number; readonly y: number; readonly unitId?: number },
  signal?: AbortSignal,
): Promise<WorldTravelPlanResponse> {
  return api.world.travelPlan.query(
    {
      mapKey: target.mapKey,
      x: target.x,
      y: target.y,
      ...(target.unitId === undefined ? {} : { unitId: target.unitId }),
    },
    { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
}

export function loadTravels(signal?: AbortSignal): Promise<WorldTravelsResponse> {
  return api.world.travels.query(undefined, { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/** 확인 단계에 보이는 위험 구간 줄 수(넘으면 "N곳 더") */
const DANGER_LINES = 2;

/** 그 유닛의 길(가는 중이거나 최근 끝난 것). 없으면 null */
export function travelOf(travels: readonly WorldTravel[], unitId: number): WorldTravel | null {
  return travels.find((travel) => travel.unitId === unitId) ?? null;
}

/** 길의 목적 2차맵 */
export function travelTarget(travel: Pick<WorldTravel, "route">): number | null {
  return travel.route[travel.route.length - 1] ?? null;
}

/** 걸리는 시간(ms) → "약 N분"·"약 H시간 M분"(1분 안이면 "1분 안") */
export function durationText(ms: number): string {
  const minutes = Math.ceil(Math.max(0, ms) / 60_000);
  if (minutes <= 1) return m.world_travel_minute_under();
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return m.world_travel_minutes({ minutes });
  return rest === 0
    ? m.world_travel_hours({ hours })
    : m.world_travel_hours_minutes({ hours, minutes: rest });
}

/** 서버 시각 → 기기 시계의 시:분(지금 언어) */
export function clockText(serverMs: number, clockOffsetMs: number): string {
  return new Intl.DateTimeFormat(getLocale(), { hour: "2-digit", minute: "2-digit" }).format(
    new Date(serverMs - clockOffsetMs),
  );
}

/** 정수 → 지금 언어의 자릿수 글자 */
function countText(value: number): string {
  return new Intl.NumberFormat(getLocale()).format(value);
}

/** 명령 판 한 줄(위험 구간 줄은 danger — 눈에 띄게 칠한다) */
export interface PlanLine {
  readonly text: string;
  readonly danger: boolean;
}

/**
 * 확인 단계의 위험·비용 줄(594 나): 비용(걷기 = 없음), 위험 구간(2차맵 몇 번째 · 오염 · 전쟁 중 세력, DANGER_LINES줄까지), 위험이 없으면
 * "알려진 위험 없음", 모르는 2차맵 수
 */
export function dangerLines(
  plan: Pick<WorldTravelPlan, "cost" | "dangers" | "unknownMaps">,
  factions: readonly WorldMapFaction[],
): PlanLine[] {
  const lines: PlanLine[] = [{ text: m.world_travel_cost_walk(), danger: false }];
  if (plan.dangers.length === 0) lines.push({ text: m.world_travel_danger_none(), danger: false });
  for (const danger of plan.dangers.slice(0, DANGER_LINES)) {
    const at = danger.leg + 1;
    const value = danger.pollution === null ? "" : countText(danger.pollution);
    const names = danger.warFactionIds.map((id) => factionName(factions, id)).join(", ");
    const text =
      danger.pollutionHigh && names
        ? m.world_travel_danger_both({ at, value, factions: names })
        : danger.pollutionHigh
          ? m.world_travel_danger_pollution({ at, value })
          : m.world_travel_danger_war({ at, factions: names });
    lines.push({ text, danger: true });
  }
  if (plan.dangers.length > DANGER_LINES)
    lines.push({
      text: m.world_travel_danger_more({ count: plan.dangers.length - DANGER_LINES }),
      danger: true,
    });
  if (plan.unknownMaps > 0)
    lines.push({ text: m.world_travel_unknown_maps({ count: plan.unknownMaps }), danger: false });
  return lines;
}

/** 가는 중 한 줄(1차맵 명령 판): 건너뛰는 중·정찰이 돌아오는 중·가는 중 */
export function goingText(travel: Pick<WorldTravel, "leg" | "route" | "returning" | "hidden">): string {
  const step = { at: travel.leg + 1, total: travel.route.length };
  if (travel.hidden) return m.world_travel_hidden(step);
  return travel.returning ? m.world_travel_returning(step) : m.world_travel_going(step);
}

/** 거리(m) → km 글자(10km 안은 소수 한 자리) */
export function kmText(meters: number): string {
  const km = Math.max(0, meters) / 1000;
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km);
}

/** 보낼 수 없는 까닭(확인 단계 문제·보내기 결과 코드·연결) → 문구 */
export function travelProblemText(
  problem: WorldTravelProblem | TravelResultCode | "offline" | "timeout",
): string {
  switch (problem) {
    case "no_cyborg":
    case "unknown_unit":
      return m.world_command_party_none();
    case "forbidden":
      return m.world_travel_problem_forbidden();
    case "unknown_map":
      return m.world_city_not_loaded();
    case "no_route":
      return m.world_travel_problem_no_route();
    case "border_blocked":
    case "goal_blocked":
    case "start_blocked":
    case "no_path":
    case "budget_exceeded":
    case "path_too_complex":
      return m.world_travel_problem_blocked();
    case "unavailable":
      return m.world_travel_problem_unavailable();
    case "in_transit":
      return m.world_travel_problem_in_transit();
    case "map_full":
      return m.world_travel_problem_map_full();
    case "not_traveling":
      return m.world_travel_problem_not_traveling();
    // 유닛 공격(unit_attack, 프로토콜 123 — 줄기 fixes-1117c)
    case "out_of_reach":
      return m.unit_attack_out_of_reach();
    case "own_target":
      return m.unit_attack_own_target();
    case "safe_zone":
      return m.unit_attack_safe_zone();
    case "offline":
      return m.map_command_offline();
    case "sign_in_required":
    case "busy":
    case "rate_limited":
    case "internal_error":
    case "timeout":
      return m.world_travel_problem_retry();
    default: {
      const unhandled: never = problem;
      return unhandled;
    }
  }
}

/** 멈춘 까닭 → 문구 */
export function travelStopText(stop: WorldTravelStop): string {
  switch (stop) {
    case "cancelled":
      return m.world_travel_stopped_cancelled();
    case "interrupted":
      return m.world_travel_stopped_interrupted();
    case "blocked":
      return m.world_travel_stopped_blocked();
    case "unavailable":
      return m.world_travel_stopped_unavailable();
    case "raided":
      return m.world_travel_stopped_raided();
    case "encounter":
      return m.world_travel_stopped_encounter();
    case "map_full":
      return m.world_travel_stopped_map_full();
    default: {
      const unhandled: never = stop;
      return unhandled;
    }
  }
}
