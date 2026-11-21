// 증권 거래소 건물 칸 — 기획 D-583(질문 2438 답 "증권거래소 건물의 주기능 해당 도시나 국가의 정부 지분이나 사업장 지분 거래 가능"), D-561(거래소는 건물),
// docs/adr/2026-11-21-share-market.md. 2차맵 건물 판(BuildingPanel.tsx) 개요 칸이 증권 거래소 건물에서 띄운다.
// - 목록: 그 건물이 선 도시의 나라 — 그 나라 도시들의 정부 지분 시장(지난 값·살·팔 합)과 사업장 지분 시장(그 도시 사업장 전부 + 다른 도시의 발행·거래 중인 것).
// - 줄을 누르면 같은 판 안에서 그 시장을 연다: 정부 지분 = CityShareMarket.tsx, 사업장 지분 = 건물 판 [지분] 칸과 같은 ShareMarket.tsx(장부 읽기).
import type { ShareHubResponse } from "@terra/shared/cityShares";
import { useCallback, useEffect, useState } from "react";
import { formatAmount } from "../economy/amount.ts";
import { useBooks } from "../map/business/booksData.ts";
import { ShareMarket } from "../map/business/ShareMarket.tsx";
import { localName, moneyName } from "../map/business/businessText.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { CityShareMarket } from "./CityShareMarket.tsx";
import { RoundClock } from "./OrderBook.tsx";
import { loadShareHub } from "./shareCommands.ts";
import "../map/building/building.css";
import "./shares.css";

type Open =
  | { readonly kind: "city"; readonly id: number }
  | { readonly kind: "business"; readonly id: number }
  | null;

/** 사업장 지분 시장(건물 판 [지분] 칸과 같은 칸) */
function BusinessShares({ buildingId }: { readonly buildingId: number }) {
  const { books, failed, reload } = useBooks(buildingId, 7, true);
  const ok = books?.status === "ok" ? books : null;
  if (!ok) return <p className="bp-muted">{failed ? m.books_load_failed() : m.books_loading()}</p>;
  return <ShareMarket buildingId={buildingId} holders={ok.holders} market={ok.market} reload={reload} />;
}

export function ShareHub({ buildingId }: { readonly buildingId: number }) {
  const locale = getLocale();
  const [hub, setHub] = useState<ShareHubResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadShareHub(buildingId, controller.signal)
      .then((response) => {
        setHub(response);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [buildingId]);
  const reload = useCallback(() => {
    loadShareHub(buildingId)
      .then((response) => setHub(response))
      .catch(() => setFailed(true));
  }, [buildingId]);

  if (!hub) return <p className="bp-muted">{failed ? m.city_shares_failed() : m.city_shares_loading()}</p>;
  if (hub.status !== "ok")
    return hub.status === "not_exchange" ? null : (
      <p className="bp-muted">
        {hub.status === "stopped" ? m.share_hub_stopped() : m.city_shares_not_ready()}
      </p>
    );
  const price = (value: string | null): string =>
    value === null ? m.shares_no_trade() : formatAmount(value, locale);
  if (open)
    return (
      <div className="sm" data-part="share-hub" data-open={open.kind}>
        <button
          type="button"
          className="button-small"
          data-part="share-hub-back"
          onClick={() => setOpen(null)}
        >
          {m.share_hub_back()}
        </button>
        {open.kind === "city" ? (
          <CityShareMarket cityId={open.id} />
        ) : (
          <BusinessShares buildingId={open.id} />
        )}
      </div>
    );
  const nation = localName(hub.nationName);
  return (
    <div className="sm" data-part="share-hub">
      <section className="bp-card" aria-label={m.share_hub_title()}>
        <div className="sm-book-head">
          <h3 className="bp-card-title">{m.share_hub_title()}</h3>
          <RoundClock nextRoundMs={hub.nextRoundMs} onDue={reload} />
        </div>
        <p className="bp-muted">{nation ? m.share_hub_lead({ nation }) : m.share_hub_lead_plain()}</p>
      </section>
      <section className="bp-card" aria-label={m.share_hub_cities()}>
        <h3 className="bp-card-title">{m.share_hub_cities()}</h3>
        <ul className="sm-hub-list" data-part="share-hub-cities">
          {hub.cities.map((city) => (
            <li key={city.cityId}>
              <button
                type="button"
                className="sm-hub-item"
                data-city={city.cityId}
                onClick={() => setOpen({ kind: "city", id: city.cityId })}
              >
                <span className="sm-hub-name">
                  {localName(city.name) ?? String(city.cityId)} ·{" "}
                  {m.shares_count({ count: formatAmount(city.total, locale) })}
                </span>
                <span className="sm-hub-line">
                  {m.share_hub_row({
                    price: `${price(city.lastPrice)} ${moneyName(city.asset)}`,
                    bid: formatAmount(city.bidShares, locale),
                    ask: formatAmount(city.askShares, locale),
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="bp-card" aria-label={m.share_hub_businesses()}>
        <h3 className="bp-card-title">{m.share_hub_businesses()}</h3>
        {hub.businesses.length === 0 ? (
          <p className="bp-muted">{m.share_hub_none()}</p>
        ) : (
          <ul className="sm-hub-list" data-part="share-hub-businesses">
            {hub.businesses.map((row) => (
              <li key={row.buildingId}>
                <button
                  type="button"
                  className="sm-hub-item"
                  data-building={row.buildingId}
                  onClick={() => setOpen({ kind: "business", id: row.buildingId })}
                >
                  <span className="sm-hub-name">
                    {localName(row.name) ?? row.facilityId}
                    {row.issued ? null : <span className="sm-holder-kind"> · {m.share_hub_unissued()}</span>}
                  </span>
                  <span className="sm-hub-line">
                    {m.share_hub_row({
                      price: price(row.lastPrice),
                      bid: formatAmount(row.bidShares, locale),
                      ask: formatAmount(row.askShares, locale),
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
