// 사업장 장부 칸(건물 판 안) — 기획 D-548(사업장 수입은 사업장에 기록되어 재무·장부를 만든다)·D-555(1501~1514), docs/adr/2026-11-15-business-ledger.md.
// - 장부는 누구나 본다(1513): 주인 종류·금고·갚을 돈(멈춤)·기간(1·7·30일) 칸별 합계와 이익·날마다 막대·최근 거래·창고 물건(값).
// - 남은 창고 물건을 산다(1507 — 최소 묶음, 저급 도시는 낱개). 주인은 값을 정하고, 정산(지분대로 내 지갑에)·넣기를 한다(1501·1502).
// - 자료는 tRPC facilities.books, 바꾸는 명령은 WebSocket(businessCommands.ts, 프로토콜 34). 서버가 다시 판정한다.
// - 접힌 채로 시작하고 펼칠 때 읽는다(건물 판을 열 때마다 원장을 읽지 않게).
import type { BookColumn, BusinessBooksResponse } from "@terra/shared/businessBooks";
import { useEffect, useState } from "react";
import { formatAmount, formatRate, parseAmountInput } from "../../economy/amount.ts";
import { api } from "../../net/api.ts";
import { serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { type BusinessCommand, sendBusinessCommand } from "./businessCommands.ts";
import { COLUMN_TEXT, OWNER_TEXT, RESULT_TEXT, moneyName } from "./businessText.ts";
import "./business.css";

const REQUEST_TIMEOUT_MS = 10_000;
const PERIODS = [1, 7, 30] as const;
/** 합계 카드로 보이는 칸(차례) */
const CARD_COLUMNS: readonly BookColumn[] = [
  "income",
  "sales",
  "tax",
  "wages",
  "upkeep",
  "settlement",
  "invest",
  "debt",
];

const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/** 부호 있는 최소 단위 글 → 자리 나눔 글(음수는 −) */
function signed(value: string, locale: string): string {
  const negative = value.startsWith("-");
  const body = formatAmount(negative ? value.slice(1) : value, locale);
  return negative ? `−${body}` : value === "0" ? body : `+${body}`;
}

function timeText(atMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(atMs));
}

/** 장부 읽기(시간 제한 REQUEST_TIMEOUT_MS) */
function loadBooks(buildingId: number, days: number, signal?: AbortSignal): Promise<BusinessBooksResponse> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return api.facilities.books.query(
    { buildingId, days },
    { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
  );
}

