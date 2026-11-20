// 홈 [자산 · 경제 요약] 프로 카드 — 참조 대시보드 중앙 카드 구성:
// 1) 보유 자금(앰버 틴트 블록): 기준 통화·주요 지갑 잔고 + 주문 묶임·화폐 종수
// 2) 자산·화폐 환산(코발트 틴트 블록, data-metric="value"): 창고·유닛 물건 추정가 + 타 도시 화폐 환산
// 3) 일일 급여·거래 현황(바이올렛 틴트 블록): 일일 급여 합계(BigInt) + 가동 시설·진행 주문 수
// 금액 계산은 BigInt 정수만 쓴다(AGENTS 4장).
import type { EconomyExchangeResponse, HoldingLine, WageLine } from "@terra/shared/economy";
import { toBig } from "../../economy/amount.ts";
import { currencyName, fmt, indexCatalog } from "../../economy/economyText.ts";
import {
  NO_ARGS,
  useCatalog,
  useExchange,
  useHoldings,
  useMarketItems,
  useOrders,
  useProduction,
} from "../../economy/queries.ts";
import { holdingsSummary } from "../../economy/shape.ts";
import { estimateValue, totalLines } from "../../inventory/inventoryModel.ts";
import { priceLookup, valueParts } from "../../inventory/inventoryValue.ts";
import { m } from "../../paraglide/messages.js";
import { HomeLoading } from "../InboxBody.tsx";
import { formatCount } from "../numbers.ts";

/** 지갑에서 기준 통화(없으면 잔고가 가장 큰 화폐)를 고른다 */
function primaryWalletLine(wallet: readonly HoldingLine[], baseCurrency: string | null): HoldingLine | null {
  if (wallet.length === 0) return null;
  if (baseCurrency !== null) {
    const exact = wallet.find((line) => line.currency === baseCurrency);
    if (exact !== undefined) return exact;
  }
  let best = wallet[0] ?? null;
  for (const line of wallet) {
    if (best === null || toBig(line.qty) > toBig(best.qty)) best = line;
  }
  return best;
}

/** 타 도시 화폐 지갑 잔고를 환율(last ?? indicative)로 기준 통화 환산(BigInt 정수) */
function convertedOtherCurrencies(
  wallet: readonly HoldingLine[],
  exchange: EconomyExchangeResponse | null,
  primaryCurrency: string | null,
): { readonly totalBase: bigint; readonly count: number } {
  let count = 0;
  let totalBase = 0n;
  const pairMap = new Map((exchange?.pairs ?? []).map((pair) => [pair.currency, pair]));
  for (const line of wallet) {
    if (line.currency === null || line.currency === primaryCurrency) continue;
    const qty = toBig(line.qty) + toBig(line.locked);
    if (qty <= 0n) continue;
    count += 1;
    const pair = pairMap.get(line.currency);
    const rateStr = pair?.last ?? pair?.indicative ?? null;
    if (pair !== undefined && rateStr !== null) {
      const lot = toBig(pair.lotSize);
      if (lot > 0n) totalBase += (qty * toBig(rateStr)) / lot;
    }
  }
  return { totalBase, count };
}

/** 급여 줄 목록의 일일 총급여 합(BigInt) */
function dailyWagesTotal(wages: readonly WageLine[]): {
  readonly total: bigint;
  readonly currency: string | null;
} {
  let total = 0n;
  let currency: string | null = null;
  for (const row of wages) {
    if (currency === null) currency = row.currency;
    const base = toBig(row.baseWage);
    const rateBp = BigInt(Math.max(0, 10_000 + row.adjustBp));
    const unitWage = (base * rateBp) / 10_000n;
    total += unitWage * BigInt(Math.max(0, row.workers));
  }
  return { total, currency };
}

