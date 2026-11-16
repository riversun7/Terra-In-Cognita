// 사업장 장부 조각 — 기획 D-548·D-555(1513 "장부는 모두에게 공개"), 사용자 요청 2026-11-15 "모두가 볼수있는 재무제표 손익계산 등의 정보 페이지",
// docs/adr/2026-11-15-building-screen.md. 건물 판 칸(요약·물건·주인 도구)과 재무 화면(손익계산서·재무상태·현금 흐름·거래)이 같이 쓴다.
// 자료는 tRPC facilities.books(BooksOk), 바꾸는 명령은 WebSocket(businessCommands.ts). 서버가 다시 판정한다.
import type { BookColumn } from "@terra/shared/businessBooks";
import { useState } from "react";
import { formatAmount, formatRate, parseAmountInput } from "../../economy/amount.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { type BooksOk, signedAmount, timeText } from "./booksData.ts";
import { type BusinessCommand, sendBusinessCommand } from "./businessCommands.ts";
import { COLUMN_TEXT, RESULT_TEXT, fairText, moneyName } from "./businessText.ts";

/** 손익계산서 줄: 매출(수입·판매) → 비용(세금·임금·유지·숙박·재료비·그 밖) */
const REVENUE: readonly BookColumn[] = ["income", "sales"];
const COSTS: readonly BookColumn[] = ["tax", "wages", "upkeep", "lodging", "materials", "other"];
/** 현금 흐름(이익 밖 — 정산·넣기·적자) */
const FLOWS: readonly BookColumn[] = ["settlement", "invest", "debt"];

const big = (value: string | undefined): bigint => (value === undefined ? 0n : BigInt(value));

/** 명령 하나를 보내고 결과 문구를 알린 뒤 장부를 다시 읽는 도우미 */
export function useBooksCommand(reload: () => void): {
  readonly sending: boolean;
  readonly notice: string | null;
  readonly run: (command: BusinessCommand, done: string) => void;
} {
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return {
    sending,
    notice,
    run(command, done) {
      setSending(true);
      void sendBusinessCommand(command)
        .then((outcome) => {
          setNotice(outcome.ok ? done : RESULT_TEXT[outcome.code]());
          reload();
        })
        .finally(() => setSending(false));
    },
  };
}

/** 사업장 상태 줄(멈춤·마지막 적자 주기 — D-570 1789·적자) */
export function BooksAlert({ books }: { readonly books: BooksOk }) {
  // 멈춤 시각이 응답 시각보다 뒤면 마지막 주기를 돌리는 중(그 시각에 멈춤)
  if (books.suspendedAtMs !== null && books.suspendedAtMs > books.toMs)
    return (
      <p className="bp-warn" role="status" data-part="books-stop-scheduled">
        {m.books_stop_scheduled({ at: timeText(books.suspendedAtMs, getLocale()) })}
      </p>
    );
  if (books.suspendedAtMs !== null)
    return (
      <p className="bp-alert" role="alert" data-part="books-suspended">
        {m.books_suspended()}
      </p>
    );
  if (books.debt.length > 0)
    return (
      <p className="bp-warn" data-part="books-debt">
        {m.books_debt_warn()}
      </p>
    );
  return null;
}

/** 요약(건물 판 [장부] 칸): 금고·이 기간 이익·창고 값·세율 */
export function BooksSummary({ books }: { readonly books: BooksOk }) {
  const locale = getLocale();
  const vault = books.vault.map((line) => `${formatAmount(line.amount, locale)} ${moneyName(line.asset)}`);
  return (
    <div className="bp-kpis" data-part="books-summary">
      <div className="bp-kpi">
        <span className="bp-kpi-label">{m.books_vault()}</span>
        <span className="bp-kpi-value" data-part="books-vault">
          {vault.length === 0 ? "0" : vault.join(" · ")}
        </span>
      </div>
      {books.totals.map((total) => (
        <div key={total.asset} className="bp-kpi" data-sign={total.profit.startsWith("-") ? "minus" : "plus"}>
          <span className="bp-kpi-label">
            {m.books_profit_label({ days: Math.round((books.toMs - books.fromMs) / 86_400_000) || 1 })}
          </span>
          <span className="bp-kpi-value" data-part="books-profit">
            {signedAmount(total.profit, locale)} {moneyName(total.asset)}
          </span>
        </div>
      ))}
      {books.stockValue !== undefined ? (
        <div className="bp-kpi">
          <span className="bp-kpi-label">{m.books_stock_value()}</span>
          <span className="bp-kpi-value">{formatAmount(books.stockValue, locale)}</span>
        </div>
      ) : null}
      <div className="bp-kpi">
        <span className="bp-kpi-label">{m.books_tax_label()}</span>
        <span className="bp-kpi-value">{formatRate(books.taxBp)}</span>
      </div>
    </div>
  );
}

