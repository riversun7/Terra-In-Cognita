// 홈 [자산] 카드 — 사용자 요청 2026-11-14 "첫 페이지에도 통합으로 … 보유한 아이템을 볼수있게"(인벤토리 화면으로 가는 요약,
// docs/adr/2026-11-14-inventory-screen.md). 서버 카드 상태(dashboard.cards, 아직 not_ready) 대신 경제 원장 잔고(economy.holdings)로 그린다:
// 추정 가치(inventory/inventoryValue.ts)·물건 종류·자리 수 + [인벤토리] 링크. 실제 잔고만 쓴다(가짜 숫자 없음 — 시안 자료면 그 자료).
import { indexCatalog } from "../../economy/economyText.ts";
import { NO_ARGS, useCatalog, useHoldings, useMarketItems } from "../../economy/queries.ts";
import { holdingsSummary } from "../../economy/shape.ts";
import { estimateValue, totalLines } from "../../inventory/inventoryModel.ts";
import { priceLookup, valueParts } from "../../inventory/inventoryValue.ts";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { MoneyList } from "../../ui/Money.tsx";
import { HomeLoading } from "../InboxBody.tsx";

export function AssetsCardBody() {
  const catalog = useCatalog(NO_ARGS);
  const holdings = useHoldings(NO_ARGS);
  const market = useMarketItems(NO_ARGS);
  const data = holdings.data;
  if (!data) {
    return holdings.status === "failed" ? (
      <p className="home-card-hint">{m.card_assets_empty()}</p>
    ) : (
      <HomeLoading />
    );
  }
  if (!data.hasOwner) return <p className="home-card-hint">{m.card_assets_empty()}</p>;
  const index = indexCatalog(catalog.data);
  const summary = holdingsSummary(data);
  const value = valueParts(
    estimateValue(
      totalLines(data.places),
      priceLookup(index, market.data, catalog.data?.baseCurrency ?? null),
    ),
    index,
  );
  return (
    <>
      <p className="home-card-hint" data-metric="value">
        {value === null ? (
          m.inventory_value_none()
        ) : (
          <>
            {m.inventory_fact_value()} <MoneyList items={value} />
          </>
        )}
      </p>
      <p className="home-card-hint" data-metric="kinds">
        {m.economy_overview_warehouse({ places: summary.places, kinds: summary.kinds })}
      </p>
      <AppLink className="home-link-button" to={{ route: "inventory" }}>
        {m.card_assets_open()}
      </AppLink>
    </>
  );
}
