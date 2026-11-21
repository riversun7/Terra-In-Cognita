// 외교 화면 문구 표(메시지 키 — ko·en 함께, apps/game/messages). 조약 상태·차례·결과 코드·행동·참전 요청 상태 → 문구
import type { DiplomacyAction, DiplomacyResultCode } from "@terra/protocol";
import type { DiplomacyNationRef, TreatyState, TreatyWaiting, WarJoinState } from "@terra/shared/treaty";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";

type Text = () => string;

export const TREATY_STATE_TEXT = {
  proposed: m.dip_state_proposed,
  negotiating: m.dip_state_negotiating,
  active: m.dip_state_active,
  expired: m.dip_state_expired,
  broken: m.dip_state_broken,
  declined: m.dip_state_declined,
  lapsed: m.dip_state_lapsed,
} satisfies Record<TreatyState, Text>;

export const TREATY_STATE_TONE = {
  proposed: "warn",
  negotiating: "warn",
  active: "good",
  expired: "plain",
  broken: "bad",
  declined: "plain",
  lapsed: "plain",
} as const satisfies Record<TreatyState, "good" | "warn" | "bad" | "plain">;

export const WAITING_TEXT = {
  our_vote: m.dip_wait_our_vote,
  us: m.dip_wait_us,
  their_vote: m.dip_wait_their_vote,
  them: m.dip_wait_them,
} satisfies Record<Exclude<TreatyWaiting, null>, Text>;

export const JOIN_STATE_TEXT = {
  requested: m.dip_join_requested,
  joined: m.dip_join_joined,
  declined: m.dip_join_declined,
  lapsed: m.dip_join_lapsed,
} satisfies Record<WarJoinState, Text>;

export const DIPLOMACY_ERROR_TEXT = {
  sign_in_required: m.dip_err_sign_in_required,
  busy: m.dip_err_busy,
  rate_limited: m.dip_err_rate_limited,
  internal_error: m.dip_err_internal_error,
  no_nation: m.dip_err_no_nation,
  not_leader: m.dip_err_not_leader,
  unknown_target: m.dip_err_unknown_target,
  invalid_clauses: m.dip_err_invalid_clauses,
  already_open: m.dip_err_already_open,
  unknown_treaty: m.dip_err_unknown_treaty,
  not_your_turn: m.dip_err_not_your_turn,
  not_ally: m.dip_err_not_ally,
  not_at_war: m.dip_err_not_at_war,
  already_at_war: m.dip_err_already_at_war,
  already_requested: m.dip_err_already_requested,
  offline: m.dip_err_offline,
  timeout: m.dip_err_timeout,
} satisfies Record<DiplomacyResultCode | "offline" | "timeout", Text>;

export const DIPLOMACY_DONE_TEXT = {
  sent: m.dip_done_sent,
  voting: m.dip_done_voting,
  active: m.dip_done_active,
  declined: m.dip_done_declined,
  requested: m.dip_done_requested,
  joined: m.dip_done_joined,
  refused: m.dip_done_refused,
} satisfies Record<DiplomacyAction, Text>;

/** 나라 이름(모르면 "나라 #ID") */
export function nationText(row: DiplomacyNationRef): string {
  if (!row.name) return m.gov_nation_unnamed({ id: String(row.id) });
  return getLocale() === "ko" ? row.name.ko : row.name.en;
}
