// 홈 [시장 시세] 프로 티커 카드 — 참조 대시보드 오른쪽 카드 구성:
// economy.marketItems + economy.catalog 실시간 자료로 주요 거래 품목 6종의
// 아이콘·이름·티어·미니 스파크라인·체결가(없으면 시작 기준가)·24시간 등락률을 표시한다.
import { type DecimalString, marketKindOf } from "@terra/shared/economy";
import { useId } from "react";
import { formatBp, toBig, trendOf } from "../../economy/amount.ts";
import { currencyName, fmt, indexCatalog, itemName } from "../../economy/economyText.ts";
import { NO_ARGS, useCatalog, useMarketItems } from "../../economy/queries.ts";
import { m } from "../../paraglide/messages.js";
import { HomeLink } from "../shellParts.tsx";
import { HomeLoading } from "../InboxBody.tsx";
import { ExternalArrowIcon, MarketIcon, ParcelIcon } from "./icons.tsx";

const MAX_TICKER_ROWS = 6;

interface TickerRow {
  readonly id: string;
  readonly name: string;
  readonly tier: number;
  readonly price: DecimalString;
  readonly currencyUnit: string;
  readonly changeBp: number | null;
  readonly live: boolean;
  readonly spark: readonly DecimalString[];
}

/** 초소형 SVG 스파크라인(체결 이력 2개 이상일 때만 표시) */
function MiniSpark({ points, trend }: { points: readonly DecimalString[]; trend: "up" | "down" | "flat" }) {
  if (points.length < 2) return null;
  const nums = points.map((p) => Number(toBig(p)));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const w = 44;
  const h = 16;
  const coords = nums
    .map((v, i) => {
      const x = (i / (nums.length - 1)) * w;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="dash-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" data-trend={trend}>
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MarketTickerCard() {
  const titleId = useId();
  const catalog = useCatalog(NO_ARGS);
  const market = useMarketItems(NO_ARGS);

  const index = indexCatalog(catalog.data);
  const baseCode = catalog.data?.baseCurrency ?? null;
  const baseUnit = baseCode !== null ? currencyName(index, baseCode) : "";

  const rows: TickerRow[] = [];
  const seen = new Set<string>();

  // 1) 실제 거래 체결가가 있는 종목을 등락폭·거래량 순으로 우선 배치
  const liveSorted = (market.data?.items ?? [])
    .filter((entry) => entry.last !== null)
    .toSorted((a, b) => {
      const diffBp = Math.abs(b.changeBp ?? 0) - Math.abs(a.changeBp ?? 0);
      if (diffBp !== 0) return diffBp;
      const volA = toBig(a.volume);
      const volB = toBig(b.volume);
      return volB > volA ? 1 : volB < volA ? -1 : 0;
    });

  for (const entry of liveSorted) {
    if (rows.length >= MAX_TICKER_ROWS) break;
    if (entry.last === null) continue;
    seen.add(entry.item);
    const meta = index.items.get(entry.item);
    rows.push({
      id: entry.item,
      name: itemName(index, entry.item),
      tier: meta?.tier ?? 0,
      price: entry.last,
      currencyUnit: entry.currency !== null ? currencyName(index, entry.currency) : baseUnit,
      changeBp: entry.changeBp,
      live: true,
      spark: entry.spark,
    });
  }

  // 2) 체결 이력이 적은 초기 월드면 거래 가능 카탈로그 주요 품목의 기준가로 빈 줄을 채운다
  if (rows.length < MAX_TICKER_ROWS && catalog.data !== null) {
    const fallback = catalog.data.items
      .filter((item) => !seen.has(item.id) && marketKindOf(item) !== "none" && toBig(item.startPrice) > 0n)
      .toSorted((a, b) => {
        const pA = toBig(a.startPrice);
        const pB = toBig(b.startPrice);
        return pB > pA ? 1 : pB < pA ? -1 : a.tier - b.tier;
      });
    for (const item of fallback) {
      if (rows.length >= MAX_TICKER_ROWS) break;
      rows.push({
        id: item.id,
        name: itemName(index, item.id),
        tier: item.tier,
        price: item.startPrice,
        currencyUnit: baseUnit,
        changeBp: null,
        live: false,
        spark: [],
      });
    }
  }

  const loading = market.status === "loading" && catalog.status === "loading" && rows.length === 0;

  return (
    <section className="home-card dash-market-card" data-card="market" aria-labelledby={titleId}>
      <div className="home-card-head">
        <h2 id={titleId} className="home-card-title">
          <span className="home-card-heading">
            <span className="home-card-icon" data-card-icon="market">
              <MarketIcon />
            </span>
            <span className="home-card-name">{m.home_market_title()}</span>
          </span>
        </h2>
        <HomeLink to={{ route: "economy_market" }} className="home-card-action">
          <span>{m.home_market_open()}</span>
          <ExternalArrowIcon />
        </HomeLink>
      </div>
      <div className="home-card-body">
        {loading ? (
          <HomeLoading />
        ) : rows.length === 0 ? (
          <p className="home-card-hint">{m.home_market_empty()}</p>
        ) : (
          <ul className="dash-ticker-list">
            {rows.map((row) => {
              const trend = trendOf(row.changeBp);
              const arrow = trend === "up" ? "↗" : trend === "down" ? "↘" : "—";
              return (
                <li key={row.id} className="dash-ticker-item">
                  <HomeLink
                    to={{ route: "economy_market_item", params: { itemId: row.id } }}
                    className="dash-ticker-link"
                  >
                    <span className="dash-ticker-icon" aria-hidden="true">
                      <ParcelIcon />
                    </span>
                    <span className="dash-ticker-meta">
                      <span className="dash-ticker-name">{row.name}</span>
                      <span className="dash-ticker-tier" translate="no">
                        T{row.tier}
                      </span>
                    </span>
                    <MiniSpark points={row.spark} trend={trend} />
                    <span className="dash-ticker-quote">
                      <span className="dash-ticker-price" translate="no">
                        {fmt(row.price)}
                        {row.currencyUnit === "" ? null : (
                          <span className="dash-ticker-unit"> {row.currencyUnit}</span>
                        )}
                      </span>
                      <span
                        className="dash-ticker-delta"
                        data-trend={row.live ? trend : "base"}
                        translate="no"
                      >
                        {row.live && row.changeBp !== null
                          ? `${arrow} ${formatBp(row.changeBp)}`
                          : m.home_market_base_price()}
                      </span>
                    </span>
                  </HomeLink>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
