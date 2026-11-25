// 생산시설 지분 칸 — 사용자 요청 2026-11-15 "주식을 사고팔수있게도 해라", 기획 44 §6(100% 매각 가능 — 경영권 이전, 배당은 지분만큼)·D-125(동시호가),
// docs/adr/2026-11-15-building-screen.md. 건물 판 [지분] 칸과 재무 화면이 같이 쓴다.
// - 주주: 이름·몫(%) 막대(가장 많은 주주가 관리 — 정산·값·임금·임대료).
// - 시장: 지난 체결가·다음 회차·걸린 살·팔 합, 내 지분·지갑, 주문(사기·팔기, 1주 값 × 주 수), 내 걸린 주문(거두기), 최근 체결 막대.
// - 판정·체결은 서버(business_share_order·business_share_cancel, 프로토콜 38). 화면은 입력 모양과 묶일 돈만 미리 보인다.
// - 바뀜 (D-583, docs/adr/2026-11-21-share-market.md): 시장 칸 아래 호가창(값마다 걸린 주·지금 닫으면 날 값·다음 회차 시계 — shares/OrderBook.tsx).
import type { BookHolder, ShareMarketView } from "@terra/shared/businessBooks";
import { useState } from "react";
import { formatAmount, parseAmountInput } from "../../economy/amount.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { OrderBook } from "../../shares/OrderBook.tsx";
import { EntityRef } from "../../ui/EntityRef.tsx";
import { timeText } from "./booksData.ts";
import { type BusinessCommand, sendBusinessCommand } from "./businessCommands.ts";
import { RESULT_TEXT, moneyName, ownerText, pmText } from "./businessText.ts";

interface ShareMarketProps {
  readonly buildingId: number;
  readonly holders: readonly BookHolder[];
  readonly market: ShareMarketView | undefined;
  /** 명령 뒤 장부를 다시 읽는다 */
  readonly reload: () => void;
  /** 주주 목록만(주문 칸 없이) */
  readonly holdersOnly?: boolean | undefined;
  /** 이 시장을 연 증권 거래소 건물(증권 거래소 판 — 주문에 적어 그 거래소가 이용료를 받는다, D-591 2523) */
  readonly exchangeId?: number | undefined;
}