/** 손익계산서(기간 합) */
export function IncomeStatement({ books }: { readonly books: BooksOk }) {
  const locale = getLocale();
  // 기록이 없어도 0으로 채운 표를 보인다(빈 사업장도 손익 모양이 같다)
  const totals =
    books.totals.length > 0
      ? books.totals
      : [
          {
            asset: books.vault[0]?.asset ?? books.market?.asset ?? "s3_test_credit",
            columns: {},
            profit: "0",
          },
        ];
  return (
    <>
      {books.totals.length === 0 ? <p className="bp-muted">{m.books_empty()}</p> : null}
      {totals.map((total) => {
        const revenue = REVENUE.reduce((sum, column) => sum + big(total.columns[column]), 0n);
        const costs = COSTS.reduce((sum, column) => sum + big(total.columns[column]), 0n);
        const money = moneyName(total.asset);
        return (
          <table key={total.asset} className="bp-table" data-part="income-statement">
            <caption className="bp-muted">{m.books_statement_caption({ money })}</caption>
            <tbody>
              {REVENUE.map((column) => (
                <tr key={column}>
                  <th scope="row">{COLUMN_TEXT[column]()}</th>
                  <td>{signedAmount(total.columns[column] ?? "0", locale)}</td>
                </tr>
              ))}
              <tr className="bp-table-sum">
                <th scope="row">{m.books_revenue()}</th>
                <td>{signedAmount(String(revenue), locale)}</td>
              </tr>
              {COSTS.map((column) => (
                <tr key={column}>
                  <th scope="row">{COLUMN_TEXT[column]()}</th>
                  <td>{signedAmount(total.columns[column] ?? "0", locale)}</td>
                </tr>
              ))}
              <tr className="bp-table-sum">
                <th scope="row">{m.books_costs()}</th>
                <td>{signedAmount(String(costs), locale)}</td>
              </tr>
              <tr className="bp-table-total" data-sign={total.profit.startsWith("-") ? "minus" : "plus"}>
                <th scope="row">{m.books_net_profit()}</th>
                <td>{signedAmount(total.profit, locale)}</td>
              </tr>
            </tbody>
          </table>
        );
      })}
    </>
  );
}

/** 재무상태(지금): 금고·창고 값 = 자산, 갚을 돈 = 부채, 순자산(화폐마다 — 창고 값은 첫 화폐에 붙인다) */
export function BalanceSheet({ books }: { readonly books: BooksOk }) {
  const locale = getLocale();
  const assets = new Map<string, bigint>();
  for (const line of books.vault) assets.set(line.asset, BigInt(line.amount));
  const debts = new Map<string, bigint>();
  for (const line of books.debt) debts.set(line.asset, BigInt(line.amount));
  const moneys = [
    ...new Set([...assets.keys(), ...debts.keys(), books.market?.asset ?? "s3_test_credit"]),
  ].toSorted();
  const stock = books.stockValue === undefined ? 0n : BigInt(books.stockValue);
  return (
    <table className="bp-table" data-part="balance-sheet">
      {moneys.map((asset, index) => {
        const cash = assets.get(asset) ?? 0n;
        const debt = debts.get(asset) ?? 0n;
        const goods = index === 0 ? stock : 0n;
        return (
          <tbody key={asset}>
            <tr>
              <th scope="row">{m.books_bs_cash({ money: moneyName(asset) })}</th>
              <td>{formatAmount(cash, locale)}</td>
            </tr>
            {index === 0 ? (
              <tr>
                <th scope="row">{m.books_stock_value()}</th>
                <td>{formatAmount(goods, locale)}</td>
              </tr>
            ) : null}
            <tr>
              <th scope="row">{m.books_debt()}</th>
              <td>{debt > 0n ? `−${formatAmount(debt, locale)}` : "0"}</td>
            </tr>
            <tr className="bp-table-total">
              <th scope="row">{m.books_bs_equity()}</th>
              <td>{signedAmount(String(cash + goods - debt), locale)}</td>
            </tr>
          </tbody>
        );
      })}
    </table>
  );
}

