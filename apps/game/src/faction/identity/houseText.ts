// 가문 가입 문구 표 — 결과 코드·한 일·가문 소식 종류 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 질문 985 다·983 가·986 가, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)".
import type {
  HouseCityResultCode,
  HouseMemberAction,
  HouseMemberResultCode,
  HouseRecruitResultCode,
} from "@terra/protocol";
import { type HouseNoticeKind, type HouseNoticeRow, isHouseNoticeKind } from "@terra/shared/house";
import { m } from "../../paraglide/messages.js";

type Text = () => string;

/** 가입 명령 결과 코드 → 문장 */
export const HOUSE_MEMBER_ERROR_TEXT: Readonly<Record<HouseMemberResultCode | "offline" | "timeout", Text>> =
  {
    sign_in_required: m.fid_found_sign_in,
    busy: m.fid_found_busy,
    rate_limited: m.fid_error_rate_limited,
    internal_error: m.fid_house_error_failed,
    no_cyborg: m.fid_house_no_cyborg,
    not_leader: m.fid_house_error_not_leader,
    not_found: m.fid_house_error_not_found,
    not_in_house: m.fid_house_error_not_in_house,
    already_in_house: m.fid_house_error_already_in_house,
    other_nation: m.fid_house_error_other_nation,
    house_full: m.fid_house_error_house_full,
    too_many_pending: m.fid_house_error_too_many_pending,
    too_many_applications: m.fid_house_error_too_many_applications,
    already_requested: m.fid_house_error_already_requested,
    self: m.fid_house_error_self,
    leader_cannot_leave: m.fid_house_leader_note,
    not_alone: m.fid_house_error_not_alone,
    has_city: m.fid_house_error_has_city,
    unknown_city: m.fid_home_error_unknown_city,
    same_city: m.fid_home_error_same_city,
    home_wait: m.fid_home_error_wait,
    not_ruler: m.fid_house_error_not_ruler,
    entry_fee_short: m.fid_home_error_entry_fee,
    insufficient_funds: m.fid_house_error_insufficient_funds,
    tax_too_high: m.fid_house_error_tax_too_high,
    offline: m.fid_found_offline,
    timeout: m.fid_found_offline,
  };

/** 한 일 → 문장(가문장이 신청·초대를 받아 든 경우는 accepted) */
export const HOUSE_ACTION_TEXT: Readonly<Record<HouseMemberAction | "accepted", Text>> = {
  invited: m.fid_house_done_invited,
  applied: m.fid_house_done_applied,
  joined: m.fid_house_done_joined,
  accepted: m.fid_house_done_accepted,
  declined: m.fid_house_done_declined,
  withdrawn: m.fid_house_done_withdrawn,
  left: m.fid_house_done_left,
  kicked: m.fid_house_done_kicked,
  handed_over: m.fid_house_done_handed_over,
  dissolved: m.fid_house_done_dissolved,
  home_set: m.fid_home_done,
  home_announced: m.fid_home_done_announced,
  home_cancelled: m.fid_home_done_cancelled,
  entry_policy_set: m.fid_house_done_entry_policy,
  donated: m.fid_house_done_donated,
  vault_taken: m.fid_house_done_vault_taken,
  tax_set: m.fid_house_done_tax_set,
  build_policy_set: m.fid_house_done_build_policy,
};

/** 가문 도시 명령 결과 코드 → 문장(질문 1005 가) */
export const HOUSE_CITY_ERROR_TEXT: Readonly<Record<HouseCityResultCode | "offline" | "timeout", Text>> = {
  sign_in_required: m.fid_found_sign_in,
  busy: m.fid_found_busy,
  rate_limited: m.fid_error_rate_limited,
  internal_error: m.fid_house_error_failed,
  no_cyborg: m.fid_house_no_cyborg,
  no_house: m.fid_city_error_no_house,
  not_leader: m.fid_house_error_not_leader,
  mode_locked: m.fid_city_error_mode_locked,
  regime_required: m.fid_city_error_regime_required,
  bad_spot: m.fid_city_error_bad_spot,
  too_close: m.fid_city_error_too_close,
  foreign_influence: m.fid_city_error_foreign_influence,
  blocked: m.fid_city_error_blocked,
  terms_changed: m.fid_city_error_terms_changed,
  insufficient_funds: m.fid_city_error_insufficient_funds,
  unknown_ruin: m.fid_city_error_unknown_ruin,
  not_owner: m.fid_city_error_not_owner,
  offline: m.fid_found_offline,
  timeout: m.fid_found_offline,
};

