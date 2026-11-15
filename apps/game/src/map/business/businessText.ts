// 사업장 장부 글자 — 칸·거래 종류·결과 코드 → 메시지 키(ko·en). docs/adr/2026-11-15-business-ledger.md
import type { BusinessResultCode } from "@terra/protocol";
import type { BookColumn, BookOwnerKind } from "@terra/shared/businessBooks";
import { m } from "../../paraglide/messages.js";

export const COLUMN_TEXT: Readonly<Record<BookColumn, () => string>> = {
  income: m.books_col_income,
  sales: m.books_col_sales,
  tax: m.books_col_tax,
  wages: m.books_col_wages,
  upkeep: m.books_col_upkeep,
  lodging: m.books_col_lodging,
  debt: m.books_col_debt,
  settlement: m.books_col_settlement,
  invest: m.books_col_invest,
  goods: m.books_col_goods,
  other: m.books_col_other,
};

export const OWNER_TEXT: Readonly<Record<BookOwnerKind, () => string>> = {
  me: m.books_owner_me,
  player: m.books_owner_player,
  npc: m.books_owner_npc,
};

export const RESULT_TEXT: Readonly<Record<BusinessResultCode | "offline" | "timeout", () => string>> = {
  busy: m.books_err_busy,
  rate_limited: m.books_err_busy,
  sign_in_required: m.books_err_sign_in,
  internal_error: m.books_err_busy,
  offline: m.books_err_offline,
  timeout: m.books_err_offline,
  unknown_building: m.books_err_not_business,
  not_business: m.books_err_not_business,
  forbidden: m.books_err_forbidden,
  insufficient_funds: m.books_err_funds,
  invalid_amount: m.books_err_amount,
  not_money: m.books_err_amount,
  not_goods: m.books_err_amount,
  not_for_sale: m.books_err_not_for_sale,
  below_lot: m.books_err_below_lot,
  insufficient_goods: m.books_err_goods,
  no_place: m.books_err_no_place,
  suspended: m.books_err_suspended,
  in_debt: m.books_err_in_debt,
  nothing_to_settle: m.books_err_nothing,
  unknown_unit: m.books_err_forbidden,
};

/** 화폐 자산 이름(서버 시험 화폐 → 이름, 나라 화폐 cur:<코드> → 코드) */
export function moneyName(asset: string): string {
  if (asset === "s3_test_credit") return m.economy_asset_test_credit();
  return asset.startsWith("cur:") ? asset.slice(4).toUpperCase() : asset;
}
