// 추정 가치 가격표·글자 — 인벤토리 [전체] 칸·경제 한눈에 [자산] 카드·홈 [자산] 카드가 같이 쓴다(docs/adr/2026-11-14-inventory-screen.md).
// 가격 [임시]: 시장 마지막 체결가(기준 도시, 묶음당), 없으면 팩 시작 시세(기준 통화, 묶음당).
import type { MarketItemsResponse } from "@terra/shared/economy";
import { toBig } from "../economy/amount.ts";
import { type CatalogIndex, currencyName, fmt } from "../economy/economyText.ts";
import type { ItemPrice, ValueEstimate } from "./inventoryModel.ts";

export function priceLookup(
  index: CatalogIndex,
  market: MarketItemsResponse | null,
  baseCurrency: string | null,
): (item: string) => ItemPrice | null {
  const last = new Map(
    (market?.items ?? []).flatMap((row) =>
      row.last !== null && row.currency !== null
        ? [[row.item, { price: toBig(row.last), currency: row.currency }] as const]
        : [],
    ),
  );
  return (item) => {
    const entry = index.items.get(item);
    const lot = entry?.lotSize ? toBig(entry.lotSize) : 1n;
    const seen = last.get(item);
    if (seen) return { ...seen, lot };
    if (!entry || baseCurrency === null) return null;
    return { price: toBig(entry.startPrice), currency: baseCurrency, lot };
  };
}

/** "1,200 원 · 30 크레딧"(화폐마다), 없으면 null */
export function valueText(value: ValueEstimate, index: CatalogIndex): string | null {
  if (value.byCurrency.size === 0) return null;
  return [...value.byCurrency].map(([code, sum]) => `${fmt(sum)} ${currencyName(index, code)}`).join(" · ");
}
