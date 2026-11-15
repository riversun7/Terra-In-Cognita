// 건물 재무 화면(/buildings/:buildingId/books) — 사용자 요청 2026-11-15 "모두가 볼수있는 재무제표 손익계산 등의 정보 페이지 보여라 또한 주식을
// 사고팔수있게도 해라", 기획 D-555 1513(장부는 모두에게 공개)·44 §6(생산시설 지분), docs/adr/2026-11-15-building-screen.md.
// - 누구나 연다(남의 사업장도). 손익계산서(1·7·30일: 매출 → 비용 → 순이익), 재무상태(금고·창고 값·갚을 돈 → 순자산), 현금 흐름(정산·넣기·
//   적자), 날마다 막대, 주주·지분 시장(동시호가 주문), 최근 거래.
// - 자료는 tRPC facilities.books 하나(장부 칸과 같은 함수). 주문은 WebSocket(ShareMarket.tsx).
import { useState } from "react";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { BOOK_PERIODS, type BookPeriod, timeText, useBooks } from "./booksData.ts";
import {
  BalanceSheet,
  BooksAlert,
  BooksSummary,
  CashFlows,
  DayBars,
  EntryList,
  IncomeStatement,
} from "./BooksParts.tsx";
import { ownerText, pmText } from "./businessText.ts";
import { ShareMarket } from "./ShareMarket.tsx";
import "../building/building.css";

export default function BuildingBooksScreen({ buildingId }: { readonly buildingId: number }) {
  const locale = getLocale();
  const [days, setDays] = useState<BookPeriod>(7);
  const { books, failed, reload } = useBooks(
    buildingId,
    days,
    Number.isSafeInteger(buildingId) && buildingId > 0,
  );
  const titleRef = useMountFocus<HTMLHeadingElement>(true);
  const ok = books?.status === "ok" ? books : null;
  const name = ok?.facilityName ? (locale === "ko" ? ok.facilityName.ko : ok.facilityName.en) : null;
  const top = ok?.holders[0];

  return (
    <section className="screen screen-wide bbs" aria-labelledby="bbs-title" data-building={buildingId}>
      <div className="screen-header">
        <h1 id="bbs-title" ref={titleRef} className="screen-title" tabIndex={-1}>
          {name === null ? m.building_finance_title() : m.building_finance_title_of({ name })}
        </h1>
        <BackButton />
      </div>
      {books?.status === "not_business" ? (
        <p className="bp-muted" data-part="bbs-not-business">
          {m.building_finance_not_business()}
        </p>
      ) : !ok ? (
        <p className="bp-muted">{failed ? m.books_load_failed() : m.books_loading()}</p>
      ) : (
        <div className="bbs-grid">
          <div className="bp-card bbs-head">
            <p className="bp-lead">
              {m.building_finance_owner({ owner: ownerText(ok.ownerName, ok.ownerKind) })}
              {top && ok.holders.length > 1
                ? ` · ${m.building_owner_top({ name: ownerText(top.name, top.kind), pct: pmText(top.pm ?? 0) })}`
                : ""}
            </p>
            <BooksAlert books={ok} />
            <fieldset className="bp-periods">
              <legend className="bp-muted">{m.books_period()}</legend>
              {BOOK_PERIODS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === days ? "button-small button-primary" : "button-small"}
                  aria-pressed={value === days}
                  onClick={() => setDays(value)}
                >
                  {m.books_days({ days: value })}
                </button>
              ))}
            </fieldset>
            <BooksSummary books={ok} />
            <p className="bp-muted">{m.books_updated({ at: timeText(ok.toMs, locale) })}</p>
          </div>
          <section className="bp-card" aria-labelledby="bbs-income">
            <h2 id="bbs-income" className="bp-card-title">
              {m.books_income_statement()}
            </h2>
            <IncomeStatement books={ok} />
            <DayBars days={ok.days} />
          </section>
          <section className="bp-card" aria-labelledby="bbs-balance">
            <h2 id="bbs-balance" className="bp-card-title">
              {m.books_balance_sheet()}
            </h2>
            <BalanceSheet books={ok} />
            <h3 className="bp-card-title">{m.books_cash_flows()}</h3>
            <CashFlows books={ok} />
          </section>
          <section className="bbs-shares" aria-label={m.building_tab_shares()}>
            <ShareMarket buildingId={buildingId} holders={ok.holders} market={ok.market} reload={reload} />
          </section>
          <section className="bp-card" aria-labelledby="bbs-entries">
            <h2 id="bbs-entries" className="bp-card-title">
              {m.books_recent()}
            </h2>
            <EntryList books={ok} />
          </section>
        </div>
      )}
    </section>
  );
}
