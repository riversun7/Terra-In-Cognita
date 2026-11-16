// 외주 수리 칸(건물 판 [관리] — 수리 줄이 있는 공방, 주인·대주주·운영자) — 기획 D-570 1785(사용자 원문 "그 공방(사업장) 일꾼이 고치고 요금은
// 주인이 정한다")·1822("적정가격 계산은 필요 재료비 인건비, 수수료 세금 등을 대략계산하여 가격설정시 보여줌"). 주인이 시간당 요금을 정하고(0 = 받지
// 않음), 곁에 적정가(이 공방이 내는 시간당 재료비 — 기획 대조 2167 — ·일꾼 인건비·수수료·세금)를 보인다. 재료·인건비는 공방이 낸다(D-573 2048). 명령은 business_price(item = service:equipment_repair,
// 프로토콜 48). 판정·요금 셈은 서버.
import { REPAIR_SERVICE_ITEM } from "@terra/shared/businessBooks";
import { useState } from "react";
import { formatAmount, parseAmountInput } from "../../economy/amount.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { useBooksCommand } from "./BooksParts.tsx";
import type { BooksOk } from "./booksData.ts";
import { fairText } from "./businessText.ts";

export function RepairService({ books, reload }: { readonly books: BooksOk; readonly reload: () => void }) {
  const locale = getLocale();
  const [rate, setRate] = useState("");
  const { sending, notice, run } = useBooksCommand(reload);
  const service = books.repairService;
  if (!service) return null;
  const parsed = parseAmountInput(rate);
  const save = (price: string): void =>
    run(
      { t: "business_price", buildingId: books.buildingId, item: REPAIR_SERVICE_ITEM, price },
      m.repair_service_saved(),
    );
  const charged = formatAmount(service.charged, locale);
  return (
    <section className="bp-card" aria-label={m.repair_service_title()} data-part="books-repair-service">
      <h3 className="bp-card-title">{m.repair_service_title()}</h3>
      <p className="bp-muted">{m.repair_service_hint()}</p>
      <p className="bp-good-head" data-part="repair-service-rate">
        <span className="bp-grow">
          {service.charged === "0"
            ? m.repair_service_closed()
            : service.perHour === null
              ? m.repair_service_rate_fair({ rate: charged })
              : m.repair_service_rate({ rate: charged })}
        </span>
        <span className="bp-tag">
          {service.workers > 0
            ? m.repair_service_workers({ count: service.workers })
            : m.repair_service_no_workers()}
        </span>
      </p>
      <p className="bp-muted" data-part="repair-service-fair">
        {fairText(service.fair, (value) => formatAmount(value, locale))}
      </p>
      <div className="bp-form-row">
        <input
          className="bp-input"
          inputMode="numeric"
          aria-label={m.repair_service_input()}
          placeholder={m.repair_service_input()}
          value={rate}
          onChange={(event) => setRate(event.target.value)}
        />
        <button
          type="button"
          className="button-small"
          disabled={sending || parsed.kind !== "ok"}
          onClick={() => {
            if (parsed.kind === "ok") save(String(parsed.value));
          }}
        >
          {m.repair_service_save()}
        </button>
        <button
          type="button"
          className="button-small"
          disabled={sending}
          onClick={() => save(service.fair.price)}
        >
          {m.repair_service_use_fair()}
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
