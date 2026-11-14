// 인벤토리 자리 카드 — 옛 창고 화면(/economy/warehouse, 지운 economy/WarehouseView.tsx)에서 옮겼다(docs/adr/2026-11-14-inventory-screen.md).
// 곳마다 보유: 도시 창고(종류·용량, D-121), 장부 보관, 유닛이 실은 화물, 건물 창고. 원장 계정 = (주체, 자산, 위치)라 곳마다 줄이 나뉜다
// (R2 ADR 3절). 식품은 상하기 시작하는 시각을 보인다(실제 시간, D-5030). 시안 창고 줄은 "시험"이 붙고, 거래할 수 있는 물건은 그 도시
// 거래창으로 가는 링크가 있다. 보유 양은 원장 기본 단위다(광석 g). 거래 묶음이 1보다 크면 묶음 크기와 묶음 수(버림)를 덧붙인다(302·D-506).
import { type HoldingLine, type HoldingPlace, marketKindOf } from "@terra/shared/economy";
import type { ReactNode } from "react";
import { toBig } from "../economy/amount.ts";
import {
  type CatalogIndex,
  STORE_NAMES,
  assetName,
  categoryName,
  fmt,
  formatDuration,
  lotOf,
  lotText,
} from "../economy/economyText.ts";
import { Amount, PreviewTag } from "../economy/parts.tsx";
import { SPOIL_SOON_MS } from "../economy/shape.ts";
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";

export function placeTitle(place: HoldingPlace): string {
  if (place.name !== null) return place.name;
  if (place.kind === "ledger") return m.economy_place_ledger();
  if (place.kind === "cargo") return m.economy_place_cargo({ id: place.id.replace(/^cargo_/, "") });
  if (place.kind === "building") return m.economy_place_building({ id: place.id.replace(/^building_/, "") });
  return m.economy_place_unnamed({ id: place.id });
}

/** 호가창으로 사고파는 물건인지(장비·유전자·문서는 아니다, 서버 previewWorld.tradesOnBook과 같은 규칙) */
function tradable(index: CatalogIndex, itemId: string): boolean {
  const item = index.items.get(itemId);
  return item !== undefined && (item.market ?? marketKindOf(item)) === "book";
}

function HoldingRow({
  line,
  place,
  index,
  now,
}: {
  line: HoldingLine;
  place: HoldingPlace;
  index: CatalogIndex;
  now: number;
}) {
  const item = line.item === null ? undefined : index.items.get(line.item);
  const locked = toBig(line.locked);
  const spoilIn = line.spoilsAt === null ? null : line.spoilsAt - now;
  const tradeHere =
    line.item !== null && place.kind === "warehouse" && line.preview === true && tradable(index, line.item);
  return (
    <li className="eco-hold-row">
      <span className="eco-hold-name">
        <span className="eco-hold-title">{assetName(index, line)}</span>
        {item ? (
          <span className="eco-hold-meta">
            {categoryName(item.category)} · {m.economy_tier({ tier: item.tier })}
          </span>
        ) : null}
        {item && lotOf(item) > 1n ? (
          <span className="eco-hold-meta">
            {m.economy_hold_lots({ size: lotText(item), lots: fmt(toBig(line.qty) / lotOf(item)) })}
          </span>
        ) : null}
        {locked > 0n ? <span className="eco-hold-meta">{m.economy_locked({ qty: fmt(locked) })}</span> : null}
        {spoilIn !== null ? (
          <span className="eco-hold-meta" data-tone={spoilIn < SPOIL_SOON_MS ? "warning" : undefined}>
            {spoilIn <= 0 ? m.economy_spoiling_now() : m.economy_spoils_in({ time: formatDuration(spoilIn) })}
          </span>
        ) : null}
      </span>
      <span className="eco-hold-end">
        <Amount value={line.qty} className="eco-hold-qty" />
        {tradeHere && line.item !== null ? (
          <AppLink
            className="eco-inline-link"
            to={{ route: "economy_market_city", params: { itemId: line.item, cityId: place.id } }}
          >
            {m.economy_trade_link()}
          </AppLink>
        ) : null}
      </span>
    </li>
  );
}

export function PlaceCard({
  place,
  index,
  now,
  title,
  children,
}: {
  place: HoldingPlace;
  index: CatalogIndex;
  now: number;
  /** 자리 이름(없으면 서버 이름·자리 종류로) */
  title?: string | undefined;
  /** 카드 아래에 붙일 것(창고 시설 넣기·꺼내기 폼 등) */
  children?: ReactNode;
}) {
  const used = place.capacity ? toBig(place.capacity.used) : 0n;
  const max = place.capacity ? toBig(place.capacity.max) : 0n;
  const ratio = max === 0n ? 0 : Math.min(1, Number((used * 1000n) / max) / 1000);
  const titleId = `eco-place-${place.id}`;
  return (
    <section className="panel eco-place" aria-labelledby={titleId}>
      <div className="eco-place-head">
        <h3 id={titleId} className="eco-place-title">
          {title ?? placeTitle(place)}
        </h3>
        {place.store ? <span className="eco-tag">{STORE_NAMES[place.store]()}</span> : null}
        {place.preview ? <PreviewTag /> : null}
      </div>
      {place.capacity ? (
        <div className="eco-capacity">
          <div
            className="eco-bar"
            role="meter"
            aria-label={m.economy_capacity_label()}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            data-tone={ratio >= 0.9 ? "warning" : undefined}
          >
            <span className="eco-bar-fill" style={{ inlineSize: `${(ratio * 100).toFixed(1)}%` }} />
          </div>
          <span className="eco-capacity-text">{m.economy_capacity({ used: fmt(used), max: fmt(max) })}</span>
        </div>
      ) : null}
      {place.lines.length === 0 ? (
        <p className="eco-empty">{m.inventory_place_empty()}</p>
      ) : (
        <ul className="eco-hold-list">
          {place.lines.map((line) => (
            <HoldingRow key={line.asset} line={line} place={place} index={index} now={now} />
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

/** 지갑(화폐) 판 */
export function WalletPanel({ wallet, index }: { wallet: readonly HoldingLine[]; index: CatalogIndex }) {
  return (
    <section className="panel eco-wallet" aria-labelledby="inventory-wallet-title">
      <h2 id="inventory-wallet-title" className="eco-section-title">
        {m.economy_wallet_title()}
      </h2>
      {wallet.length === 0 ? (
        <p className="eco-empty">{m.economy_wallet_empty()}</p>
      ) : (
        <ul className="eco-hold-list">
          {wallet.map((line) => (
            <li key={line.asset} className="eco-hold-row">
              <span className="eco-hold-name">
                <span className="eco-hold-title">{assetName(index, line)}</span>
                {line.preview ? <PreviewTag /> : null}
              </span>
              <Amount value={line.qty} className="eco-hold-qty" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
