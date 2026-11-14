// 경제 화면(/economy 아래) — 한눈에·창고·생산·거래·환전 칸과 거래창(물건 → 도시 → 호가·주문표), 내 주문.
// ADR 37 1절 "경제", 끝의 "구현하며 정한 것 (경제·거래창 화면)". 기획 60_UX §6(거래창 D-6032~D-6035)·§9(창고·생산 예약, 세부 미정).
// - 지연 로딩 조각이다(default export, shell/routeViews.tsx). 칸마다 다시 따로 조각이다(아래 lazy).
// - 칸끼리 옮기기는 바꾸기(replace), 거래창 안(물건 → 도시)은 쌓기(push)다.
// - 자료는 서버 조회(queries.ts)다. 플레이어는 실제 자료(팩 목록·원장 잔고, 서버 도시 경제가 돌면 거래소·내 주문·기준 도시 생산 —
//   docs/adr/2026-11-07-play-flow.md WP4)를 보고, 서버가 아직 돌리지 않는 것(환전, 도시 경제가 없는 세계의 거래소·생산)은 "곧 열림"이다.
//   주문·취소는 WebSocket(market/marketCommands.ts). dev·admin이 시안 자료를 켜면(홈 [편집], inbox/preview.ts) 시험 거래소가 보이고 화면이
//   "시험 자료"를 알린다(시안 자료에서는 명령을 보내지 않는다).
// - 거래창은 촘촘하다(data-density="compact", AGENTS 8장).
// - 시세 색(D-442): 뿌리에 data-market-colors(한국식·서양식)를 건다. 설정 "시세 색"이 없으면 언어 기본(economy.css가 색을 고른다).
import type { AccountView, RouteMatch, RouteTarget } from "@terra/shared";
import { Suspense, lazy, useEffect, useRef } from "react";
import { usePreviewOn } from "../inbox/preview.ts";
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";
import { getLocale } from "../paraglide/runtime.js";
import { resolveMarketColors } from "../settings/marketColors.ts";
import { useSettings } from "../settings/settings.ts";
import { BackButton } from "../shell/BackButton.tsx";
import { navigate } from "../shell/routerStore.ts";
import { itemName, indexCatalog } from "./economyText.ts";
import { NO_ARGS, useCatalog } from "./queries.ts";
import "./economy.css";

const OverviewView = lazy(() => import("./OverviewView.tsx"));
const ProductionView = lazy(() => import("./ProductionView.tsx"));
const ExchangeView = lazy(() => import("./ExchangeView.tsx"));
const OrdersView = lazy(() => import("./OrdersView.tsx"));
const MarketItemsView = lazy(() => import("./market/MarketItemsView.tsx"));
const MarketCitiesView = lazy(() => import("./market/MarketCitiesView.tsx"));
const MarketBookView = lazy(() => import("./market/MarketBookView.tsx"));

/** 경제 화면이 여는 주소 */
type EconomyRoute = Extract<
  RouteMatch,
  {
    id:
      | "economy"
      | "economy_warehouse"
      | "economy_production"
      | "economy_market"
      | "economy_market_item"
      | "economy_market_city"
      | "economy_orders"
      | "economy_exchange";
  }
>;

export function isEconomyRoute(match: RouteMatch): match is EconomyRoute {
  return match.id === "economy" || match.id.startsWith("economy_");
}

interface Tab {
  readonly target: RouteTarget;
  readonly label: () => string;
  /** 이 칸이 지금 칸인 주소 */
  readonly owns: readonly string[];
}

const TABS: readonly Tab[] = [
  { target: { route: "economy" }, label: m.economy_tab_overview, owns: ["economy"] },
  { target: { route: "economy_production" }, label: m.economy_tab_production, owns: ["economy_production"] },
  {
    target: { route: "economy_market" },
    label: m.economy_tab_market,
    owns: ["economy_market", "economy_market_item", "economy_market_city", "economy_orders"],
  },
  { target: { route: "economy_exchange" }, label: m.economy_tab_exchange, owns: ["economy_exchange"] },
];

