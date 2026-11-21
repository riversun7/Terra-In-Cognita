// 나라 의결 화면 문구 표(메시지 키 — ko·en 함께, apps/game/messages). 안건 종류·상태·까닭·결과 코드 → 문구
import type { GovernanceResultCode } from "@terra/protocol";
import type { AgendaFailReason, AgendaKind, AgendaStatus, GovernanceHouse } from "@terra/shared/governance";
import { m } from "../../paraglide/messages.js";

type Text = () => string;

export const AGENDA_KIND_TEXT = {
  leader_election: m.gov_kind_leader_election,
  leader_removal: m.gov_kind_leader_removal,
  regime_change: m.gov_kind_regime_change,
  war_declaration: m.gov_kind_war_declaration,
  tax_change: m.gov_kind_tax_change,
  city_independence: m.gov_kind_city_independence,
  treasury_share_sale: m.gov_kind_treasury_share_sale,
  peace: m.gov_kind_peace,
  currency_stage: m.gov_kind_currency_stage,
  house_independence: m.gov_kind_house_independence,
  treasury_share_buy: m.gov_kind_treasury_share_buy,
  treaty: m.gov_kind_treaty,
} satisfies Record<AgendaKind, Text>;

export const AGENDA_STATUS_TEXT = {
  open: m.gov_status_open,
  passed: m.gov_status_passed,
  enacted: m.gov_status_enacted,
  failed: m.gov_status_failed,
  cancelled: m.gov_status_cancelled,
} satisfies Record<AgendaStatus, Text>;

export const FAIL_REASON_TEXT = {
  quorum: m.gov_reason_quorum,
  threshold: m.gov_reason_threshold,
  tie: m.gov_reason_tie,
  no_candidates: m.gov_reason_no_candidates,
  invalid: m.gov_reason_invalid,
  regime: m.gov_reason_regime,
} satisfies Record<AgendaFailReason, Text>;

export const GOVERNANCE_ERROR_TEXT = {
  sign_in_required: m.gov_err_sign_in_required,
  busy: m.gov_err_busy,
  rate_limited: m.gov_err_rate_limited,
  internal_error: m.gov_err_internal_error,
  no_nation: m.gov_err_no_nation,
  not_eligible: m.gov_err_not_eligible,
  dictatorship: m.gov_err_dictatorship,
  kind_disabled: m.gov_err_kind_disabled,
  already_open: m.gov_err_already_open,
  limit: m.gov_err_limit,
  same_regime: m.gov_err_same_regime,
  no_majority: m.gov_err_no_majority,
  unknown_target: m.gov_err_unknown_target,
  already_at_war: m.gov_err_already_at_war,
  unknown_agenda: m.gov_err_unknown_agenda,
  not_open: m.gov_err_not_open,
  invalid_choice: m.gov_err_invalid_choice,
  registration_closed: m.gov_err_registration_closed,
  barred: m.gov_err_barred,
  coup_disabled: m.gov_err_coup_disabled,
  coup_cooldown: m.gov_err_coup_cooldown,
  coup_open: m.gov_err_coup_open,
  unknown_coup: m.gov_err_unknown_coup,
  not_enough_shares: m.gov_err_not_enough_shares,
  not_at_war: m.gov_err_not_at_war,
  coup_protected: m.gov_err_coup_protected,
  not_majority_holder: m.gov_err_not_majority_holder,
  not_enough_funds: m.gov_err_not_enough_funds,
  offline: m.gov_err_offline,
  timeout: m.gov_err_timeout,
} satisfies Record<GovernanceResultCode | "offline" | "timeout", Text>;

/** 쿠데타 상태(질문 2433 답·D-583) */
export const COUP_STATUS_TEXT = {
  gathering: m.gov_coup_status_gathering,
  won: m.gov_coup_status_won,
  lost: m.gov_coup_status_lost,
  cancelled: m.gov_coup_status_cancelled,
} satisfies Record<"gathering" | "won" | "lost" | "cancelled", Text>;

/** 가문 이름(NPC 가문은 성 하나라 "{성} 가문", 이름이 없으면 "이름 없는 가문") */
export function houseText(house: Pick<GovernanceHouse, "name" | "npc"> | null): string {
  if (!house) return m.gov_ruling_none();
  if (house.name === null) return m.gov_house_unnamed();
  return house.npc ? m.gov_house_npc({ name: house.name }) : house.name;
}

/** 무게 ÷ 투표권 → ‰(0~1000, 투표권이 0이면 0) */
export function permilleOf(part: string, total: string): number {
  const whole = BigInt(total);
  if (whole <= 0n) return 0;
  const value = Number((BigInt(part) * 1000n) / whole);
  return Math.min(1000, Math.max(0, value));
}
