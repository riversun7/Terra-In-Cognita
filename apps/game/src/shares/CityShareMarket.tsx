// 정부 지분 시장 칸 — 기획 D-583(질문 2438 답: "정부건물 내 전체지분 조회기능, 호가창처럼 거래가능 … 소유자는 지분을 매도가 정해서 걸어놓을 수 있음, 반대로
// 매수자는 매수금액 걸어놓기 가능"), docs/adr/2026-11-21-share-market.md. 정부 대화상자(GovernmentDialog.tsx)와 증권 거래소 판(ShareHub.tsx)이 같이 쓴다.
// - 머리: 지난 체결가·지분 합·내 지분. 주주 전체(이 도시 · 나라 전체 고르기 — 이름·종류·몫 막대, 지배 가문 표시).
// - 호가창(OrderBook.tsx — 값 줄을 누르면 주문 값에 넣는다)·다음 회차 시계.
// - 주문: 사기·팔기, 주문하는 쪽(내 계정 · 내 가문 — 가문장만), 1주 값 × 주 수, 묶일 돈·팔 수 있는 주 미리 보기. 내 걸린 주문(거두기).
// - 국고 지분: 그 나라 사람에게 국고가 가진 주와, 자격이 있으면 국고 지분 팔기(독재 = 직권, 그 밖 = 안건 — WebSocket gov_propose treasury_share_sale).
//   바뀜(줄기 share-market-2, D-587): 국고 칸·국고 지분 사기는 TreasuryShares.tsx. 주문 칸에 거래세·증권 거래소 이용료 요율(2474 다).
// 판정·체결은 서버(city_share_order·city_share_cancel). 화면은 입력 모양과 묶일 돈만 미리 보인다.
import type {
  CityShareHolderView,
  CityShareMarketResponse,
  CityShareMarketView,
} from "@terra/shared/cityShares";
import { useCallback, useEffect, useState } from "react";
import { formatAmount, parseAmountInput } from "../economy/amount.ts";
import { bpPercent } from "../economy/economyText.ts";
import { RoundBars } from "../map/business/ShareMarket.tsx";
import { localName, moneyName, pmText } from "../map/business/businessText.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { OrderBook } from "./OrderBook.tsx";
import { loadCityShares, sendCityShare } from "./shareCommands.ts";
import { CITY_SHARE_RESULT_TEXT, HOLDER_KIND_TEXT } from "./shareText.ts";
import { TreasuryBuy, TreasurySale } from "./TreasuryShares.tsx";
import "../map/building/building.css";
import "./shares.css";