/** 현금 흐름(이익 밖 칸 — 정산·넣기·적자) */
export function CashFlows({ books }: { readonly books: BooksOk }) {
  const locale = getLocale();
  const rows = books.totals.flatMap((total) =>
    FLOWS.filter((column) => total.columns[column] !== undefined).map((column) => ({
      key: `${total.asset}-${column}`,
      label: COLUMN_TEXT[column](),
      value: `${signedAmount(total.columns[column] ?? "0", locale)} ${moneyName(total.asset)}`,
    })),
  );
  if (rows.length === 0) return <p className="bp-muted">{m.books_flows_none()}</p>;
  return (
    <table className="bp-table" data-part="cash-flows">
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 날마다 막대(수입 위, 지출 아래 — 이익 칸만). 가장 큰 날 = 가득 */
export function DayBars({ days }: { readonly days: BooksOk["days"] }) {
  const locale = getLocale();
  if (days.length === 0) return null;
  let top = 1n;
  for (const day of days) {
    if (BigInt(day.income) > top) top = BigInt(day.income);
    if (BigInt(day.spend) > top) top = BigInt(day.spend);
  }
  const pct = (value: string): number => Number((BigInt(value) * 100n) / top);
  return (
    <ul className="bp-bars" aria-label={m.books_bars()} data-part="books-bars">
      {days.map((day) => (
        <li key={`${day.dayMs}-${day.asset}`} className="bp-bar">
          <span className="bp-bar-day">
            {new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(
              new Date(day.dayMs),
            )}
          </span>
          <span className="bp-bar-track">
            <span className="bp-bar-in" style={{ inlineSize: `${pct(day.income)}%` }} />
            <span className="bp-bar-out" style={{ inlineSize: `${pct(day.spend)}%` }} />
          </span>
          <span className="bp-bar-value">
            +{formatAmount(day.income, locale)} / −{formatAmount(day.spend, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 최근 거래 */
export function EntryList({ books }: { readonly books: BooksOk }) {
  const locale = getLocale();
  return (
    <>
      {books.entries.length === 0 ? (
        <p className="bp-muted">{m.books_empty()}</p>
      ) : (
        <ul className="bp-list" data-part="books-entries">
          {books.entries.map((entry) => (
            <li key={`${entry.txId}-${entry.asset}`} className="bp-entry">
              <span className="bp-muted">{timeText(entry.atMs, locale)}</span>
              <span className="bp-grow">{COLUMN_TEXT[entry.column]()}</span>
              <span className={entry.amount.startsWith("-") ? "bp-minus" : "bp-plus"}>
                {signedAmount(entry.amount, locale)}{" "}
                {entry.asset.startsWith("item:") ? entry.asset.slice(5) : moneyName(entry.asset)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="bp-muted">
        {books.firstMs === null
          ? m.books_started_none()
          : m.books_started({ at: timeText(books.firstMs, locale) })}
      </p>
    </>
  );
}

/**
 * 창고 물건 사기 — 누구나 같은 판매가·최소 묶음(주인도, 기획 D-569 1781 "주인이 꺼내는 기능은 존재하지 않는다 무조건 판매"). 값 0(안 팖)이면
 * 아무도 못 산다. 산 물건은 운반꾼이 도시 창고로 나른다(1784). 주인·대주주는 값을 정한다
 */
export function GoodsSale({
  books,
  manage,
  reload,
}: {
  readonly books: BooksOk;
  /** 값을 정할 수 있나(주인·대주주·운영자) */
  readonly manage: boolean;
  readonly reload: () => void;
}) {
  const locale = getLocale();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [price, setPrice] = useState<Record<string, string>>({});
  const { sending, notice, run } = useBooksCommand(reload);
  if (books.goods.length === 0) return <p className="bp-muted">{m.books_goods_none()}</p>;
  return (
    <section className="bp-card" aria-label={m.books_goods()} data-part="books-goods">
      <h3 className="bp-card-title">
        {m.books_goods()}
        <span className="bp-muted">
          {" "}
          · {books.retail ? m.books_lot_retail() : m.books_lot({ lot: books.minLot })}
        </span>
      </h3>
      {books.mine ? (
        <p className="bp-muted" data-part="books-sale-note">
          {m.books_sale_note()}
        </p>
      ) : null}
      {manage && books.goods.some((line) => line.fair !== undefined) ? (
        <p className="bp-muted">{m.fair_price_hint()}</p>
      ) : null}
      <ul className="bp-list">
        {books.goods.map((line) => {
          const name = line.name ? (locale === "ko" ? line.name.ko : line.name.en) : line.asset.slice(5);
          const want = parseAmountInput(qty[line.asset] ?? "");
          const priceIn = parseAmountInput(price[line.asset] ?? "");
          return (
            <li key={line.asset} className="bp-good" data-asset={line.asset}>
              <div className="bp-good-head">
                <span className="bp-grow">{name}</span>
                <span className="bp-num">× {formatAmount(line.qty, locale)}</span>
                <span className="bp-tag">
                  {line.price === null
                    ? m.books_not_for_sale()
                    : m.books_price({ price: formatAmount(line.price, locale) })}
                </span>
              </div>
              {line.price !== null ? (
                <div className="bp-form-row">
                  <input
                    className="bp-input"
                    inputMode="numeric"
                    aria-label={m.books_qty()}
                    placeholder={m.books_qty()}
                    value={qty[line.asset] ?? ""}
                    onChange={(event) => setQty({ ...qty, [line.asset]: event.target.value })}
                  />
                  <button
                    type="button"
                    className="button-small"
                    disabled={sending || want.kind !== "ok" || want.value <= 0n}
                    onClick={() => {
                      if (want.kind !== "ok") return;
                      run(
                        {
                          t: "business_buy",
                          buildingId: books.buildingId,
                          item: line.asset,
                          qty: Number(want.value),
                        },
                        m.books_bought(),
                      );
                    }}
                  >
                    {m.books_buy()}
                  </button>
                </div>
              ) : null}
              {manage && line.fair ? (
                <p className="bp-muted" data-part="books-fair">
                  {fairText(line.fair, (value) => formatAmount(value, locale))}
                </p>
              ) : null}
              {manage ? (
                <div className="bp-form-row">
                  <input
                    className="bp-input"
                    inputMode="numeric"
                    aria-label={m.books_set_price()}
                    placeholder={m.books_set_price()}
                    value={price[line.asset] ?? ""}
                    onChange={(event) => setPrice({ ...price, [line.asset]: event.target.value })}
                  />
                  <button
                    type="button"
                    className="button-small"
                    disabled={sending || priceIn.kind !== "ok"}
                    onClick={() => {
                      if (priceIn.kind !== "ok") return;
                      run(
                        {
                          t: "business_price",
                          buildingId: books.buildingId,
                          item: line.asset,
                          price: String(priceIn.value),
                        },
                        m.books_price_set(),
                      );
                    }}
                  >
                    {m.books_set_price()}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {notice ? (
        <p className="bp-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

/** 주인 도구: 정산(지분대로 주주 지갑에)·넣기(내 지갑 → 금고) */
export function OwnerMoneyTools({ books, reload }: { readonly books: BooksOk; readonly reload: () => void }) {
  const locale = getLocale();
  const [invest, setInvest] = useState("");
  const { sending, notice, run } = useBooksCommand(reload);
  const credit = books.vault[0]?.asset ?? books.market?.asset ?? "s3_test_credit";
  const parsed = parseAmountInput(invest);
  return (
    <section className="bp-card" aria-label={m.books_owner_tools()} data-part="books-owner">
      <h3 className="bp-card-title">{m.books_owner_tools()}</h3>
      <p className="bp-muted">
        {books.nextSettleMs === null
          ? m.books_auto_off()
          : m.books_next_settle({ at: timeText(books.nextSettleMs, locale) })}
      </p>
      <button
        type="button"
        className="button-small button-primary bp-wide"
        data-part="books-settle"
        disabled={sending || books.vault.length === 0}
        onClick={() => run({ t: "business_settle", buildingId: books.buildingId }, m.books_settled())}
      >
        {m.books_settle()}
      </button>
      <div className="bp-form-row">
        <input
          className="bp-input"
          inputMode="numeric"
          aria-label={m.books_invest_amount()}
          placeholder={m.books_invest_amount()}
          value={invest}
          onChange={(event) => setInvest(event.target.value)}
        />
        <button
          type="button"
          className="button-small"
          disabled={sending || parsed.kind !== "ok" || parsed.value <= 0n}
          onClick={() => {
            if (parsed.kind !== "ok" || parsed.value <= 0n) return;
            run(
              {
                t: "business_invest",
                buildingId: books.buildingId,
                asset: credit,
                amount: String(parsed.value),
              },
              m.books_invested(),
            );
          }}
        >
          {m.books_invest()}
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
