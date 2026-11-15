// 유닛 용돈 주기(유닛 화면) — 기획 D-555 1508(유닛은 사유재산으로 숙박비를 내고, 모자라면 회복이 떨어진다. 플레이어는 돈을 선물할 수 있다)·D-097.
// docs/adr/2026-11-15-business-ledger.md. 명령은 WebSocket unit_gift(프로토콜 34). 서버가 내 유닛·내 지갑을 다시 본다.
import { useState } from "react";
import { parseAmountInput } from "../../economy/amount.ts";
import { m } from "../../paraglide/messages.js";
import { sendBusinessCommand } from "./businessCommands.ts";
import { RESULT_TEXT } from "./businessText.ts";
import "./business.css";

export function UnitGift({ unitId }: { readonly unitId: number }) {
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const parsed = parseAmountInput(amount);
  return (
    <section className="books-owner" aria-label={m.gift_title()} data-part="unit-gift">
      <p className="books-heading">{m.gift_title()}</p>
      <p className="books-muted">{m.gift_hint()}</p>
      <div className="books-row">
        <input
          className="books-input"
          inputMode="numeric"
          aria-label={m.gift_amount()}
          placeholder={m.gift_amount()}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <button
          type="button"
          className="button-small"
          disabled={sending || parsed.kind !== "ok" || parsed.value <= 0n}
          onClick={() => {
            if (parsed.kind !== "ok") return;
            setSending(true);
            void sendBusinessCommand({ t: "unit_gift", unitId, amount: String(parsed.value) })
              .then((outcome) => {
                setNotice(outcome.ok ? m.gift_done() : RESULT_TEXT[outcome.code]());
                if (outcome.ok) setAmount("");
              })
              .finally(() => setSending(false));
          }}
        >
          {m.gift_send()}
        </button>
      </div>
      {notice ? (
        <p className="books-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