/** 가문 도시 구인 결과(프로토콜 25, 질문 1041 다) */
export const HOUSE_RECRUIT_ERROR_TEXT: Readonly<
  Record<HouseRecruitResultCode | "offline" | "timeout", Text>
> = {
  sign_in_required: m.fid_found_sign_in,
  busy: m.fid_found_busy,
  rate_limited: m.fid_error_rate_limited,
  internal_error: m.fid_house_error_failed,
  no_cyborg: m.fid_house_no_cyborg,
  no_house: m.fid_city_error_no_house,
  not_leader: m.fid_house_error_not_leader,
  not_house_city: m.fid_recruit_error_not_house_city,
  cards_changed: m.fid_recruit_error_cards_changed,
  taken: m.fid_recruit_error_taken,
  insufficient_funds: m.fid_recruit_error_insufficient_funds,
  offline: m.fid_found_offline,
  timeout: m.fid_found_offline,
};

type NoticeText = (values: { house: string; other: string; count: number; reason: string }) => string;

const NOTICE_TEXT: Readonly<Record<HouseNoticeKind, NoticeText>> = {
  invite_accepted: (v) => m.fid_house_notice_invite_accepted(v),
  invite_declined: (v) => m.fid_house_notice_invite_declined(v),
  apply_accepted: (v) => m.fid_house_notice_apply_accepted(v),
  apply_declined: (v) => m.fid_house_notice_apply_declined(v),
  member_left: (v) => m.fid_house_notice_member_left(v),
  kicked: (v) => m.fid_house_notice_kicked(v),
  nation_left: (v) => m.fid_house_notice_nation_left(v),
  house_moved: (v) => m.fid_house_notice_house_moved({ count: v.count }),
  name_reset: (v) => m.fid_house_notice_name_reset(v),
  leader_given: (v) => m.fid_house_notice_leader_given(v),
  leader_changed: (v) => m.fid_house_notice_leader_changed(v),
  city_gained: (v) => m.fid_house_notice_city_gained({ house: v.house }),
  home_changed: (v) => m.fid_house_notice_home_changed({ house: v.house, other: v.other }),
  // D-570: 공고(reason = 새 도시 이름)·공고 거둠(reason = 서버가 거둔 까닭 has_city·unknown_city, 없으면 가문장)
  home_announced: (v) =>
    m.fid_house_notice_home_announced({ house: v.house, other: v.other, city: v.reason }),
  home_cancelled: (v) =>
    v.reason === "has_city"
      ? m.fid_house_notice_home_cancelled_city({ house: v.house })
      : v.reason === "unknown_city"
        ? m.fid_house_notice_home_cancelled_gone({ house: v.house })
        : v.reason === "entry_fee"
          ? m.fid_house_notice_home_cancelled_fee({ house: v.house })
          : m.fid_house_notice_home_cancelled({ house: v.house, other: v.other }),
};

/** 가문 소식 한 줄의 문장(모르는 종류는 "가문 소식이 있습니다") */
export function houseNoticeText(notice: HouseNoticeRow): string {
  const values = {
    house: notice.houseName,
    other: notice.other ?? m.fid_house_someone(),
    count: notice.count,
    reason: notice.reason ?? "",
  };
  return isHouseNoticeKind(notice.kind)
    ? NOTICE_TEXT[notice.kind](values)
    : m.fid_house_notice_unknown({ house: notice.houseName });
}
