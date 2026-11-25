// 거래창 물건 목록(/economy/market) — 기획 흐름 "경제 → 거래 → 물건 고르기"(D-6032). 물건을 누르면 도시별 목록으로 쌓는다.
// 값은 기준 도시(내 창고가 있는 첫 도시 [임시])의 마지막 체결가와 24시간 등락, 작은 선은 시간마다 종가다.
// 거래소가 열리기 전(시안 자료가 아니면)에는 팩의 거래할 물건 목록만 보인다. 장비 같은 완제품은 경매 매물 목록이다(D-282).
import { type CatalogItemView, marketKindOf } from "@terra/shared/economy";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { trendOf } from "../amount.ts";
import {
  type CatalogIndex,
  categoryName,
  currencyName,
  fmt,
  indexCatalog,
  itemName,
} from "../economyText.ts";
import { Amount, Change, Loaded, NotReady, PreviewTag, Spark } from "../parts.tsx";
import { NO_ARGS, useCatalog, useMarketItems } from "../queries.ts";
import "./market.css";

/**
 * 호가창 물건(서버 previewWorld.tradesOnBook과 같은 규칙: 서버가 보낸 거래 방식, 없으면 옛 규칙 — 장비·유전자 = 경매, 문서 = 없음,
 * D-282·D-516)
 */
const onBook = (item: CatalogItemView): boolean => (item.market ?? marketKindOf(item)) === "book";

function ItemMeta({ item, index, extra }: { item: string; index: CatalogIndex; extra?: string }) {
  const entry = index.items.get(item);
  return (
    <span className="eco-row-meta">
      {entry ? `${categoryName(entry.category)} · ${m.economy_tier({ tier: entry.tier })}` : item}
      {extra ? ` · ${extra}` : ""}
    </span>
  );
}

export default function MarketItemsView() {
  const catalog = useCatalog(NO_ARGS);
  const market = useMarketItems(NO_ARGS);
  const index = indexCatalog(catalog.data);
  return (
    <div className="eco-stack">
      <div className="eco-toolbar">
        <p className="eco-hint">{m.economy_market_items_hint()}</p>
        <AppLink to={{ route: "economy_orders" }} className="eco-inline-link">
          {m.economy_my_orders()}
        </AppLink>
      </div>
      <Loaded view={market}>
        {(data) =>
          data.status === "not_ready" ? (
            <>
              <NotReady body={m.economy_not_ready_market()} />
              <section className="panel" aria-labelledby="eco-market-catalog">
                <h2 id="eco-market-catalog" className="eco-section-title">
                  {m.economy_market_catalog()}
                </h2>
                <ul className="eco-rows">
                  {(catalog.data?.items ?? []).filter(onBook).map((item) => (
                    <li key={item.id}>
                      <AppLink
                        className="eco-row eco-row-link"
                        to={{ route: "economy_market_item", params: { itemId: item.id } }}
                      >
                        <span className="eco-row-main">
                          <span className="eco-row-title">{itemName(index, item.id)}</span>
                          <ItemMeta item={item.id} index={index} />
                        </span>
                      </AppLink>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <section className="panel eco-market-list" aria-labelledby="eco-market-home">
              <div className="eco-place-head">
                <h2 id="eco-market-home" className="eco-section-title">
                  {data.homeCity
                    ? m.economy_market_home({ city: data.homeCity.name })
                    : m.economy_market_catalog()}
                </h2>
                {data.preview ? <PreviewTag /> : null}
              </div>
              {data.items[0]?.currency ? (
                <p className="eco-footnote eco-currency-unit">
                  {currencyName(index, data.items[0].currency)}
                </p>
              ) : null}
              <ul className="eco-rows">
                {data.items.map((row) => (
                  <li key={row.item}>
                    <AppLink
                      className="eco-row eco-row-link eco-market-row"
                      to={{ route: "economy_market_item", params: { itemId: row.item } }}
                    >
                      <span className="eco-row-main">
                        <span className="eco-row-title">{itemName(index, row.item)}</span>
                        <ItemMeta
                          item={row.item}
                          index={index}
                          extra={`${m.economy_market_cities({ count: row.cities })} · ${m.economy_market_volume({ qty: fmt(row.volume) })}`}
                        />
                      </span>
                      <Spark values={row.spark} trend={trendOf(row.changeBp)} />
                      <span className="eco-row-end">
                        {row.last === null ? <span className="eco-num">—</span> : <Amount value={row.last} />}
                        <Change bp={row.changeBp} />
                      </span>
                    </AppLink>
                  </li>
                ))}
              </ul>
            </section>
          )
        }
      </Loaded>
      <p className="eco-footnote">{m.economy_market_auction_note()}</p>
    </div>
  );
}