export function AssetsCardBody() {
  const catalog = useCatalog(NO_ARGS);
  const holdings = useHoldings(NO_ARGS);
  const market = useMarketItems(NO_ARGS);
  const exchange = useExchange(NO_ARGS);
  const production = useProduction(NO_ARGS);
  const orders = useOrders(NO_ARGS);

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
  const baseCode = exchange.data?.base ?? catalog.data?.baseCurrency ?? null;
  const summary = holdingsSummary(data);

  // 1) 보유 자금(기준 통화 또는 최다 보유 화폐)
  const mainWallet = primaryWalletLine(data.wallet, baseCode);
  const cashCurrency = mainWallet?.currency ?? baseCode;
  const cashQty = mainWallet ? toBig(mainWallet.qty) : 0n;
  const cashLocked = mainWallet ? toBig(mainWallet.locked) : 0n;
  const cashUnit = cashCurrency !== null ? currencyName(index, cashCurrency) : "";
  const activeCurrencies = data.wallet.filter((line) => toBig(line.qty) + toBig(line.locked) > 0n).length;

  // 2) 창고·유닛 추정 가치 + 타 도시 화폐 환산
  const inventoryVal = estimateValue(
    totalLines(data.places),
    priceLookup(index, market.data, catalog.data?.baseCurrency ?? null),
  );
  const fxOther = convertedOtherCurrencies(data.wallet, exchange.data, cashCurrency);
  const combinedByCurrency = new Map(inventoryVal.byCurrency);
  if (fxOther.totalBase > 0n && baseCode !== null) {
    combinedByCurrency.set(baseCode, (combinedByCurrency.get(baseCode) ?? 0n) + fxOther.totalBase);
  }
  const combinedParts = valueParts(
    {
      byCurrency: combinedByCurrency,
      priced: inventoryVal.priced + fxOther.count,
      unpriced: inventoryVal.unpriced,
    },
    index,
  );

  // 3) 일일 급여 · 가동 시설 · 진행 주문
  const wages = dailyWagesTotal(production.data?.wages ?? []);
  const runningFacilities = (production.data?.facilities ?? []).filter((f) => f.status === "running").length;
  const openOrders = orders.data?.open.length ?? 0;

  return (
    <div className="dash-eco-stack">
      {/* 블록 1: 보유 자금 (앰버 골드 틴트) */}
      <div className="dash-kpi-block" data-tone="amber">
        <span className="dash-kpi-label">
          {m.home_eco_cash_label()}
          {cashUnit === "" ? null : ` (${cashUnit})`}
        </span>
        <div className="dash-kpi-hero" translate="no">
          {fmt(cashQty)}
        </div>
        <span className="dash-kpi-sub">
          {cashLocked > 0n
            ? m.home_eco_cash_locked({ amount: `${fmt(cashLocked)} ${cashUnit}`.trim() })
            : m.home_eco_cash_currencies({ count: formatCount(activeCurrencies) })}
        </span>
      </div>

      {/* 블록 2: 자산·화폐 환산 (코발트 블루 틴트, e2e/inventory.spec.ts [data-metric="value"] 호환) */}
      <div className="dash-kpi-block" data-tone="cobalt" data-metric="value">
        <span className="dash-kpi-label">{m.home_eco_converted_label()}</span>
        <div className="dash-kpi-hero" translate="no">
          {combinedParts === null ? (
            m.inventory_value_none()
          ) : (
            <span className="dash-kpi-money">
              <span className="dash-approx" aria-hidden="true">
                ≈
              </span>
              {combinedParts.map((part, idx) => (
                <span key={part.key} className="dash-kpi-part">
                  {idx > 0 ? <span className="dash-kpi-sep">·</span> : null}
                  <span>{part.amount}</span>
                  <span className="dash-kpi-unit">{part.unit}</span>
                </span>
              ))}
            </span>
          )}
        </div>
        <span className="dash-kpi-sub">
          {m.economy_overview_warehouse({ places: summary.places, kinds: summary.kinds })}
        </span>
      </div>

      {/* 블록 3: 일일 급여 · 거래 현황 (바이올렛 틴트) */}
      <div className="dash-kpi-block" data-tone="violet">
        <span className="dash-kpi-label">{m.home_eco_daily_label()}</span>
        <div className="dash-kpi-hero" translate="no">
          {fmt(wages.total)}
          {wages.currency !== null && wages.total > 0n ? (
            <span className="dash-kpi-unit"> {currencyName(index, wages.currency)}</span>
          ) : null}
        </div>
        <span className="dash-kpi-sub">
          {m.home_eco_ops_meta({
            facilities: formatCount(runningFacilities),
            orders: formatCount(openOrders),
          })}
        </span>
      </div>
    </div>
  );
}