/** 칸 고르기 띠. 좁으면 띠 안에서만 가로로 넘긴다(화면은 넘치지 않는다) */
function EconomyTabs({ current }: { current: string }) {
  const navRef = useRef<HTMLElement>(null);
  // 지금 칸이 띠 밖이면 띠만 가로로 넘겨 보이게 한다(화면 세로 스크롤은 건드리지 않는다)
  useEffect(() => {
    const strip = navRef.current;
    const active = strip?.querySelector<HTMLElement>(`[data-owns~="${current}"]`);
    if (!strip || !active) return;
    // 띠가 offsetParent다(economy.css position: relative) → 띠 안의 자리
    const left = active.offsetLeft;
    if (left < strip.scrollLeft || left + active.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = Math.max(0, left - (strip.clientWidth - active.offsetWidth) / 2);
    }
  }, [current]);
  return (
    <nav ref={navRef} className="eco-tabs" aria-label={m.economy_tabs_label()}>
      <ul className="eco-tabs-list">
        {TABS.map((tab) => {
          const here = tab.owns.includes(current);
          return (
            <li key={tab.target.route}>
              <AppLink
                to={tab.target}
                replace
                className="eco-tab"
                data-owns={tab.owns.join(" ")}
                aria-current={here && tab.owns[0] === current ? "page" : here ? "true" : undefined}
              >
                {tab.label()}
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 옛 창고 칸 → 인벤토리 [창고별](주소 바꾸기 — 뒤로 가기에 옛 주소가 남지 않게) */
function MovedToInventory() {
  useEffect(() => {
    navigate({ route: "inventory", search: { tab: "warehouses" } }, { replace: true });
  }, []);
  return null;
}

function SectionBody({ match }: { match: EconomyRoute }) {
  switch (match.id) {
    case "economy":
      return <OverviewView />;
    case "economy_warehouse":
      // 옛 창고 칸 주소: 인벤토리 [창고별]로 바꿔 연다(docs/adr/2026-11-14-inventory-screen.md)
      return <MovedToInventory />;
    case "economy_production":
      return <ProductionView />;
    case "economy_market":
      return <MarketItemsView />;
    case "economy_market_item":
      return <MarketCitiesView itemId={match.params.itemId} />;
    case "economy_market_city":
      return <MarketBookView itemId={match.params.itemId} cityId={match.params.cityId} />;
    case "economy_orders":
      return <OrdersView />;
    case "economy_exchange":
      return <ExchangeView />;
    default: {
      const unhandled: never = match;
      return unhandled;
    }
  }
}

/** 화면 제목(h1). 물건 화면은 물건 이름(목록을 받기 전에는 ID) */
function useTitle(match: EconomyRoute): string {
  const catalog = useCatalog(NO_ARGS);
  switch (match.id) {
    case "economy":
      return m.nav_economy();
    case "economy_warehouse":
      return m.economy_tab_warehouse();
    case "economy_production":
      return m.economy_tab_production();
    case "economy_market":
      return m.economy_market_title();
    case "economy_market_item":
    case "economy_market_city":
      return itemName(indexCatalog(catalog.data), match.params.itemId);
    case "economy_orders":
      return m.economy_my_orders();
    case "economy_exchange":
      return m.economy_tab_exchange();
    default: {
      const unhandled: never = match;
      return unhandled;
    }
  }
}

export default function EconomyScreen({ match, user }: { match: RouteMatch; user: AccountView }) {
  const preview = usePreviewOn();
  if (!isEconomyRoute(match)) return null;
  return <EconomyFrame match={match} user={user} preview={preview} />;
}

function EconomyFrame({
  match,
  user,
  preview,
}: {
  match: EconomyRoute;
  user: AccountView;
  preview: boolean;
}) {
  const title = useTitle(match);
  const { device } = useSettings();
  const marketColors = resolveMarketColors(device.marketColors, getLocale());
  const canPreview = user.roles.includes("dev") || user.roles.includes("admin");
  const compact = match.id === "economy_market_city" || match.id === "economy_exchange";
  return (
    <section
      className="screen screen-wide economy"
      aria-labelledby="economy-title"
      data-density={compact ? "compact" : undefined}
      data-market-colors={marketColors}
    >
      <div className="screen-header">
        <h1 id="economy-title" className="screen-title" tabIndex={-1}>
          {title}
        </h1>
        <BackButton />
      </div>
      <EconomyTabs current={match.id} />
      {preview ? (
        <p className="eco-notice" data-tone="preview">
          {m.economy_preview_notice()}
        </p>
      ) : canPreview ? (
        <p className="eco-notice">{m.economy_preview_hint()}</p>
      ) : null}
      <Suspense
        fallback={
          <p className="status eco-loading" role="status">
            {m.shell_loading()}
          </p>
        }
      >
        <SectionBody match={match} />
      </Suspense>
    </section>
  );
}
