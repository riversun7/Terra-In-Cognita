// 거래소 이용료 칸(건물 판 [관리] — 주인·대주주·운영자) — 외환 거래소 환전 이용료(질문 2086, 줄기 exchange-3)와 물자 거래소 이용료(기획 D-574 질문 2085
// "거래소 주인이 정하고 위아래 한도만 설정값", 줄기 misc-574)가 같은 틀이다. 기획 D-564 1682("상업시설은 모두 외주를 받아 장사"), D-570 1822("판매자가
// 정하고 적정가격을 보여 줌"). 주인이 요율(만분율)을 정하고, 곁에 적정 요율(설정 칸)과 정할 수 있는 아래·위 끝을 보인다. 명령은 business_price(item =
// service:fx_fee 프로토콜 52 / service:exchange_fee 프로토콜 66). 판정·셈은 서버.
import { EXCHANGE_FEE_ITEM, FX_FEE_ITEM, type FeeRateView } from "@terra/shared/businessBooks";
import { useState } from "react";
import { parseAmountInput } from "../../economy/amount.ts";
import { bpPercent } from "../../economy/economyText.ts";
import { m } from "../../paraglide/messages.js";
import { useBooksCommand } from "./BooksParts.tsx";
import type { BooksOk } from "./booksData.ts";

interface FeeText {
  readonly title: string;
  readonly hint: string;
  readonly saved: string;
  readonly part: string;
}

function FeeRateCard({
  books,
  reload,
  fee,
  item,
  text,
}: {
  readonly books: BooksOk;
  readonly reload: () => void;
  readonly fee: FeeRateView;
  readonly item: string;
  readonly text: FeeText;
}) {
  const [rate, setRate] = useState("");
  const { sending, notice, run } = useBooksCommand(reload);
  const minBp = fee.minBp ?? 0;
  const parsed = parseAmountInput(rate);
  const valid = parsed.kind === "ok" && parsed.value <= BigInt(fee.maxBp) && parsed.value >= BigInt(minBp);
  const save = (bp: number | bigint): void =>
    run({ t: "business_price", buildingId: books.buildingId, item, price: String(bp) }, text.saved);
  const pct = bpPercent(fee.charged);
  const fair = Math.min(fee.maxBp, Math.max(minBp, fee.fairBp));
  return (
    <section className="bp-card" aria-label={text.title} data-part={text.part}>
      <h3 className="bp-card-title">{text.title}</h3>
      <p className="bp-muted">{text.hint}</p>
      <p className="bp-good-head" data-part="fee-rate">
        <span className="bp-grow">
          {fee.charged === 0
            ? m.fx_fee_service_closed()
            : fee.bp === null
              ? m.fx_fee_service_rate_fair({ pct })
              : m.fx_fee_service_rate({ pct })}
        </span>
      </p>
      <p className="bp-muted" data-part="fee-fair">
        {m.fee_service_range({
          pct: bpPercent(fee.fairBp),
          min: bpPercent(minBp),
          max: bpPercent(fee.maxBp),
        })}
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
        <button type="button" className="button-small" disabled={sending} onClick={() => save(fair)}>
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

/** 외환 거래소 환전 이용료(질문 2086) */
export function FxFeeService({ books, reload }: { readonly books: BooksOk; readonly reload: () => void }) {
  if (!books.fxFee) return null;
  return (
    <FeeRateCard
      books={books}
      reload={reload}
      fee={books.fxFee}
      item={FX_FEE_ITEM}
      text={{
        title: m.fx_fee_service_title(),
        hint: m.fx_fee_service_hint(),
        saved: m.fx_fee_service_saved(),
        part: "books-fx-fee",
      }}
    />
  );
}

/** 물자 거래소 이용료(D-574 질문 2085) */
export function ExchangeFeeService({
  books,
  reload,
}: {
  readonly books: BooksOk;
  readonly reload: () => void;
}) {
  if (!books.exchangeFee) return null;
  return (
    <FeeRateCard
      books={books}
      reload={reload}
      fee={books.exchangeFee}
      item={EXCHANGE_FEE_ITEM}
      text={{
        title: m.exchange_fee_service_title(),
        hint: m.exchange_fee_service_hint(),
        saved: m.exchange_fee_service_saved(),
        part: "books-exchange-fee",
      }}
    />
  );
}
