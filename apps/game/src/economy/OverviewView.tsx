// 경제 한눈에(/economy) — 창고·생산·거래·환전 칸의 요약 카드. 누르면 그 칸으로 간다(바꾸기).
// 네 조회는 같은 틱에 나가 HTTP 요청 하나로 묶인다(httpBatchLink).
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";
import { Icon, type IconName } from "../ui/icons.tsx";
import type { ReactNode } from "react";
import { assetName, indexCatalog } from "./economyText.ts";
import { Amount, PreviewTag } from "./parts.tsx";
import {
  NO_ARGS,
  useCatalog,
  useExchange,
  useHoldings,
  useNowTick,
  useOrders,
  useProduction,
} from "./queries.ts";
import { formatCountdown, holdingsSummary } from "./shape.ts";

function OverviewCard({
  to,
  icon,
  title,
  preview,
  children,
}: {
  to: "economy_warehouse" | "economy_production" | "economy_market" | "economy_exchange";
  icon: IconName;
  title: string;
  preview: boolean;
  children: ReactNode;
}) {
  return (
    <li className="eco-card">
      <AppLink to={{ route: to }} replace className="eco-card-link">
        <span className="eco-card-head">
          <span className="eco-card-mark" aria-hidden="true">
            <Icon name={icon} />
          </span>
          <span className="eco-card-title">{title}</span>
          {preview ? <PreviewTag /> : null}
        </span>
        <span className="eco-card-body">{children}</span>
      </AppLink>
    </li>
  );
}

export default function OverviewView() {
  const catalog = useCatalog(NO_ARGS);
  const holdings = useHoldings(NO_ARGS);
  const production = useProduction(NO_ARGS);
  const orders = useOrders(NO_ARGS);
  const exchange = useExchange(NO_ARGS);
  const now = useNowTick();
  const index = indexCatalog(catalog.data);
  const summary = holdings.data ? holdingsSummary(holdings.data) : null;
  const firstCash = holdings.data?.wallet[0];
  const stalled =
    production.data?.facilities.filter((f) => f.status === "no_input" || f.status === "storage_full")
      .length ?? 0;
  const running = production.data?.facilities.filter((f) => f.status === "running").length ?? 0;
  const ex = exchange.data;
  const exLeft = ex ? ex.nextAuctionAt - ex.generatedAt - (now - exchange.receivedAt) : 0;

  return (
    <>
      <ul className="eco-cards">
        <OverviewCard
          to="economy_warehouse"
          icon="economy"
          title={m.economy_tab_warehouse()}
          preview={holdings.data?.preview === true}
        >
          {summary ? (
            <>
              <span className="eco-card-metric">
                {m.economy_overview_warehouse({ places: summary.places, kinds: summary.kinds })}
              </span>
              {firstCash ? (
                <span className="eco-card-sub">
                  <Amount value={firstCash.qty} /> {assetName(index, firstCash)}
                </span>
              ) : null}
              {summary.spoilingSoon > 0 ? (
                <span className="eco-card-sub" data-tone="warning">
                  {m.economy_overview_spoiling({ count: summary.spoilingSoon })}
                </span>
              ) : null}
            </>
          ) : (
            <span className="eco-card-sub">{m.shell_loading()}</span>
          )}
        </OverviewCard>
        <OverviewCard
          to="economy_production"
          icon="units"
          title={m.economy_tab_production()}
          preview={production.data?.preview === true}
        >
          {production.data?.status === "ready" ? (
            <span className="eco-card-metric">{m.economy_overview_production({ running, stalled })}</span>
          ) : (
            <span className="eco-card-sub">{m.economy_not_ready_title()}</span>
          )}
          {catalog.data ? (
            <span className="eco-card-sub">
              {m.economy_overview_recipes({ count: catalog.data.recipes.length })}
            </span>
          ) : null}
        </OverviewCard>
        <OverviewCard
          to="economy_market"
          icon="map"
          title={m.economy_tab_market()}
          preview={orders.data?.preview === true}
        >
          {orders.data?.status === "ready" ? (
            <>
              <span className="eco-card-metric">
                {m.economy_overview_orders({ count: orders.data.open.length })}
              </span>
              <span className="eco-card-sub">
                {m.economy_limit({
                  left: Math.max(0, orders.data.limit.max - orders.data.limit.used),
                  max: orders.data.limit.max,
                })}
              </span>
            </>
          ) : (
            <span className="eco-card-sub">{m.economy_not_ready_title()}</span>
          )}
          {catalog.data ? (
            <span className="eco-card-sub">
              {m.economy_overview_items({ count: catalog.data.items.length })}
            </span>
          ) : null}
        </OverviewCard>
        <OverviewCard
          to="economy_exchange"
          icon="globe"
          title={m.economy_tab_exchange()}
          preview={ex?.preview === true}
        >
          {ex?.status === "ready" ? (
            <span className="eco-card-metric eco-num">
              {m.economy_overview_exchange({ time: formatCountdown(exLeft) })}
            </span>
          ) : (
            <span className="eco-card-sub">{m.economy_not_ready_title()}</span>
          )}
          {catalog.data ? (
            <span className="eco-card-sub">
              {m.economy_overview_currencies({ count: catalog.data.currencies.length })}
            </span>
          ) : null}
        </OverviewCard>
      </ul>
      {catalog.data?.placeholder ? <p className="eco-footnote">{m.economy_placeholder_pack()}</p> : null}
    </>
  );
}