export function BusinessBooks({ buildingId }: { readonly buildingId: number }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const [books, setBooks] = useState<BusinessBooksResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [invest, setInvest] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [price, setPrice] = useState<Record<string, string>>({});
  const locale = getLocale();

  useEffect(() => {
    if (!open) return () => undefined;
    const controller = new AbortController();
    void loadBooks(buildingId, days, controller.signal)
      .then((response) => {
        setBooks(response);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, days, buildingId]);

  const run = (command: BusinessCommand, done: string) => {
    setSending(true);
    void sendBusinessCommand(command)
      .then(async (outcome) => {
        setNotice(outcome.ok ? done : RESULT_TEXT[outcome.code]());
        // 결과 뒤 장부를 다시 읽는다
        setBooks(await loadBooks(buildingId, days));
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false));
  };

  if (books?.status === "not_business") return null;
  const ok = books?.status === "ok" ? books : null;
  const credit = ok?.vault.find((line) => line.asset === "s3_test_credit")?.asset ?? "s3_test_credit";

  return (
    <details
      className="books"
      data-part="business-books"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="books-summary">{m.books_title()}</summary>
      {!ok ? (
        <p className="books-muted">{failed ? m.books_load_failed() : m.books_loading()}</p>
      ) : (
        <div className="books-body">
          <p className="books-line">
            {m.books_owner({ owner: OWNER_TEXT[ok.ownerKind]() })}
            {" · "}
            {m.books_tax({ rate: formatRate(ok.taxBp) })}
          </p>
          {ok.suspendedAtMs !== null ? (
            <p className="books-alert" role="alert" data-part="books-suspended">
              {m.books_suspended()}
            </p>
          ) : ok.debt.length > 0 ? (
            <p className="books-warn" data-part="books-debt">
              {m.books_debt_warn()}
            </p>
          ) : null}
          <dl className="books-vault">
            <dt>{m.books_vault()}</dt>
            <dd data-part="books-vault">
              {ok.vault.length === 0
                ? "0"
                : ok.vault
                    .map((line) => `${formatAmount(line.amount, locale)} ${moneyName(line.asset)}`)
                    .join(" · ")}
            </dd>
            {ok.debt.length > 0 ? (
              <>
                <dt>{m.books_debt()}</dt>
                <dd>
                  {ok.debt
                    .map((line) => `${formatAmount(line.amount, locale)} ${moneyName(line.asset)}`)
                    .join(" · ")}
                </dd>
              </>
            ) : null}
          </dl>
          <fieldset className="books-periods">
            <legend className="books-muted">{m.books_period()}</legend>
            {PERIODS.map((value) => (
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
          {ok.totals.length === 0 ? (
            <p className="books-muted">{m.books_empty()}</p>
          ) : (
            ok.totals.map((total) => (
              <div key={total.asset} className="books-totals" data-part="books-totals">
                <ul className="books-cards">
                  {CARD_COLUMNS.filter((column) => total.columns[column] !== undefined).map((column) => (
                    <li key={column} className="books-card" data-column={column}>
                      <span className="books-card-label">{COLUMN_TEXT[column]()}</span>
                      <span className="books-card-value">{signed(total.columns[column] ?? "0", locale)}</span>
                    </li>
                  ))}
                </ul>
                <p className="books-profit" data-part="books-profit">
                  {m.books_profit({ amount: signed(total.profit, locale), money: moneyName(total.asset) })}
                </p>
              </div>
            ))
          )}
          {ok.days.length > 0 ? <Bars days={ok.days} /> : null}
          {ok.goods.length > 0 ? (
            <section className="books-goods" aria-label={m.books_goods()}>
              <p className="books-heading">
                {m.books_goods()}
                <span className="books-muted">
                  {" · "}
                  {ok.retail ? m.books_lot_retail() : m.books_lot({ lot: ok.minLot })}
                </span>
              </p>
              <ul className="books-list">
                {ok.goods.map((line) => {
                  const name = line.name
                    ? locale === "ko"
                      ? line.name.ko
                      : line.name.en
                    : line.asset.slice(5);
                  const want = parseAmountInput(qty[line.asset] ?? "");
                  const priceIn = parseAmountInput(price[line.asset] ?? "");
                  return (
                    <li key={line.asset} className="books-good" data-asset={line.asset}>
                      <span>
                        {name} × {formatAmount(line.qty, locale)} ·{" "}
                        {line.price === null
                          ? m.books_not_for_sale()
                          : m.books_price({ price: formatAmount(line.price, locale) })}
                      </span>
                      <span className="books-row">
                        <input
                          className="books-input"
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
                              { t: "business_buy", buildingId, item: line.asset, qty: Number(want.value) },
                              m.books_bought(),
                            );
                          }}
                        >
                          {ok.mine ? m.books_take() : m.books_buy()}
                        </button>
                        {ok.mine ? (
                          <>
                            <input
                              className="books-input"
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
                                    buildingId,
                                    item: line.asset,
                                    price: String(priceIn.value),
                                  },
                                  m.books_price_set(),
                                );
                              }}
                            >
                              {m.books_set_price()}
                            </button>
                          </>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {ok.mine ? (
            <section className="books-owner" aria-label={m.books_owner_tools()}>
              <p className="books-muted">
                {ok.nextSettleMs === null
                  ? m.books_auto_off()
                  : m.books_next_settle({ at: timeText(ok.nextSettleMs, locale) })}
              </p>
              <div className="books-row">
                <button
                  type="button"
                  className="button-small button-primary"
                  data-part="books-settle"
                  disabled={sending || ok.vault.length === 0}
                  onClick={() => run({ t: "business_settle", buildingId }, m.books_settled())}
                >
                  {m.books_settle()}
                </button>
                <input
                  className="books-input"
                  inputMode="numeric"
                  aria-label={m.books_invest_amount()}
                  placeholder={m.books_invest_amount()}
                  value={invest}
                  onChange={(event) => setInvest(event.target.value)}
                />
                <button
                  type="button"
                  className="button-small"
                  disabled={sending || parseAmountInput(invest).kind !== "ok"}
                  onClick={() => {
                    const parsed = parseAmountInput(invest);
                    if (parsed.kind !== "ok" || parsed.value <= 0n) return;
                    run(
                      { t: "business_invest", buildingId, asset: credit, amount: String(parsed.value) },
                      m.books_invested(),
                    );
                  }}
                >
                  {m.books_invest()}
                </button>
              </div>
            </section>
          ) : null}
          <section aria-label={m.books_recent()}>
            <p className="books-heading">{m.books_recent()}</p>
            {ok.entries.length === 0 ? (
              <p className="books-muted">{m.books_empty()}</p>
            ) : (
              <ul className="books-list" data-part="books-entries">
                {ok.entries.map((entry) => (
                  <li key={`${entry.txId}-${entry.asset}`} className="books-entry">
                    <span className="books-muted">{timeText(entry.atMs, locale)}</span>
                    <span>{COLUMN_TEXT[entry.column]()}</span>
                    <span className="books-entry-kind">{entry.kind}</span>
                    <span className={entry.amount.startsWith("-") ? "books-minus" : "books-plus"}>
                      {signed(entry.amount, locale)}{" "}
                      {entry.asset.startsWith("item:") ? entry.asset.slice(5) : moneyName(entry.asset)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="books-muted">
              {ok.firstMs === null
                ? m.books_started_none()
                : m.books_started({ at: timeText(ok.firstMs, locale) })}
            </p>
          </section>
          {notice ? (
            <p className="books-notice" role="status">
              {notice}
            </p>
          ) : null}
          <p className="books-muted">{m.books_updated({ at: timeText(serverNow(), locale) })}</p>
        </div>
      )}
    </details>
  );
}

/** 날마다 막대(수입 위, 지출 아래 — 이익 칸만). 가장 큰 날 = 가득 */
function Bars({
  days,
}: {
  readonly days: NonNullable<Extract<BusinessBooksResponse, { status: "ok" }>["days"]>;
}) {
  const locale = getLocale();
  let top = 1n;
  for (const day of days) {
    const income = BigInt(day.income);
    const spend = BigInt(day.spend);
    if (income > top) top = income;
    if (spend > top) top = spend;
  }
  const pct = (value: string): number => Number((BigInt(value) * 100n) / top);
  return (
    <ul className="books-bars" aria-label={m.books_bars()} data-part="books-bars">
      {days.map((day) => (
        <li key={`${day.dayMs}-${day.asset}`} className="books-bar">
          <span className="books-bar-day">
            {new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(
              new Date(day.dayMs),
            )}
          </span>
          <span className="books-bar-track">
            <span className="books-bar-in" style={{ inlineSize: `${pct(day.income)}%` }} />
            <span className="books-bar-out" style={{ inlineSize: `${pct(day.spend)}%` }} />
          </span>
          <span className="books-bar-value">
            +{formatAmount(day.income, locale)} / −{formatAmount(day.spend, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
