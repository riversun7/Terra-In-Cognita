// 호가창 + 주문표(/economy/market/:itemId/:cityId) — D-6033 배치: 위 차트(접기), 왼쪽 호가창, 오른쪽 주문표, 아래 체결.
// 넓은 화면(64em 이상)은 옆 패널에 차트를 크게, 이 시장의 내 주문 목록을 둔다. 촘촘(data-density="compact")은 경제 화면 틀이 단다.
// 주문표 상태는 이 화면이 들고, 호가 줄을 누르면 값이 주문표에 들어간다.
// 묶음 크기가 1보다 큰 물건(광석 1kg)은 가격·수량이 묶음 단위라는 알림을 시세 아래 둔다(302·D-506).
// 실제 거래소(서버 도시 경제, docs/adr/2026-11-07-play-flow.md WP4)면 주문표가 명령을 보내고, 화면을 연 동안 체결 알림을 켜서 알림마다 다시 받는다.
// 내 걸린 주문은 여기서도 거둘 수 있다.
import type { EconomyOrdersResponse, MarketBookResponse } from "@terra/shared/economy";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { toBig } from "../amount.ts";
import {
  currencyName,
  fmt,
  formatAgo,
  formatClock,
  indexCatalog,
  itemName,
  lotOf,
  lotText,
} from "../economyText.ts";
import type { OrderContext, OrderDraft } from "../orderForm.ts";
import { Change, Loaded, NotReady, PreviewTag } from "../parts.tsx";
import { NO_ARGS, useCatalog, useMarketBook, useMarketCities, useOrders } from "../queries.ts";
import { toDepthLevels } from "../shape.ts";
import { useMarketFills } from "./marketCommands.ts";
import { refreshMarket } from "./marketText.ts";
import { CancelOrderButton } from "./CancelOrderButton.tsx";
import { OrderBookPanel } from "./OrderBookPanel.tsx";
import { OrderFormPanel, initialDraft } from "./OrderFormPanel.tsx";
import { PriceChart } from "./PriceChart.tsx";
import "./market.css";

function contextOf(book: MarketBookResponse): OrderContext {
  return {
    asks: toDepthLevels(book.asks),
    bids: toDepthLevels(book.bids),
    taxBp: book.taxBp,
    cash: toBig(book.mine.cash),
    goods: toBig(book.mine.goods),
    ordersLeft: Math.max(0, book.limit.max - book.limit.used),
  };
}

