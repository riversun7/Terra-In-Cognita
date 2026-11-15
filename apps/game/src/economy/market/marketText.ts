// 거래소 명령 결과 문구·자료 다시 받기 — docs/adr/2026-11-07-play-flow.md WP4. 주문표·내 주문이 같이 쓴다.
// 결과 코드 → 문구는 표로 고른다(메시지 키를 계산해서 읽지 않는다, AGENTS 6장 oxlint).
import { m } from "../../paraglide/messages.js";
import { parseAmountInput } from "../amount.ts";
import { useHoldings, useMarketBook, useMarketCities, useMarketItems, useOrders } from "../queries.ts";
import type { MarketOutcome } from "./marketCommands.ts";

type MarketCode = Extract<MarketOutcome, { ok: false }>["code"];

export const MARKET_ERROR_TEXT: Readonly<Record<MarketCode, () => string>> = {
  sign_in_required: m.market_err_sign_in,
  busy: m.market_err_busy,
  rate_limited: m.market_err_rate_limited,
  internal_error: m.market_err_internal,
  market_paused: m.market_err_paused,
  unknown_city: m.market_err_unknown_city,
  unknown_item: m.market_err_unknown_item,
  unknown_order: m.market_err_unknown_order,
  not_owner: m.market_err_not_owner,
  insufficient_goods: m.market_err_goods,
  insufficient_funds: m.market_err_funds,
  invalid_amount: m.market_err_invalid_amount,
  order_limit: m.market_err_order_limit,
  no_liquidity: m.market_err_no_liquidity,
  no_exchange: m.market_err_no_exchange,
  offline: m.market_err_offline,
  timeout: m.market_err_timeout,
};

/** 입력칸 글 → 보낼 10진 글자(자리 나눔을 뺀다). 읽을 수 없으면 null */
export function wireAmount(text: string): string | null {
  const input = parseAmountInput(text);
  return input.kind === "ok" && input.value > 0n ? String(input.value) : null;
}

/** 거래소 명령·체결 알림 뒤: 거래창·도시 목록·물건 목록·내 주문·창고를 다시 받는다 */
export function refreshMarket(): void {
  useMarketBook.refreshAll();
  useMarketCities.refreshAll();
  useMarketItems.refreshAll();
  useOrders.refreshAll();
  useHoldings.refreshAll();
}
