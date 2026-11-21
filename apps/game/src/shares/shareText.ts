// 지분 화면 문구 고르기(결과 코드·주주 종류 → 메시지 키) — docs/adr/2026-11-21-share-market.md
import type { CityShareResultCode } from "@terra/protocol";
import type { CityShareHolderKind } from "@terra/shared/cityShares";
import { m } from "../paraglide/messages.js";

export const CITY_SHARE_RESULT_TEXT: Readonly<
  Record<CityShareResultCode | "offline" | "timeout", () => string>
> = {
  sign_in_required: m.books_err_sign_in,
  busy: m.books_err_busy,
  rate_limited: m.books_err_busy,
  internal_error: m.books_err_busy,
  offline: m.books_err_offline,
  timeout: m.books_err_offline,
  unknown_city: m.city_shares_err_unknown_city,
  not_house_head: m.city_shares_err_not_house_head,
  order_limit: m.shares_err_order_limit,
  insufficient_shares: m.shares_err_shares,
  insufficient_funds: m.books_err_funds,
  dictatorship_majority: m.city_shares_err_majority,
  unknown_order: m.shares_err_unknown_order,
  forbidden: m.city_shares_err_forbidden,
};

export const HOLDER_KIND_TEXT: Readonly<Record<CityShareHolderKind, () => string>> = {
  treasury: m.city_shares_kind_treasury,
  nation: m.city_shares_kind_nation,
  house: m.city_shares_kind_house,
  player: m.city_shares_kind_player,
  me: m.city_shares_kind_me,
  my_house: m.city_shares_kind_my_house,
};
