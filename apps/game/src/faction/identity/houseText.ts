// 가문 가입 문구 표 — 결과 코드·한 일·가문 소식 종류 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 질문 985 다·983 가·986 가, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)".
import type { HouseMemberAction, HouseMemberResultCode } from "@terra/protocol";
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
};

type NoticeText = (values: { house: string; other: string; count: number }) => string;

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
};

/** 가문 소식 한 줄의 문장(모르는 종류는 "가문 소식이 있습니다") */
export function houseNoticeText(notice: HouseNoticeRow): string {
  const values = {
    house: notice.houseName,
    other: notice.other ?? m.fid_house_someone(),
    count: notice.count,
  };
  return isHouseNoticeKind(notice.kind)
    ? NOTICE_TEXT[notice.kind](values)
    : m.fid_house_notice_unknown({ house: notice.houseName });
}
