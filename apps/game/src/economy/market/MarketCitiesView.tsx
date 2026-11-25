// 도시별 목록(/economy/market/:itemId) — D-6032: 모든 도시를 한 목록(가격·거리·운임·관측 시각)으로. 누구나 어디서든 원격 주문하고,
// 시야 밖 도시는 마지막 관측값이다. 도시를 누르면 호가창 + 주문표로 쌓는다.
// 도시마다 화폐가 달라 값은 그 도시 화폐로 보인다(환전은 기준 통화 짝, R2 ADR 6절).
import type { MarketCityRow } from "@terra/shared/economy";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { type CatalogIndex, currencyName, fmt, formatAgo, indexCatalog } from "../economyText.ts";
import { Amount, Change, Loaded, NotReady, PreviewTag } from "../parts.tsx";
import { NO_ARGS, useCatalog, useMarketCities } from "../queries.ts";
import "./market.css";

function CityRow({
  row,
  itemId,
  index,
  now,
  preview,
}: {
  row: MarketCityRow;
  itemId: string;
  index: CatalogIndex;
  now: number;
  preview: boolean;
}) {
  return (
    <li>
      <AppLink
        className="panel eco-city"
        to={{ route: "economy_market_city", params: { itemId, cityId: row.city } }}
        data-sight={row.inSight ? "in" : "out"}
      >
        <span className="eco-city-head">
          <span className="eco-city-name" translate="no">
            {row.name}
          </span>
          {row.hasWarehouse ? (
            <span className="eco-tag" data-tone="on">
              {m.economy_has_warehouse()}
            </span>
          ) : null}
          {row.inSight ? null : (
            <span className="eco-tag" data-tone="warning">
              {m.economy_out_of_sight()}
            </span>
          )}
          {preview ? <PreviewTag /> : null}
        </span>
        <span className="eco-city-price">
          {row.last === null ? (
            <span className="eco-num">—</span>
          ) : (
            <Amount value={row.last} className="eco-city-last" />
          )}
          <Change bp={row.changeBp} />
          <span className="eco-row-meta eco-currency-unit">{currencyName(index, row.currency)}</span>
        </span>
        <span className="eco-city-quotes">
          <span>
            <span className="eco-quote-label">{m.economy_col_bid()}</span>
            <span className="eco-num" data-side="buy">
              {row.bestBid === null ? "—" : fmt(row.bestBid)}
            </span>
          </span>
          <span>
            <span className="eco-quote-label">{m.economy_col_ask()}</span>
            <span className="eco-num" data-side="sell">
              {row.bestAsk === null ? "—" : fmt(row.bestAsk)}
            </span>
          </span>
        </span>
        <span className="eco-row-meta eco-city-foot">
          {row.distanceKm === 0 ? m.economy_here() : m.economy_distance({ km: fmt(String(row.distanceKm)) })}
          {row.freightPerUnit === null ? "" : ` · ${m.economy_freight({ amount: fmt(row.freightPerUnit) })}`}
          {" · "}
          {row.inSight ? m.economy_in_sight() : m.economy_observed({ time: formatAgo(row.observedAt, now) })}
        </span>
      </AppLink>
    </li>
  );
}

export default function MarketCitiesView({ itemId }: { itemId: string }) {
  const catalog = useCatalog(NO_ARGS);
  const cities = useMarketCities([itemId]);
  const index = indexCatalog(catalog.data);
  return (
    <div className="eco-stack">
      <Loaded view={cities}>
        {(data) =>
          data.status === "not_ready" ? (
            <NotReady body={m.economy_not_ready_market()} />
          ) : (
            <>
              <p className="eco-hint">{m.economy_cities_hint()}</p>
              <ul className="eco-cities">
                {data.rows.map((row) => (
                  <CityRow
                    key={row.city}
                    row={row}
                    itemId={itemId}
                    index={index}
                    now={data.generatedAt}
                    preview={data.preview}
                  />
                ))}
              </ul>
            </>
          )
        }
      </Loaded>
    </div>
  );
}
