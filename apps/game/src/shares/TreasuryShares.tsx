// 정부 지분 시장의 국고 칸 — 국고 지분 팔기(기획 D-583 질문 2438 답)·국고 주문과 지도자 거두기(D-587 질문 2473 다)·국고 지분 사기(D-587 질문 2479 나),
// docs/adr/2026-11-21-share-market.md·2026-11-21-share-market-2.md. CityShareMarket.tsx가 띄운다.
// - 팔기: 그 나라 사람에게 국고가 가진 주. 자격이 있으면 주 수·1주 가장 낮은 값으로 안건(독재 = 지배 가문장 직권 — WebSocket gov_propose treasury_share_sale).
// - 걸린 국고 주문: 그 값에 다 체결될 때까지 남는다(저절로 거두지 않는다). 지도자만 거둔다(city_share_cancel).
// - 사기: 보는 사람 나라 국고가 이 도시(제 나라 = 되사기, 남의 나라) 지분을 주 수·1주 가장 높은 값으로 산다(gov_propose treasury_share_buy). 묶을 돈 미리 보기.
// 판정은 서버(의결 칸 검사·시장).
import type { CityShareMarketView } from "@terra/shared/cityShares";
import { useState } from "react";
import { formatAmount, parseAmountInput } from "../economy/amount.ts";
import { sendGovernance } from "../faction/governance/governanceCommands.ts";
import { GOVERNANCE_ERROR_TEXT } from "../faction/governance/governanceText.ts";
import { moneyName } from "../map/business/businessText.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { sendCityShare } from "./shareCommands.ts";
import { CITY_SHARE_RESULT_TEXT } from "./shareText.ts";

type Reload = () => void;

