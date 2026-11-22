// 가문 연맹 문구 표(league-2, 사용자 결정 D-590 — 조항 카드는 league-3 D-593에서 없앰) — 결과 코드 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
import type { HouseLeagueResultCode } from "@terra/protocol";
import type { HouseLeagueHouse } from "@terra/shared/houseLeague";
import { m } from "../../paraglide/messages.js";

type Text = () => string;

/** 연맹 명령 결과 코드 → 문장 */
export const LEAGUE_ERROR_TEXT: Readonly<Record<HouseLeagueResultCode | "offline" | "timeout", Text>> = {
  sign_in_required: m.fid_found_sign_in,
  busy: m.fid_found_busy,
  rate_limited: m.fid_error_rate_limited,
  internal_error: m.fid_league_error_failed,
  offline: m.fid_league_error_failed,
  timeout: m.fid_league_error_failed,
  not_house_head: m.fid_league_error_not_head,
  unknown_league: m.fid_league_error_unknown,
  invalid_house: m.fid_league_error_house,
  already_member: m.fid_league_error_member,
  not_member: m.fid_league_error_not_member,
  not_representative: m.fid_league_error_not_rep,
  representative_must_delegate: m.fid_league_error_not_rep,
  same_house: m.fid_league_error_same,
  consent_required: m.fid_league_error_failed,
  no_request: m.fid_league_error_no_request,
  invalid_clause: m.fid_league_error_clause,
};

/** 가문 이름(없으면 "가문 p:12") */
export const leagueHouseName = (house: HouseLeagueHouse): string =>
  house.name ?? m.fid_league_unnamed({ key: house.key });
