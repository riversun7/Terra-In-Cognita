// 내 걸린 주문 [취소](실제 거래소, WebSocket market_cancel) — docs/adr/2026-11-07-play-flow.md WP4. 거래창·내 주문이 같이 쓴다.
// 보내는 동안 잠그고, 실패하면 단추 옆에 이유를 알린다. 거두면 거래 자료를 다시 받는다(줄이 끝난 주문으로 옮겨 간다).
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { sendMarketCommand } from "./marketCommands.ts";
import { MARKET_ERROR_TEXT, refreshMarket } from "./marketText.ts";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const order = Number(orderId);
  return (
    <>
      <button
        type="button"
        className="button-small"
        aria-disabled={sending ? "true" : undefined}
        onClick={() => {
          if (sending || !Number.isSafeInteger(order) || order <= 0) return;
          setSending(true);
          setError(null);
          void sendMarketCommand({ t: "market_cancel", order }).then((outcome) => {
            setSending(false);
            if (!outcome.ok) {
              setError(MARKET_ERROR_TEXT[outcome.code]());
              return;
            }
            refreshMarket();
          });
        }}
      >
        {sending ? m.market_sending() : m.economy_order_cancel()}
      </button>
      {error === null ? null : (
        <span className="eco-sent" role="status" data-tone="error">
          {error}
        </span>
      )}
    </>
  );
}
