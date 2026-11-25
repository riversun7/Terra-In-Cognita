// 도시 가입 승인 방식·차단 사유 문구(GovernmentSheet·CityHousePanel 공용 — 지연 조각을 끌어오지 않게 따로 둔다)
import type { CityJoinApproverKind } from "@terra/shared/government";
import { m } from "../paraglide/messages.js";

export function approverLabel(kind: CityJoinApproverKind): string {
  if (kind === "leader") return m.gov_city_join_approver_leader();
  if (kind === "auto") return m.gov_city_join_approver_auto();
  return m.gov_city_join_approver_mayor();
}

export function applyBlockText(code: string): string {
  switch (code) {
    case "no_house":
      return m.gov_city_join_block_no_house();
    case "not_leader":
      return m.gov_city_join_block_not_leader();
    case "has_city":
      return m.gov_city_join_block_has_city();
    case "same_city":
      return m.gov_city_join_block_same_city();
    case "wrong_city":
      return m.gov_city_join_block_wrong_city();
    case "home_wait":
      return m.gov_city_join_block_home_wait();
    case "blacklisted":
      return m.gov_city_join_block_blacklisted();
    case "standing_too_low":
      return m.gov_city_join_block_standing_too_low();
    case "already_applied":
      return m.gov_city_join_block_already_applied();
    default:
      return m.fid_house_error_failed();
  }
}