function TradesList({ book }: { book: MarketBookResponse }) {
  return (
    <section className="eco-trades" aria-labelledby="eco-trades-title">
      <h2 id="eco-trades-title" className="eco-panel-title">
        {m.economy_trades_title()}
      </h2>
      {book.trades.length === 0 ? (
        <p className="eco-empty">{m.economy_trades_empty()}</p>
      ) : (
        <table className="eco-table">
          <thead>
            <tr>
              <th scope="col">{m.economy_col_time()}</th>
              <th scope="col">{m.economy_col_price()}</th>
              <th scope="col">{m.economy_col_qty()}</th>
            </tr>
          </thead>
          <tbody>
            {book.trades.map((trade, index) => (
              <tr key={`${trade.at}-${index}`} data-side={trade.side}>
                <td className="eco-num">{formatClock(trade.at, book.generatedAt)}</td>
                <td className="eco-num eco-trade-price">
                  <span className="visually-hidden">
                    {trade.side === "buy" ? m.economy_trade_up() : m.economy_trade_down()}
                  </span>
                  {fmt(trade.price)}
                </td>
                <td className="eco-num">{fmt(trade.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MarketOrders({
  orders,
  itemId,
  cityId,
  live,
}: {
  orders: EconomyOrdersResponse | null;
  itemId: string;
  cityId: string;
  live: boolean;
}) {
  const mine = orders?.open.filter((order) => order.item === itemId && order.city === cityId) ?? [];
  return (
    <section className="eco-side-orders" aria-labelledby="eco-side-orders-title">
      <div className="eco-place-head">
        <h2 id="eco-side-orders-title" className="eco-panel-title">
          {m.economy_my_orders()}
        </h2>
        <AppLink to={{ route: "economy_orders" }} className="eco-inline-link">
          {m.economy_orders_open()}
        </AppLink>
      </div>
      {mine.length === 0 ? (
        <p className="eco-empty">{m.economy_orders_empty()}</p>
      ) : (
        <ul className="eco-rows">
          {mine.map((order) => (
            <li key={order.id} className="eco-row" data-side={order.side}>
              <span className="eco-row-main">
                <span className="eco-row-title eco-order-side">
                  {order.side === "buy" ? m.economy_side_buy() : m.economy_side_sell()} ·{" "}
                  {m.economy_order_at({ price: fmt(order.price), qty: fmt(order.qty) })}
                </span>
                <span className="eco-row-meta">
                  {m.economy_order_remaining({ remaining: fmt(order.remaining), qty: fmt(order.qty) })}
                </span>
              </span>
              {live ? (
                <span className="eco-row-end">
                  <CancelOrderButton orderId={order.id} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BookTrader({
  book,
  orders,
  hasWarehouse,
  itemLabel,
}: {
  book: MarketBookResponse;
  orders: EconomyOrdersResponse | null;
  hasWarehouse: boolean;
  itemLabel: string;
}) {
  const context = contextOf(book);
  const lastPrice = book.last === null ? null : toBig(book.last);
  const [draft, setDraft] = useState<OrderDraft>(() => initialDraft(context, lastPrice, book.expiryDays));
  const [chartOpen, setChartOpen] = useState(true);
  const catalog = useCatalog(NO_ARGS);
  const index = indexCatalog(catalog.data);
  return (
    <div className="eco-trader" data-chart={chartOpen ? "open" : "closed"}>
      <div className="eco-quote">
        <div className="eco-quote-main">
          <span className="eco-quote-city" translate="no">
            {book.cityName}
          </span>
          {book.preview ? <PreviewTag /> : null}
          <span className="eco-quote-last eco-num">{book.last === null ? "—" : fmt(book.last)}</span>
          <Change bp={book.changeBp} />
          <span className="eco-quote-currency">{currencyName(index, book.currency)}</span>
        </div>
        <dl className="eco-quote-stats">
          <div>
            <dt>{m.economy_high()}</dt>
            <dd className="eco-num">{book.high === null ? "—" : fmt(book.high)}</dd>
          </div>
          <div>
            <dt>{m.economy_low()}</dt>
            <dd className="eco-num">{book.low === null ? "—" : fmt(book.low)}</dd>
          </div>
          <div>
            <dt>{m.economy_volume()}</dt>
            <dd className="eco-num">{fmt(book.volume)}</dd>
          </div>
        </dl>
        {lotOf(index.items.get(book.item)) > 1n ? (
          <p className="eco-notice" data-part="lot-note">
            {m.economy_lot_note({ size: lotText(index.items.get(book.item)) })}
          </p>
        ) : null}
        {book.inSight ? null : (
          <p className="eco-notice" data-tone="warning">
            {m.economy_book_observed({ time: formatAgo(book.observedAt, book.generatedAt) })}
          </p>
        )}
      </div>
      <div className="eco-chart-area">
        <button
          type="button"
          className="button-small eco-chart-toggle"
          aria-expanded={chartOpen}
          aria-controls="eco-chart-body"
          onClick={() => setChartOpen((open) => !open)}
        >
          {chartOpen ? m.economy_chart_hide() : m.economy_chart_show()}
        </button>
        <div id="eco-chart-body" className="eco-chart-body">
          <PriceChart
            candles={book.candles}
            label={{ item: itemLabel, city: book.cityName }}
            now={book.generatedAt}
          />
        </div>
      </div>
      <OrderBookPanel
        asks={book.asks}
        bids={book.bids}
        last={book.last}
        changeBp={book.changeBp}
        onPick={(price) =>
          setDraft((previous) => ({
            ...previous,
            price: String(price),
            kind: previous.kind === "market" ? "limit" : previous.kind,
          }))
        }
      />
      <OrderFormPanel
        draft={draft}
        setDraft={setDraft}
        context={context}
        expiryDays={book.expiryDays}
        limit={book.limit}
        hasWarehouse={hasWarehouse}
        lastPrice={lastPrice}
        now={book.generatedAt}
        live={book.preview ? null : { city: Number(book.city), item: book.item }}
      />
      <TradesList book={book} />
      <MarketOrders orders={orders} itemId={book.item} cityId={book.city} live={!book.preview} />
    </div>
  );
}

/** 실제 거래소 화면을 연 동안 체결 알림을 켠다(알림마다 다시 받는다) */
function LiveFills() {
  useMarketFills(refreshMarket);
  return null;
}

export default function MarketBookView({ itemId, cityId }: { itemId: string; cityId: string }) {
  const catalog = useCatalog(NO_ARGS);
  const book = useMarketBook([itemId, cityId]);
  const cities = useMarketCities([itemId]);
  const orders = useOrders(NO_ARGS);
  const index = indexCatalog(catalog.data);
  const hasWarehouse = cities.data?.rows.find((row) => row.city === cityId)?.hasWarehouse ?? true;
  return (
    <Loaded view={book}>
      {(data) =>
        data.status === "not_ready" ? (
          <NotReady body={m.economy_not_ready_market()} />
        ) : (
          <>
            {data.preview ? null : <LiveFills />}
            <BookTrader
              key={`${data.item}|${data.city}`}
              book={data}
              orders={orders.data}
              hasWarehouse={hasWarehouse}
              itemLabel={itemName(index, itemId)}
            />
          </>
        )
      }
    </Loaded>
  );
}
