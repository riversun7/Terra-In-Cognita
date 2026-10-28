// 2차맵 화면이 코드로 고르는 문구 — 서버 결과 코드(문장 없이 코드만 온다)와 지형 실패 이유를 지금 언어의 문장으로.
// m[키]처럼 계산해서 읽지 않고 표에 정적으로 적는다(Paraglide의 안 쓰는 문구 빼기, oxlint import(namespace) 규칙, AGENTS 6장).
// 이 표는 2차맵 조각에만 들어간다(첫 화면 묶음에 넣지 않으려고 ui/messageTable.ts가 아니라 여기에 둔다).
import type { ResultCode } from "@terra/protocol";
import { m } from "../paraglide/messages.js";
import type { TerrainState } from "./feedTypes.ts";

/** 결과 코드 → 문장. 코드가 늘면(프로토콜) satisfies가 빠진 코드를 알려 준다 */
const RESULT_CODE_MESSAGES = {
  sign_in_required: m.map_code_sign_in_required,
  forbidden: m.map_code_forbidden,
  rate_limited: m.map_code_rate_limited,
  busy: m.map_code_busy,
  unknown_map: m.map_code_unknown_map,
  not_visible: m.map_code_not_visible,
  too_many_maps: m.map_code_too_many_maps,
  unknown_unit: m.map_code_unknown_unit,
  unknown_building: m.map_code_unknown_building,
  superseded: m.map_code_superseded,
  start_blocked: m.map_code_start_blocked,
  goal_blocked: m.map_code_goal_blocked,
  no_path: m.map_code_no_path,
  budget_exceeded: m.map_code_budget_exceeded,
  path_too_complex: m.map_code_path_too_complex,
  out_of_bounds: m.map_code_out_of_bounds,
  overlaps_building: m.map_code_overlaps_building,
  overlaps_road: m.map_code_overlaps_road,
  overlaps_unit: m.map_code_overlaps_unit,
  blocked_terrain: m.map_code_blocked_terrain,
  building_limit: m.map_code_building_limit,
  invalid_request: m.map_code_invalid_request,
  internal_error: m.map_code_internal_error,
  // 기기가 붙인 코드: 정해진 시간 안에 결과가 없음
  no_reply: m.map_code_no_reply,
} satisfies Record<ResultCode | "no_reply", () => string>;

export function resultText(code: ResultCode | "no_reply"): string {
  return RESULT_CODE_MESSAGES[code]();
}

export function terrainFailureText(reason: Extract<TerrainState, { kind: "failed" }>["reason"]): string {
  switch (reason) {
    case "network":
      return m.err_network();
    case "sign_in":
      return m.map_code_sign_in_required();
    case "not_found":
      return m.map_terrain_not_found();
    case "server":
      return m.err_server();
    case "invalid":
      return m.map_terrain_invalid();
    case "render":
      return m.map_error();
    default: {
      const unhandled: never = reason;
      return unhandled;
    }
  }
}
