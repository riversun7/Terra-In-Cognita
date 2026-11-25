// 환전(/economy/exchange) — 나라 화폐 ↔ 기준 통화 짝의 동시호가(D-125, R2 ADR 6절): 회차(1시간)마다 모은 주문을 체결량이 가장 큰 값
// 하나로 한꺼번에 체결한다. 짝마다 지난 체결가·예상 체결가(지금 모인 주문 + 그 나라의 양쪽 값)·살 쪽/팔 쪽 호가·지난 24회차를 보인다.
// 값 = 로트(X 최소 단위 lotSize개)당 기준 통화 최소 단위.
// 실제 환전(docs/adr/2026-11-07-play-flow.md "WP6 나라 화폐·체결 알림")이면 주문 칸이 WebSocket fx_place를 보내고, 내 이번 회차 주문([거두기] =
// fx_cancel)과 지난 결과를 보인다. 회차 시각이 지나면 자료를 다시 받는다. 시안 자료에서는 명령을 보내지 않는다(곧 열림).
import type {
  EconomyExchangeResponse,
  FxLevel,
  FxMyDone,
  FxMyOrder,
  FxPairView,
} from "@terra/shared/economy";
import { useEffect, useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { parseAmountInput, toBig, trendOf } from "./amount.ts";
import { type CatalogIndex, bpPercent, currencyName, fmt, formatAgo, indexCatalog } from "./economyText.ts";
import { type FxOutcome, sendFxCommand } from "./market/marketCommands.ts";
import { MARKET_ERROR_TEXT, wireAmount } from "./market/marketText.ts";
import "./market/market.css";
import { Change, Loaded, NotReady, PreviewTag, Spark } from "./parts.tsx";
import { NO_ARGS, useCatalog, useExchange, useHoldings, useNowTick } from "./queries.ts";
import { formatCountdown } from "./shape.ts";

type FxCode = Extract<FxOutcome, { ok: false }>["code"];

/** 환전 결과 코드 → 문구(공통 코드는 거래소 문구를 쓴다) */
const FX_ERROR_TEXT: Readonly<Record<FxCode, () => string>> = {
  sign_in_required: MARKET_ERROR_TEXT.sign_in_required,
  busy: MARKET_ERROR_TEXT.busy,
  rate_limited: MARKET_ERROR_TEXT.rate_limited,
  internal_error: MARKET_ERROR_TEXT.internal_error,
  market_paused: MARKET_ERROR_TEXT.market_paused,
  unknown_currency: m.fx_err_unknown_currency,
  unknown_order: MARKET_ERROR_TEXT.unknown_order,
  not_owner: MARKET_ERROR_TEXT.not_owner,
  insufficient_funds: m.fx_err_funds,
  invalid_amount: MARKET_ERROR_TEXT.invalid_amount,
  order_limit: m.fx_err_order_limit,
  no_exchange: m.fx_err_no_exchange,
  offline: MARKET_ERROR_TEXT.offline,
  timeout: MARKET_ERROR_TEXT.timeout,
};

/** 환전 명령 뒤: 환전 자료·창고(지갑)를 다시 받는다 */
function refreshFx(): void {
  useExchange.refreshAll();
  useHoldings.refreshAll();
}

function FxLevels({
  title,
  levels,
  side,
}: {
  title: string;
  levels: readonly FxLevel[];
  side: "buy" | "sell";
}) {
  return (
    <div className="eco-fx-side" data-side={side}>
      <h4 className="eco-subtitle">{title}</h4>
      <ul className="eco-fx-levels">
        {levels.map((level) => (
          <li key={level.price}>
            <span className="eco-num eco-fx-price">{fmt(level.price)}</span>
            <span className="eco-num">{fmt(level.lots)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PairCard({ pair, index, preview }: { pair: FxPairView; index: CatalogIndex; preview: boolean }) {
  const titleId = `eco-fx-${pair.currency}`;
  return (
    <section className="panel eco-fx" aria-labelledby={titleId}>
      <div className="eco-place-head">
        <h3 id={titleId} className="eco-place-title eco-currency-unit">
          {currencyName(index, pair.currency)}
        </h3>
        {preview ? <PreviewTag /> : null}
      </div>
      <p className="eco-row-meta">{m.economy_exchange_lot({ lot: fmt(pair.lotSize) })}</p>
      {pair.exchange === false ? (
        <p className="eco-notice" data-tone="warning" data-part="fx-no-exchange">
          {m.fx_exchange_none()}
        </p>
      ) : null}
      {pair.feeBp === undefined ? null : (
        <p className="eco-row-meta" data-part="fx-fee">
          {pair.feeBp > 0 ? m.fx_fee_line({ pct: bpPercent(pair.feeBp) }) : m.fx_fee_free()}
        </p>
      )}
      <div className="eco-fx-prices">
        <div>
          <span className="eco-quote-label">{m.economy_exchange_indicative()}</span>
          <span className="eco-fx-indicative eco-num">
            {pair.indicative === null ? "—" : fmt(pair.indicative)}
          </span>
          <span className="eco-row-meta">
            {m.economy_exchange_indicative_lots({ lots: fmt(pair.indicativeLots) })}
          </span>
        </div>
        <div>
          <span className="eco-quote-label">{m.economy_exchange_last()}</span>
          <span className="eco-num">{pair.last === null ? "—" : fmt(pair.last)}</span>
          <Change bp={pair.changeBp} />
        </div>
        <div className="eco-fx-spark" role="img" aria-label={m.economy_exchange_history()}>
          <Spark values={pair.history.map((entry) => entry.price)} trend={trendOf(pair.changeBp)} />
        </div>
      </div>
      <div className="eco-fx-book">
        <FxLevels title={m.economy_exchange_buys()} levels={pair.buys} side="buy" />
        <FxLevels title={m.economy_exchange_sells()} levels={pair.sells} side="sell" />
      </div>
      <p className="eco-row-meta">{m.economy_exchange_balance({ amount: fmt(pair.balance) })}</p>
    </section>
  );
}

type Sent = { readonly ok: boolean; readonly text: string };

function FxOrderForm({
  data,
  index,
  left,
}: {
  data: EconomyExchangeResponse;
  index: CatalogIndex;
  /** 다음 회차까지 남은 ms */
  left: number;
}) {
  const id = useId();
  const [currency, setCurrency] = useState(data.pairs[0]?.currency ?? "");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [lots, setLots] = useState("");
  const [price, setPrice] = useState(data.pairs[0]?.indicative ?? data.pairs[0]?.last ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const live = !data.preview && data.open !== undefined;
  const pair = data.pairs.find((entry) => entry.currency === currency);
  const lotsRead = parseAmountInput(lots);
  const priceRead = parseAmountInput(price);
  const ready =
    lotsRead.kind === "ok" && lotsRead.value > 0n && priceRead.kind === "ok" && priceRead.value > 0n;
  const held =
    ready && pair
      ? side === "buy"
        ? m.economy_exchange_order_total({
            amount: fmt(lotsRead.value * priceRead.value),
            base: data.base === null ? "" : currencyName(index, data.base),
          })
        : m.economy_exchange_order_goods({ amount: fmt(lotsRead.value * toBig(pair.lotSize)) })
      : null;
  const used = data.open?.length ?? 0;
  const max = data.maxOrders ?? 0;
  const submit = (): void => {
    const wirePrice = wireAmount(price);
    const wireLots = wireAmount(lots);
    if (sending || !pair || wirePrice === null || wireLots === null) return;
    setSending(true);
    setSent(null);
    void sendFxCommand({
      t: "fx_place",
      currency: pair.currency,
      side,
      price: wirePrice,
      lots: wireLots,
    }).then((outcome) => {
      setSending(false);
      if (!outcome.ok) {
        setSent({ ok: false, text: FX_ERROR_TEXT[outcome.code]() });
        return;
      }
      setSent({ ok: true, text: m.fx_placed({ time: formatCountdown(left) }) });
      setLots("");
      refreshFx();
    });
  };
  return (
    <section className="panel eco-fx-form" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="eco-section-title">
        {m.economy_exchange_order_title()}
      </h2>
      <div className="eco-fx-form-grid">
        <div className="eco-field">
          <label className="field-label" htmlFor={`${id}-pair`}>
            {m.economy_exchange_currency()}
          </label>
          <select
            id={`${id}-pair`}
            className="eco-select"
            value={currency}
            onChange={(event) => {
              const next = event.currentTarget.value;
              const nextPair = data.pairs.find((entry) => entry.currency === next);
              setCurrency(next);
              setPrice(nextPair?.indicative ?? nextPair?.last ?? "");
            }}
          >
            {data.pairs.map((entry) => (
              <option key={entry.currency} value={entry.currency}>
                {currencyName(index, entry.currency)}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="eco-sides">
          <legend className="visually-hidden">{m.economy_side_label()}</legend>
          {(["buy", "sell"] as const).map((value) => (
            <label key={value} className="eco-side" data-side={value}>
              <input
                type="radio"
                name={`${id}-side`}
                value={value}
                checked={side === value}
                onChange={() => setSide(value)}
              />
              <span>{value === "buy" ? m.economy_exchange_buy() : m.economy_exchange_sell()}</span>
            </label>
          ))}
        </fieldset>
        <div className="eco-field">
          <label className="field-label" htmlFor={`${id}-lots`}>
            {m.economy_exchange_lots()}
          </label>
          <input
            id={`${id}-lots`}
            className="input eco-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={lots}
            onChange={(event) => setLots(event.currentTarget.value)}
          />
        </div>
        <div className="eco-field">
          <label className="field-label" htmlFor={`${id}-price`}>
            {side === "buy" ? m.fx_price_buy() : m.fx_price_sell()}
          </label>
          <input
            id={`${id}-price`}
            className="input eco-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={price}
            onChange={(event) => setPrice(event.currentTarget.value)}
          />
        </div>
      </div>
      <p className="eco-footnote">
        {m.economy_exchange_unit({ base: data.base === null ? "" : currencyName(index, data.base) })}
      </p>
      {held ? <p className="eco-have">{held}</p> : null}
      {live ? (
        <>
          <p className="eco-row-meta">{m.fx_limit({ used, max })}</p>
          <button
            type="button"
            className="button-primary eco-submit"
            data-side={side}
            aria-disabled={sending || !ready || used >= max ? "true" : undefined}
            aria-describedby={`${id}-sent`}
            onClick={submit}
          >
            {sending ? m.market_sending() : m.fx_submit()}
          </button>
          <p
            id={`${id}-sent`}
            className="eco-sent"
            role="status"
            data-tone={sent ? (sent.ok ? "ok" : "error") : undefined}
          >
            {sent?.text ?? ""}
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            className="button-primary eco-submit"
            aria-disabled="true"
            aria-describedby={`${id}-soon`}
          >
            {m.economy_submit_soon()}
          </button>
          <p id={`${id}-soon`} className="eco-footnote">
            {m.economy_submit_hint()}
          </p>
        </>
      )}
    </section>
  );
}

function CancelFxButton({ order, label }: { order: FxMyOrder; label: string }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderId = Number(order.id);
  return (
    <>
      <button
        type="button"
        className="button-small"
        aria-label={label}
        aria-disabled={sending ? "true" : undefined}
        onClick={() => {
          if (sending || !Number.isSafeInteger(orderId) || orderId <= 0) return;
          setSending(true);
          setError(null);
          void sendFxCommand({ t: "fx_cancel", order: orderId }).then((outcome) => {
            setSending(false);
            if (!outcome.ok) {
              setError(FX_ERROR_TEXT[outcome.code]());
              return;
            }
            refreshFx();
          });
        }}
      >
        {sending ? m.market_sending() : m.fx_cancel()}
      </button>
      {error === null ? null : (
        <span className="eco-sent" role="status" data-tone="error">
          {error}
        </span>
      )}
    </>
  );
}

const sideText = (side: "buy" | "sell"): string =>
  side === "buy" ? m.economy_exchange_buy() : m.economy_exchange_sell();

function doneText(order: FxMyDone): string {
  if (order.status === "cancelled") return m.fx_done_cancelled({ lots: fmt(order.lots) });
  if (order.clearPrice === null || order.filled === "0") return m.fx_done_none({ lots: fmt(order.lots) });
  return m.fx_done_filled({ filled: fmt(order.filled), lots: fmt(order.lots), price: fmt(order.clearPrice) });
}

/** 내 이번 회차 주문·지난 결과(실제 환전만) */
function MyFxOrders({ data, index }: { data: EconomyExchangeResponse; index: CatalogIndex }) {
  const open = data.open ?? [];
  const done = data.done ?? [];
  return (
    <section className="panel" aria-labelledby="eco-fx-mine">
      <h2 id="eco-fx-mine" className="eco-section-title">
        {m.fx_mine_title()}
      </h2>
      {open.length === 0 ? (
        <p className="eco-empty">{m.fx_open_empty()}</p>
      ) : (
        <ul className="eco-rows">
          {open.map((order) => {
            const name = currencyName(index, order.currency);
            return (
              <li key={order.id} className="eco-row eco-order">
                <span className="eco-row-main">
                  <span className="eco-row-title">
                    {sideText(order.side)} · {name}
                  </span>
                  <span className="eco-row-meta">
                    {m.fx_open_row({ lots: fmt(order.lots), price: fmt(order.price) })}
                  </span>
                </span>
                <span className="eco-row-end">
                  <CancelFxButton order={order} label={m.fx_cancel_label({ currency: name })} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {done.length === 0 ? null : (
        <>
          <h3 className="eco-subtitle">{m.fx_done_title()}</h3>
          <ul className="eco-rows">
            {done.slice(0, 10).map((order) => (
              <li key={order.id} className="eco-row eco-order">
                <span className="eco-row-main">
                  <span className="eco-row-title">
                    {sideText(order.side)} · {currencyName(index, order.currency)}
                  </span>
                  <span className="eco-row-meta">{doneText(order)}</span>
                </span>
                <span className="eco-row-end">
                  <span className="eco-row-meta">{formatAgo(order.at, data.generatedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** 회차 시각이 지나면 한 번 다시 받는다(회차 결과·새 예상 체결가) */
function useRoundRefresh(due: boolean): void {
  useEffect(() => {
    if (due) refreshFx();
  }, [due]);
}

export default function ExchangeView() {
  const catalog = useCatalog(NO_ARGS);
  const exchange = useExchange(NO_ARGS);
  const tick = useNowTick();
  const index = indexCatalog(catalog.data);
  const loaded = exchange.data;
  const left =
    loaded === null ? 1 : loaded.nextAuctionAt - loaded.generatedAt - Math.max(0, tick - exchange.receivedAt);
  useRoundRefresh(loaded !== null && !loaded.preview && loaded.status === "ready" && left <= 0);
  return (
    <Loaded view={exchange}>
      {(data) => {
        const base = data.base === null ? "" : currencyName(index, data.base);
        if (data.status === "not_ready") return <NotReady body={m.economy_not_ready_exchange()} />;
        const live = !data.preview && data.open !== undefined;
        return (
          <div className="eco-stack">
            <p className="eco-hint">{m.economy_exchange_intro({ base })}</p>
            {live ? <p className="eco-footnote">{m.fx_intro_live()}</p> : null}
            <div className="eco-fx-head">
              <p className="eco-fx-countdown eco-num" role="timer" aria-live="off">
                {left <= 0 ? m.fx_round_running() : m.economy_exchange_next({ time: formatCountdown(left) })}
              </p>
              <p className="eco-row-meta">
                {m.economy_exchange_base_balance({ amount: fmt(data.baseBalance) })}
              </p>
            </div>
            {data.pairs.length === 0 ? <p className="eco-empty">{m.fx_no_pairs()}</p> : null}
            <div className="eco-places">
              {data.pairs.map((pair) => (
                <PairCard key={pair.currency} pair={pair} index={index} preview={data.preview} />
              ))}
            </div>
            {data.pairs.length === 0 ? null : <FxOrderForm data={data} index={index} left={left} />}
            {live ? <MyFxOrders data={data} index={index} /> : null}
          </div>
        );
      }}
    </Loaded>
  );
}