/** 도시 지분 시장 자료(cityId가 바뀌면 다시 읽는다). reload는 명령·회차 뒤 */
function useCityShares(cityId: number) {
  const [data, setData] = useState<CityShareMarketResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    loadCityShares(cityId, controller.signal)
      .then((response) => {
        setData(response);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [cityId]);
  const reload = useCallback(() => {
    loadCityShares(cityId)
      .then((response) => {
        setData(response);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [cityId]);
  const ok = data?.status === "ok" && data.cityId === cityId ? data : null;
  return { data: data?.status === "ok" ? ok : data, failed, reload };
}

function HolderList({ holders }: { readonly holders: readonly CityShareHolderView[] }) {
  const locale = getLocale();
  if (holders.length === 0) return <p className="bp-muted">{m.shares_holders_none()}</p>;
  return (
    <ul className="bp-holders" data-part="city-share-holders">
      {holders.map((holder, index) => (
        <li key={`${index}-${holder.kind}-${holder.shares}`} className="bp-holder" data-kind={holder.kind}>
          <span className="bp-holder-name">
            {localName(holder.name) ?? HOLDER_KIND_TEXT[holder.kind]()}{" "}
            <span className="sm-holder-kind">· {HOLDER_KIND_TEXT[holder.kind]()}</span>
            {holder.ruling ? <span className="sm-ruling">{m.city_shares_ruling()}</span> : null}
          </span>
          <span className="bp-holder-num">
            {pmText(holder.pm)} · {m.shares_count({ count: formatAmount(holder.shares, locale) })}
          </span>
          <span className="bp-meter" aria-hidden="true">
            <span
              className="bp-meter-fill"
              data-tone={index === 0 ? "lead" : "rest"}
              style={{ inlineSize: `${holder.pm / 10}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function OrderForm({
  view,
  price,
  setPrice,
  reload,
  exchangeId,
}: {
  readonly view: CityShareMarketView;
  readonly price: string;
  readonly setPrice: (value: string) => void;
  readonly reload: () => void;
  readonly exchangeId?: number | undefined;
}) {
  const locale = getLocale();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [asHouse, setAsHouse] = useState(false);
  const [count, setCount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const money = moneyName(view.asset);
  const wallet = asHouse && view.house ? view.house : view.me;
  const priceIn = parseAmountInput(price);
  const countIn = parseAmountInput(count);
  const valid = priceIn.kind === "ok" && countIn.kind === "ok" && priceIn.value > 0n && countIn.value > 0n;
  const lock = valid && priceIn.kind === "ok" && countIn.kind === "ok" ? priceIn.value * countIn.value : 0n;
  const tooMany = view.myOrders.length >= view.orderMax;
  const short =
    side === "buy"
      ? lock > BigInt(wallet.cash)
      : countIn.kind === "ok" && countIn.value > BigInt(wallet.sellable);
  const run = (body: Parameters<typeof sendCityShare>[0], done: string) => {
    setSending(true);
    void sendCityShare(body)
      .then((outcome) => {
        setNotice(outcome.ok ? done : CITY_SHARE_RESULT_TEXT[outcome.code]());
        if (outcome.ok) setCount("");
        reload();
      })
      .finally(() => setSending(false));
  };
  return (
    <section className="bp-card" aria-label={m.shares_order()} data-part="city-share-order">
      <h3 className="bp-card-title">{m.shares_order()}</h3>
      <div className="bp-seg" role="radiogroup" aria-label={m.shares_side()}>
        {(["buy", "sell"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={side === value}
            className="bp-seg-item"
            data-side={value}
            onClick={() => setSide(value)}
          >
            {value === "buy" ? m.shares_buy() : m.shares_sell()}
          </button>
        ))}
      </div>
      {view.house ? (
        <div className="bp-seg" role="radiogroup" aria-label={m.city_shares_as()} data-part="city-share-as">
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={asHouse === value}
              className="bp-seg-item"
              onClick={() => setAsHouse(value)}
            >
              {value ? m.city_shares_as_house() : m.city_shares_as_me()}
            </button>
          ))}
        </div>
      ) : null}
      <p className="sm-wallet" data-part="city-share-wallet">
        {m.city_shares_wallet({
          shares: formatAmount(wallet.shares, locale),
          cash: formatAmount(wallet.cash, locale),
          money,
        })}
      </p>
      <div className="bp-form-row">
        <label className="bp-field">
          <span>{m.shares_price({ money })}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            data-part="city-share-price"
          />
        </label>
        <label className="bp-field">
          <span>{m.shares_qty()}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            data-part="city-share-qty"
          />
        </label>
      </div>
      <p className="bp-muted" data-part="city-share-lock">
        {side === "buy"
          ? m.shares_lock_buy({
              amount: formatAmount(lock, locale),
              money,
              cash: formatAmount(wallet.cash, locale),
            })
          : m.city_shares_lock_sell({
              count: formatAmount(countIn.kind === "ok" ? countIn.value : 0n, locale),
              have: formatAmount(wallet.sellable, locale),
            })}
      </p>
      {side === "sell" && asHouse && view.regime === "dictatorship" ? (
        <p className="bp-muted">{m.city_shares_majority_note()}</p>
      ) : null}
      {tooMany ? <p className="bp-warn">{m.shares_err_order_limit()}</p> : null}
      <button
        type="button"
        className="button-small button-primary bp-wide"
        data-part="city-share-submit"
        disabled={sending || !valid || tooMany || short}
        onClick={() => {
          if (priceIn.kind !== "ok" || countIn.kind !== "ok") return;
          run(
            {
              t: "city_share_order",
              cityId: view.cityId,
              side,
              price: String(priceIn.value),
              shares: String(countIn.value),
              ...(asHouse && view.house ? { asHouse: true } : {}),
              // 증권 거래소 판에서 열었으면 그 거래소가 이용료를 받는다(D-591 2523)
              ...(exchangeId === undefined ? {} : { exchangeId }),
            },
            m.shares_placed(),
          );
        }}
      >
        {side === "buy" ? m.shares_submit_buy() : m.shares_submit_sell()}
      </button>
      {view.myOrders.length > 0 ? (
        <ul className="bp-list" aria-label={m.shares_my_orders()} data-part="city-share-orders">
          {view.myOrders.map((order) => (
            <li key={order.id} className="bp-row" data-side={order.side}>
              <span className="bp-tag" data-side={order.side}>
                {order.side === "buy" ? m.shares_buy() : m.shares_sell()}
              </span>
              {order.as === "house" ? <span className="bp-tag">{m.city_shares_order_house()}</span> : null}
              <span className="bp-grow">
                {m.shares_order_line({
                  price: formatAmount(order.price, locale),
                  money,
                  count: formatAmount(order.shares, locale),
                })}
              </span>
              <button
                type="button"
                className="button-small"
                disabled={sending}
                onClick={() => run({ t: "city_share_cancel", orderId: order.id }, m.shares_cancelled())}
              >
                {m.shares_cancel()}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="bp-muted">{m.city_shares_rest_note()}</p>
      {view.levy ? (
        <p className="bp-muted" data-part="city-share-levy">
          {view.levy.feeBp === null
            ? m.city_shares_levy({ tax: bpPercent(view.levy.taxBp) })
            : m.city_shares_levy_fee({ tax: bpPercent(view.levy.taxBp), fee: bpPercent(view.levy.feeBp) })}
        </p>
      ) : null}
      {notice ? (
        <p className="bp-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

/** exchangeId = 이 시장을 연 증권 거래소 건물(그 거래소 판의 지분 목록에서 열었을 때 — 주문에 적어 그 거래소가 이용료를 받는다, D-591 2523) */
export function CityShareMarket({
  cityId,
  exchangeId,
}: {
  readonly cityId: number;
  readonly exchangeId?: number | undefined;
}) {
  const locale = getLocale();
  const { data, failed, reload } = useCityShares(cityId);
  const [scope, setScope] = useState<"city" | "nation">("city");
  const [price, setPrice] = useState("");
  if (!data) return <p className="bp-muted">{failed ? m.city_shares_failed() : m.city_shares_loading()}</p>;
  if (data.status !== "ok")
    return (
      <p className="bp-muted">
        {data.status === "unknown_city" ? m.city_shares_unknown() : m.city_shares_not_ready()}
      </p>
    );
  const money = moneyName(data.asset);
  return (
    <div className="bp-shares sm" data-part="city-share-market" data-city={data.cityId}>
      <section className="bp-card" aria-label={m.city_shares_title()}>
        <h3 className="bp-card-title">{m.city_shares_title()}</h3>
        <p className="bp-muted">
          {m.city_shares_lead({
            city: localName(data.cityName) ?? String(data.cityId),
            total: formatAmount(data.total, locale),
            money,
          })}
        </p>
        <dl className="bp-stats">
          <div>
            <dt>{m.shares_last_price()}</dt>
            <dd data-part="city-share-last">
              {data.lastPrice === null
                ? m.shares_no_trade()
                : `${formatAmount(data.lastPrice, locale)} ${money}`}
            </dd>
          </div>
          <div>
            <dt>{m.shares_mine()}</dt>
            <dd>{formatAmount(data.me.shares, locale)}</dd>
          </div>
          <div>
            <dt>{m.shares_book()}</dt>
            <dd>
              {m.shares_book_value({
                bid: formatAmount(data.bidShares, locale),
                ask: formatAmount(data.askShares, locale),
              })}
            </dd>
          </div>
        </dl>
      </section>
      <section className="bp-card" aria-label={m.city_shares_holders()}>
        <h3 className="bp-card-title">{m.city_shares_holders()}</h3>
        <div className="bp-seg" role="radiogroup" aria-label={m.city_shares_holders()}>
          {(["city", "nation"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              className="bp-seg-item"
              data-part={`city-share-scope-${value}`}
              onClick={() => setScope(value)}
            >
              {value === "city" ? m.city_shares_scope_city() : m.city_shares_scope_nation()}
            </button>
          ))}
        </div>
        <HolderList holders={scope === "city" ? data.holders : data.nationHolders} />
      </section>
      <OrderBook
        book={data.book}
        expected={data.expected}
        money={money}
        nextRoundMs={data.nextRoundMs}
        onPick={setPrice}
        onDue={reload}
      />
      {data.rounds.length > 0 ? (
        <section className="bp-card" aria-label={m.shares_rounds()}>
          <h3 className="bp-card-title">{m.shares_rounds()}</h3>
          <RoundBars rounds={data.rounds} />
        </section>
      ) : null}
      <OrderForm view={data} price={price} setPrice={setPrice} reload={reload} exchangeId={exchangeId} />
      <TreasurySale view={data} reload={reload} />
      <TreasuryBuy view={data} reload={reload} />
    </div>
  );
}
