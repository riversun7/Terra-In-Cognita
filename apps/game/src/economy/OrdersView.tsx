// 내 주문(/economy/orders, D-329 = PLAN 14장 질문 94 가) — 걸린 주문(남은 양·만료)과 끝난 주문(체결·만료·취소), 남은 주문 수.
// 처리할 일 order_filled·order_expired도 이리로 온다. [취소]는 명령을 보내지 않는다(곧 열림, 취소 명령은 WebSocket으로 붙인다).
import type { MyOrder, MyOrderDone } from "@terra/shared/economy";
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";
import {
  type CatalogIndex,
  currencyName,
  fmt,
  formatAgo,
  formatClock,
  indexCatalog,
  itemName,
} from "./economyText.ts";
import { Loaded, NotReady, PreviewTag } from "./parts.tsx";
import { NO_ARGS, useCatalog, useOrders } from "./queries.ts";

const DONE_STATUS: Readonly<Record<MyOrderDone["status"], () => string>> = {
  filled: m.economy_order_filled,
  expired: m.economy_order_expired,
  cancelled: m.economy_order_cancelled,
};

function OrderTitle({ order, index }: { order: MyOrder | MyOrderDone; index: CatalogIndex }) {
  return (
    <AppLink
      className="eco-row-title eco-order-title"
      to={{ route: "economy_market_city", params: { itemId: order.item, cityId: order.city } }}
    >
      <span className="eco-order-side" data-side={order.side}>
        {order.side === "buy" ? m.economy_side_buy() : m.economy_side_sell()}
      </span>{" "}
      {itemName(index, order.item)} · {order.cityName}
    </AppLink>
  );
}

function OpenRow({
  order,
  index,
  now,
  preview,
}: {
  order: MyOrder;
  index: CatalogIndex;
  now: number;
  preview: boolean;
}) {
  return (
    <li className="eco-row eco-order">
      <span className="eco-row-main">
        <OrderTitle order={order} index={index} />
        <span className="eco-row-meta">
          {m.economy_order_at({ price: fmt(order.price), qty: fmt(order.qty) })} ·{" "}
          {currencyName(index, order.currency)}
          {order.type === "conditional" ? ` · ${m.economy_kind_conditional()}` : ""}
        </span>
        <span className="eco-row-meta">
          {m.economy_order_remaining({ remaining: fmt(order.remaining), qty: fmt(order.qty) })} ·{" "}
          {m.economy_order_expires({ time: formatClock(order.expiresAt, now) })}
        </span>
      </span>
      <span className="eco-row-end">
        {preview ? <PreviewTag /> : null}
        <button
          type="button"
          className="button-small"
          aria-disabled="true"
          aria-describedby="eco-orders-soon"
        >
          {m.economy_order_cancel()}
        </button>
      </span>
    </li>
  );
}

function DoneRow({ order, index, now }: { order: MyOrderDone; index: CatalogIndex; now: number }) {
  return (
    <li className="eco-row eco-order">
      <span className="eco-row-main">
        <OrderTitle order={order} index={index} />
        <span className="eco-row-meta">
          {m.economy_order_at({ price: fmt(order.price), qty: fmt(order.qty) })} ·{" "}
          {m.economy_order_filled_of({ filled: fmt(order.filled), qty: fmt(order.qty) })}
        </span>
      </span>
      <span className="eco-row-end">
        <span className="eco-tag" data-tone={order.status === "filled" ? "on" : undefined}>
          {DONE_STATUS[order.status]()}
        </span>
        <span className="eco-row-meta">{formatAgo(order.at, now)}</span>
      </span>
    </li>
  );
}

export default function OrdersView() {
  const catalog = useCatalog(NO_ARGS);
  const orders = useOrders(NO_ARGS);
  const index = indexCatalog(catalog.data);
  return (
    <Loaded view={orders}>
      {(data) =>
        data.status === "not_ready" ? (
          <NotReady body={m.economy_not_ready_orders()} />
        ) : (
          <div className="eco-stack">
            <p id="eco-orders-soon" className="visually-hidden">
              {m.economy_submit_soon()}
            </p>
            <p className="eco-limit-line">
              {m.economy_limit({ left: Math.max(0, data.limit.max - data.limit.used), max: data.limit.max })}
            </p>
            <section className="panel" aria-labelledby="eco-orders-open">
              <h2 id="eco-orders-open" className="eco-section-title">
                {m.economy_orders_open()}
              </h2>
              {data.open.length === 0 ? (
                <p className="eco-empty">{m.economy_orders_empty()}</p>
              ) : (
                <ul className="eco-rows">
                  {data.open.map((order) => (
                    <OpenRow
                      key={order.id}
                      order={order}
                      index={index}
                      now={data.generatedAt}
                      preview={data.preview}
                    />
                  ))}
                </ul>
              )}
            </section>
            <section className="panel" aria-labelledby="eco-orders-done">
              <h2 id="eco-orders-done" className="eco-section-title">
                {m.economy_orders_done()}
              </h2>
              {data.done.length === 0 ? (
                <p className="eco-empty">{m.economy_orders_done_empty()}</p>
              ) : (
                <ul className="eco-rows">
                  {data.done.map((order) => (
                    <DoneRow key={order.id} order={order} index={index} now={data.generatedAt} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )
      }
    </Loaded>
  );
}
