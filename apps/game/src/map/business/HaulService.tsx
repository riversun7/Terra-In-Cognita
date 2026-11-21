// 운반 대행 요금 칸(건물 판 [관리] — 물류센터, 주인·대주주·운영자) — 기획 D-576(물류센터 맡기기), D-555 1505(운반 대행 서비스업), D-570 1822(판매자가
// 정하고 적정가를 보인다), docs/adr/2026-11-16-logistics-center.md. 주인이 한 단위(무게 × 칸 — 질문 2213 요금 단위 나) 요금을 정하고(0 = 받지 않음), 곁에
// 적정가(운반꾼 한 명 인건비 × 한 단위 나르는 시간 + 수수료 + 세금)를 보인다. 명령은 business_price(item = service:haul, 프로토콜 54). 판정·요금 셈은 서버.
// 바뀜 (기획 대조 2277): 요금·적정가는 그 도시 나라 화폐다 — 값 뒤에 화폐 코드(서버 haulService.currency, 옛 서버는 칸 없음).
import { HAUL_SERVICE_ITEM } from "@terra/shared/businessBooks";
import { useState } from "react";
import { formatAmount, parseAmountInput } from "../../economy/amount.ts";
import { fmt } from "../../economy/economyText.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { useBooksCommand } from "./BooksParts.tsx";
import type { BooksOk } from "./booksData.ts";
import { fairText } from "./businessText.ts";

export function HaulService({ books, reload }: { readonly books: BooksOk; readonly reload: () => void }) {
  const locale = getLocale();
  const [rate, setRate] = useState("");
  const { sending, notice, run } = useBooksCommand(reload);
  const service = books.haulService;
  if (!service) return null;
  const parsed = parseAmountInput(rate);
  const save = (price: string): void =>
    run(
      { t: "business_price", buildingId: books.buildingId, item: HAUL_SERVICE_ITEM, price },
      m.haul_service_saved(),
    );
  // 값 + 나라 화폐 코드(기획 대조 2277)
  const money = (value: string): string =>
    service.currency ? `${formatAmount(value, locale)} ${service.currency}` : formatAmount(value, locale);
  const charged = money(service.charged);
  const unit = m.haul_service_unit({
    kg: fmt(BigInt(Math.floor(service.unitG / 1000))),
    cells: service.unitCells,
  });
  return (
    <section className="bp-card" aria-label={m.haul_service_title()} data-part="books-haul-service">
      <h3 className="bp-card-title">{m.haul_service_title()}</h3>
      <p className="bp-muted">{m.haul_service_hint()}</p>
      <p className="bp-good-head" data-part="haul-service-rate">
        <span className="bp-grow">
          {service.charged === "0"
            ? m.haul_service_closed()
            : service.perUnit === null
              ? m.haul_service_rate_fair({ rate: charged })
              : m.haul_service_rate({ rate: charged })}
        </span>
        <span className="bp-tag">
          {service.workers > 0
            ? m.haul_service_workers({ count: service.workers })
            : m.haul_service_no_workers()}
        </span>
      </p>
      <p className="bp-muted" data-part="haul-service-unit">
        {unit}
      </p>
      <p className="bp-muted" data-part="haul-service-fair">
        {fairText(service.fair, money)}
      </p>
      <div className="bp-form-row">
        <input
          className="bp-input"
          inputMode="numeric"
          aria-label={m.haul_service_input()}
          placeholder={m.haul_service_input()}
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
          {m.haul_service_save()}
        </button>
        <button
          type="button"
          className="button-small"
          disabled={sending}
          onClick={() => save(service.fair.price)}
        >
          {m.haul_service_use_fair()}
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
