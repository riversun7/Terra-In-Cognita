// 환전(/economy/exchange) — 화폐 X ↔ 기준 통화 짝의 동시호가(D-125, R2 ADR 6절): 회차(1시간)마다 모은 주문을 체결량이 가장 큰 값
// 하나로 한꺼번에 체결한다. 짝마다 지난 체결가·예상 체결가(지금 모인 주문)·살 쪽/팔 쪽 호가·지난 24회차를 보인다.
// 주문 칸은 미리 보기만 한다(곧 열림). 값 = 로트(X 최소 단위 lotSize개)당 기준 통화 최소 단위.
import type { EconomyExchangeResponse, FxLevel, FxPairView } from "@terra/shared/economy";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { parseAmountInput, toBig, trendOf } from "./amount.ts";
import { type CatalogIndex, currencyName, fmt, indexCatalog } from "./economyText.ts";
import { Change, Loaded, NotReady, PreviewTag, Spark } from "./parts.tsx";
import { NO_ARGS, useCatalog, useExchange, useNowTick } from "./queries.ts";
import { formatCountdown } from "./shape.ts";

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
        <h3 id={titleId} className="eco-place-title">
          {currencyName(index, pair.currency)}
        </h3>
        {preview ? <PreviewTag /> : null}
      </div>
      <p className="eco-row-meta">{m.economy_exchange_lot({ lot: fmt(pair.lotSize) })}</p>
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

function FxOrderForm({ data, index }: { data: EconomyExchangeResponse; index: CatalogIndex }) {
  const id = useId();
  const [currency, setCurrency] = useState(data.pairs[0]?.currency ?? "");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [lots, setLots] = useState("");
  const [price, setPrice] = useState(data.pairs[0]?.indicative ?? "");
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
              setCurrency(next);
              setPrice(data.pairs.find((entry) => entry.currency === next)?.indicative ?? "");
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
            {m.economy_price()}
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
    </section>
  );
}

export default function ExchangeView() {
  const catalog = useCatalog(NO_ARGS);
  const exchange = useExchange(NO_ARGS);
  const tick = useNowTick();
  const index = indexCatalog(catalog.data);
  return (
    <Loaded view={exchange}>
      {(data) => {
        const base = data.base === null ? "" : currencyName(index, data.base);
        if (data.status === "not_ready") return <NotReady body={m.economy_not_ready_exchange()} />;
        const left = data.nextAuctionAt - data.generatedAt - Math.max(0, tick - exchange.receivedAt);
        return (
          <div className="eco-stack">
            <p className="eco-hint">{m.economy_exchange_intro({ base })}</p>
            <div className="eco-fx-head">
              <p className="eco-fx-countdown eco-num" role="timer" aria-live="off">
                {m.economy_exchange_next({ time: formatCountdown(left) })}
              </p>
              <p className="eco-row-meta">
                {m.economy_exchange_base_balance({ amount: fmt(data.baseBalance) })}
              </p>
            </div>
            <div className="eco-places">
              {data.pairs.map((pair) => (
                <PairCard key={pair.currency} pair={pair} index={index} preview={data.preview} />
              ))}
            </div>
            <FxOrderForm data={data} index={index} />
          </div>
        );
      }}
    </Loaded>
  );
}