/** 주주 막대 목록(많은 차례) */
export function HolderBars({ holders }: { readonly holders: readonly BookHolder[] }) {
  const locale = getLocale();
  if (holders.length === 0) return <p className="bp-muted">{m.shares_holders_none()}</p>;
  return (
    <ul className="bp-holders" aria-label={m.shares_holders()} data-part="share-holders">
      {holders.map((holder, index) => {
        const pm = holder.pm ?? 0;
        return (
          // 같은 이름이 둘일 수 있어 차례를 열쇠에 섞는다(주주 ID는 보내지 않는다)
          <li key={`${index}-${holder.shares}`} className="bp-holder" data-kind={holder.kind}>
            <span className="bp-holder-name">
              <EntityRef
                kind={holder.kind === "npc" ? "nation" : "unit"}
                role={holder.kind === "npc" ? undefined : "cyborg"}
                name={ownerText(holder.name, holder.kind)}
                mine={holder.kind === "me"}
              />
              {holder.kind === "me" ? <span className="bp-mine-dot">{m.building_mine_short()}</span> : null}
            </span>
            <span className="bp-holder-num">
              {pmText(pm)} · {m.shares_count({ count: formatAmount(holder.shares, locale) })}
            </span>
            <span className="bp-meter" aria-hidden="true">
              <span
                className="bp-meter-fill"
                data-tone={index === 0 ? "lead" : "rest"}
                style={{ inlineSize: `${pm / 10}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ShareMarket({
  buildingId,
  holders,
  market,
  reload,
  holdersOnly = false,
  exchangeId,
}: ShareMarketProps) {
  const locale = getLocale();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [count, setCount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const run = (command: BusinessCommand, done: string) => {
    setSending(true);
    void sendBusinessCommand(command)
      .then((outcome) => {
        setNotice(outcome.ok ? done : RESULT_TEXT[outcome.code]());
        if (outcome.ok) {
          setPrice("");
          setCount("");
        }
        reload();
      })
      .finally(() => setSending(false));
  };

  const priceIn = parseAmountInput(price);
  const countIn = parseAmountInput(count);
  const valid = priceIn.kind === "ok" && countIn.kind === "ok" && priceIn.value > 0n && countIn.value > 0n;
  const lock = valid && priceIn.kind === "ok" && countIn.kind === "ok" ? priceIn.value * countIn.value : 0n;
  const money = market ? moneyName(market.asset) : "";
  const tooMany = market !== undefined && market.myOrders.length >= market.orderMax;
  const shortCash = market !== undefined && side === "buy" && lock > BigInt(market.myCash);
  const shortShares =
    market !== undefined &&
    side === "sell" &&
    countIn.kind === "ok" &&
    countIn.value > BigInt(market.myShares);

  return (
    <div className="bp-shares" data-part="share-market">
      <section className="bp-card" aria-label={m.shares_holders()}>
        <h3 className="bp-card-title">{m.shares_holders()}</h3>
        <HolderBars holders={holders} />
        <p className="bp-muted">{m.shares_rule_note()}</p>
      </section>
      {holdersOnly || !market ? null : (
        <>
          <section className="bp-card" aria-label={m.shares_market()}>
            <h3 className="bp-card-title">{m.shares_market()}</h3>
            <dl className="bp-stats">
              <div>
                <dt>{m.shares_last_price()}</dt>
                <dd data-part="share-last">
                  {market.lastPrice === null
                    ? m.shares_no_trade()
                    : `${formatAmount(market.lastPrice, locale)} ${money}`}
                </dd>
              </div>
              <div>
                <dt>{m.shares_total()}</dt>
                <dd>{formatAmount(market.total, locale)}</dd>
              </div>
              <div>
                <dt>{m.shares_mine()}</dt>
                <dd data-part="share-mine">{formatAmount(market.myShares, locale)}</dd>
              </div>
              <div>
                <dt>{m.shares_book()}</dt>
                <dd>
                  {m.shares_book_value({
                    bid: formatAmount(market.bidShares, locale),
                    ask: formatAmount(market.askShares, locale),
                  })}
                </dd>
              </div>
            </dl>
            <p className="bp-muted">{m.shares_next_round({ at: timeText(market.nextRoundMs, locale) })}</p>
            {market.issued ? null : <p className="bp-muted">{m.shares_not_issued()}</p>}
            {market.rounds.length > 0 ? <RoundBars rounds={market.rounds} /> : null}
          </section>
          {market.book ? (
            // 호가창(D-583 "호가창처럼" — 값마다 걸린 주, 값 줄을 누르면 주문 값에)
            <OrderBook
              book={market.book}
              expected={market.expected}
              money={money}
              nextRoundMs={market.nextRoundMs}
              onPick={setPrice}
              onDue={reload}
            />
          ) : null}
          <section className="bp-card" aria-label={m.shares_order()}>
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
            <div className="bp-form-row">
              <label className="bp-field">
                <span>{m.shares_price({ money })}</span>
                <input
                  className="bp-input"
                  inputMode="numeric"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  data-part="share-price"
                />
              </label>
              <label className="bp-field">
                <span>{m.shares_qty()}</span>
                <input
                  className="bp-input"
                  inputMode="numeric"
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  data-part="share-qty"
                />
              </label>
            </div>
            <p className="bp-muted" data-part="share-lock">
              {side === "buy"
                ? m.shares_lock_buy({
                    amount: formatAmount(lock, locale),
                    money,
                    cash: formatAmount(market.myCash, locale),
                  })
                : m.shares_lock_sell({
                    count: formatAmount(countIn.kind === "ok" ? countIn.value : 0n, locale),
                    have: formatAmount(market.myShares, locale),
                  })}
            </p>
            {tooMany ? <p className="bp-warn">{m.shares_err_order_limit()}</p> : null}
            <button
              type="button"
              className="button-small button-primary bp-wide"
              data-part="share-submit"
              disabled={sending || !valid || tooMany || shortCash || shortShares}
              onClick={() => {
                if (priceIn.kind !== "ok" || countIn.kind !== "ok") return;
                run(
                  {
                    t: "business_share_order",
                    buildingId,
                    side,
                    price: String(priceIn.value),
                    shares: String(countIn.value),
                    ...(exchangeId === undefined ? {} : { exchangeId }),
                  },
                  m.shares_placed(),
                );
              }}
            >
              {side === "buy" ? m.shares_submit_buy() : m.shares_submit_sell()}
            </button>
            {market.myOrders.length > 0 ? (
              <ul className="bp-list" aria-label={m.shares_my_orders()} data-part="share-orders">
                {market.myOrders.map((order) => (
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
                    <button
                      type="button"
                      className="button-small"
                      disabled={sending}
                      onClick={() =>
                        run({ t: "business_share_cancel", orderId: order.id }, m.shares_cancelled())
                      }
                    >
                      {m.shares_cancel()}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {notice ? (
              <p className="bp-notice" role="status">
                {notice}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

/** 최근 체결가 막대(가장 높은 값 = 가득) — 정부 지분 시장(shares/CityShareMarket.tsx)도 쓴다 */
export function RoundBars({ rounds }: { readonly rounds: ShareMarketView["rounds"] }) {
  const locale = getLocale();
  let top = 1n;
  for (const round of rounds)
    if (round.price !== null && BigInt(round.price) > top) top = BigInt(round.price);
  return (
    <ul className="bp-spark" aria-label={m.shares_rounds()}>
      {rounds.map((round) => (
        <li
          key={round.atMs}
          className="bp-spark-bar"
          title={`${timeText(round.atMs, locale)} · ${round.price === null ? "-" : formatAmount(round.price, locale)}`}
          style={{ blockSize: `${round.price === null ? 0 : Number((BigInt(round.price) * 100n) / top)}%` }}
        />
      ))}
    </ul>
  );
}