/** 국고 주문 목록(지도자면 거두기) */
function TreasuryOrders({ view, reload }: { readonly view: CityShareMarketView; readonly reload: Reload }) {
  const locale = getLocale();
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const orders = view.treasury?.orders ?? [];
  if (orders.length === 0) return null;
  const money = moneyName(view.asset);
  return (
    <>
      <h4 className="bp-card-title">{m.city_shares_treasury_orders()}</h4>
      <ul
        className="bp-list"
        aria-label={m.city_shares_treasury_orders()}
        data-part="city-share-treasury-orders"
      >
        {orders.map((order) => (
          <li key={order.id} className="bp-row" data-side={order.side}>
            <span className="bp-tag" data-side={order.side}>
              {order.side === "buy" ? m.shares_buy() : m.shares_sell()}
            </span>
            <span className="bp-grow">
              {m.shares_order_line({
                price: formatAmount(order.price, locale),
                money,
                count: formatAmount(order.shares, locale),
              })}
            </span>
            {view.treasury?.canWithdraw ? (
              <button
                type="button"
                className="button-small"
                disabled={sending}
                data-part="city-share-treasury-withdraw"
                onClick={() => {
                  setSending(true);
                  void sendCityShare({ t: "city_share_cancel", orderId: order.id })
                    .then((outcome) => {
                      setNotice(
                        outcome.ok
                          ? m.city_shares_treasury_withdrawn()
                          : CITY_SHARE_RESULT_TEXT[outcome.code](),
                      );
                      reload();
                    })
                    .finally(() => setSending(false));
                }}
              >
                {m.city_shares_treasury_withdraw()}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="bp-muted">{m.city_shares_treasury_rest_note()}</p>
      {notice ? (
        <p className="bp-notice" role="status">
          {notice}
        </p>
      ) : null}
    </>
  );
}

/** 국고 지분과 국고 지분 팔기(그 나라 사람만 — 자격이 있으면 직권·안건), 걸린 국고 주문 */
export function TreasurySale({
  view,
  reload,
}: {
  readonly view: CityShareMarketView;
  readonly reload: Reload;
}) {
  const locale = getLocale();
  const [count, setCount] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const treasury = view.treasury;
  if (!treasury) return null;
  const countIn = parseAmountInput(count);
  const priceIn = parseAmountInput(minPrice);
  const valid =
    countIn.kind === "ok" &&
    priceIn.kind === "ok" &&
    countIn.value > 0n &&
    priceIn.value > 0n &&
    countIn.value <= BigInt(treasury.shares);
  return (
    <section className="bp-card" aria-label={m.city_shares_treasury_sale()} data-part="city-share-treasury">
      <h3 className="bp-card-title">{m.city_shares_treasury_sale()}</h3>
      <p className="sm-wallet">{m.city_shares_treasury({ count: formatAmount(treasury.shares, locale) })}</p>
      <p className="bp-muted">{m.city_shares_treasury_note()}</p>
      {treasury.canPropose ? (
        <>
          <div className="bp-form-row">
            <label className="bp-field">
              <span>{m.shares_qty()}</span>
              <input
                className="bp-input"
                inputMode="numeric"
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            </label>
            <label className="bp-field">
              <span>{m.city_shares_treasury_min({ money: moneyName(view.asset) })}</span>
              <input
                className="bp-input"
                inputMode="numeric"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="button-small bp-wide"
            data-part="city-share-treasury-submit"
            disabled={sending || !valid}
            onClick={() => {
              if (countIn.kind !== "ok" || priceIn.kind !== "ok") return;
              setSending(true);
              void sendGovernance({
                t: "gov_propose",
                kind: "treasury_share_sale",
                cityId: view.cityId,
                shares: String(countIn.value),
                minPrice: String(priceIn.value),
              })
                .then((outcome) => {
                  setNotice(
                    outcome.ok
                      ? outcome.action === "decided"
                        ? m.city_shares_treasury_decided()
                        : m.city_shares_treasury_opened()
                      : GOVERNANCE_ERROR_TEXT[outcome.code](),
                  );
                  if (outcome.ok) setCount("");
                  reload();
                })
                .finally(() => setSending(false));
            }}
          >
            {treasury.dictatorship ? m.city_shares_treasury_decree() : m.city_shares_treasury_vote()}
          </button>
        </>
      ) : null}
      {notice ? (
        <p className="bp-notice" role="status">
          {notice}
        </p>
      ) : null}
      <TreasuryOrders view={view} reload={reload} />
    </section>
  );
}

/** 국고 지분 사기(보는 사람 나라 국고 — 자격이 있으면 직권·안건, D-587 질문 2479 나) */
export function TreasuryBuy({
  view,
  reload,
}: {
  readonly view: CityShareMarketView;
  readonly reload: Reload;
}) {
  const locale = getLocale();
  const [count, setCount] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const buy = view.treasuryBuy;
  if (!buy?.canPropose) return null;
  const money = moneyName(view.asset);
  const countIn = parseAmountInput(count);
  const priceIn = parseAmountInput(maxPrice);
  const lock = countIn.kind === "ok" && priceIn.kind === "ok" ? countIn.value * priceIn.value : 0n;
  const valid =
    countIn.kind === "ok" &&
    priceIn.kind === "ok" &&
    countIn.value > 0n &&
    priceIn.value > 0n &&
    lock <= BigInt(buy.cash);
  return (
    <section
      className="bp-card"
      aria-label={m.city_shares_treasury_buy()}
      data-part="city-share-treasury-buy"
    >
      <h3 className="bp-card-title">{m.city_shares_treasury_buy()}</h3>
      <p className="bp-muted">
        {m.city_shares_treasury_buy_note({ money, cash: formatAmount(buy.cash, locale) })}
      </p>
      {buy.own ? <p className="bp-muted">{m.city_shares_treasury_buy_own()}</p> : null}
      <div className="bp-form-row">
        <label className="bp-field">
          <span>{m.shares_qty()}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            data-part="city-share-treasury-buy-qty"
          />
        </label>
        <label className="bp-field">
          <span>{m.city_shares_treasury_max({ money })}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            data-part="city-share-treasury-buy-price"
          />
        </label>
      </div>
      <p className="bp-muted">
        {m.shares_lock_buy({
          amount: formatAmount(lock, locale),
          money,
          cash: formatAmount(buy.cash, locale),
        })}
      </p>
      <button
        type="button"
        className="button-small bp-wide"
        data-part="city-share-treasury-buy-submit"
        disabled={sending || !valid}
        onClick={() => {
          if (countIn.kind !== "ok" || priceIn.kind !== "ok") return;
          setSending(true);
          void sendGovernance({
            t: "gov_propose",
            kind: "treasury_share_buy",
            cityId: view.cityId,
            shares: String(countIn.value),
            maxPrice: String(priceIn.value),
          })
            .then((outcome) => {
              setNotice(
                outcome.ok
                  ? outcome.action === "decided"
                    ? m.city_shares_treasury_buy_decided()
                    : m.city_shares_treasury_opened()
                  : GOVERNANCE_ERROR_TEXT[outcome.code](),
              );
              if (outcome.ok) setCount("");
              reload();
            })
            .finally(() => setSending(false));
        }}
      >
        {buy.dictatorship ? m.city_shares_treasury_buy_decree() : m.city_shares_treasury_vote()}
      </button>
      {notice ? (
        <p className="bp-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
