// 환전 이용료 칸(건물 판 [관리] — 외환 거래소, 주인·대주주·운영자) — 질문 2086(줄기 exchange-3), 기획 D-564 1682("상업시설은 모두 외주를 받아 장사"),
// D-570 1822("판매자가 정하고 적정가격을 보여 줌"). 주인이 요율(만분율)을 정하고(0 = 받지 않음), 곁에 적정 요율(설정 칸)과 위 끝을 보인다. 이 화폐 나라에서
// 요율이 가장 낮은 외환 거래소가 회차마다 판 사람의 이용료를 받는다. 명령은 business_price(item = service:fx_fee, 프로토콜 56). 판정·셈은 서버.
import { FX_FEE_ITEM } from "@terra/shared/businessBooks";
import { useState } from "react";
import { parseAmountInput } from "../../economy/amount.ts";
import { bpPercent } from "../../economy/economyText.ts";
import { m } from "../../paraglide/messages.js";
import { useBooksCommand } from "./BooksParts.tsx";
import type { BooksOk } from "./booksData.ts";

export function FxFeeService({ books, reload }: { readonly books: BooksOk; readonly reload: () => void }) {
  const [rate, setRate] = useState("");
  const { sending, notice, run } = useBooksCommand(reload);
  const fee = books.fxFee;
  if (!fee) return null;
  const parsed = parseAmountInput(rate);
  const valid = parsed.kind === "ok" && parsed.value <= BigInt(fee.maxBp);
  const save = (bp: number | bigint): void =>
    run(
      { t: "business_price", buildingId: books.buildingId, item: FX_FEE_ITEM, price: String(bp) },
      m.fx_fee_service_saved(),
    );
  const pct = bpPercent(fee.charged);
  return (
    <section className="bp-card" aria-label={m.fx_fee_service_title()} data-part="books-fx-fee">
      <h3 className="bp-card-title">{m.fx_fee_service_title()}</h3>
      <p className="bp-muted">{m.fx_fee_service_hint()}</p>
      <p className="bp-good-head" data-part="fx-fee-rate">
        <span className="bp-grow">
          {fee.charged === 0
            ? m.fx_fee_service_closed()
            : fee.bp === null
              ? m.fx_fee_service_rate_fair({ pct })
              : m.fx_fee_service_rate({ pct })}
        </span>
      </p>
      <p className="bp-muted" data-part="fx-fee-fair">
        {m.fx_fee_service_fair({ pct: bpPercent(fee.fairBp), max: bpPercent(fee.maxBp) })}
      </p>
      <div className="bp-form-row">
        <input
          className="bp-input"
          inputMode="numeric"
          aria-label={m.fx_fee_service_input()}
          placeholder={m.fx_fee_service_input()}
          value={rate}
          onChange={(event) => setRate(event.target.value)}
        />
        <button
          type="button"
          className="button-small"
          disabled={sending || !valid}
          onClick={() => {
            if (parsed.kind === "ok" && valid) save(parsed.value);
          }}
        >
          {m.fx_fee_service_save()}
        </button>
        <button type="button" className="button-small" disabled={sending} onClick={() => save(fee.fairBp)}>
          {m.fx_fee_service_use_fair()}
        </button>
      </div>
      {notice ? (
        <p className="bp-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
