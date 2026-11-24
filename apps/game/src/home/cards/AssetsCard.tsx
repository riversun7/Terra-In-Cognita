// 홈 [경제 요약] 가로 3분할 재무 데스크 — 절제된 기관 금융 스타일(중립 표면 + 상단 2px 포인트 라인):
// 1) 보유 자금(골드 라인): 기준 통화(소속 국가 화폐, 서버가 알려 준다 — 사용자 결정 2026-11-23) 잔고 + 주문 묶임·외환 종수
// 2) 자산·화폐 환산(시안 라인, data-metric="value"): 창고·유닛 물건 추정가 + 타 도시 화폐 환산
// 3) 일일 급여·거래 현황(바이올렛 라인): 일일 급여 합계(BigInt) + 가동 시설·진행 주문 수
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

/**
 * 지갑에서 기준 통화 줄을 고른다. 기준 통화(소속 국가 화폐)를 알면 그 줄만(잔고가 없으면 null — 0으로 보인다), 모르면(옛 서버) 잔고가 가장 큰 화폐
 */
function primaryWalletLine(wallet: readonly HoldingLine[], homeCurrency: string | null): HoldingLine | null {
  if (homeCurrency !== null) return wallet.find((line) => line.currency === homeCurrency) ?? null;
  if (wallet.length === 0) return null;
  let best = wallet[0] ?? null;
  for (const line of wallet) {
    if (best === null || toBig(line.qty) > toBig(best.qty)) best = line;
  }
  return best;
}

/** 다른 나라 화폐(외환) 지갑 잔고를 환율(last ?? indicative)로 기축 통화 환산(BigInt 정수). 기축 통화 자체는 그대로 더한다 */
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
    if (line.currency === exchange?.base) {
      totalBase += qty;
      continue;
    }
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

  // 1) 보유 자금 = 기준 통화(소속 국가 화폐). 옛 서버는 알려 주지 않아 잔고가 가장 큰 화폐
  const homeCode = data.homeCurrency ?? null;
  const mainWallet = primaryWalletLine(data.wallet, homeCode);
  const cashCurrency = mainWallet?.currency ?? homeCode ?? baseCode;
  const cashQty = mainWallet ? toBig(mainWallet.qty) : 0n;
  const cashLocked = mainWallet ? toBig(mainWallet.locked) : 0n;
  const cashUnit = cashCurrency !== null ? currencyName(index, cashCurrency) : "";
  const foreignCurrencies = data.wallet.filter(
    (line) => line.currency !== cashCurrency && toBig(line.qty) + toBig(line.locked) > 0n,
  ).length;

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
    <div className="dash-eco-grid">
      {/* 지표 1: 보유 자금 */}
      <div className="dash-kpi-cell" data-tone="amber">
        <span className="dash-kpi-label">{m.home_eco_cash_label()}</span>
        <div className="dash-kpi-hero" translate="no">
          <span>{fmt(cashQty)}</span>
          {cashUnit === "" ? null : <span className="dash-kpi-unit">{cashUnit}</span>}
        </div>
        <span className="dash-kpi-sub">
          {cashLocked > 0n
            ? m.home_eco_cash_locked({ amount: `${fmt(cashLocked)} ${cashUnit}`.trim() })
            : m.home_eco_cash_base({ count: formatCount(foreignCurrencies) })}
        </span>
      </div>

      {/* 지표 2: 자산·화폐 환산 (e2e/inventory.spec.ts [data-metric="value"] 호환) */}
      <div className="dash-kpi-cell" data-tone="cyan" data-metric="value">
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

      {/* 지표 3: 일일 급여 · 거래 현황 */}
      <div className="dash-kpi-cell" data-tone="violet">
        <span className="dash-kpi-label">{m.home_eco_daily_label()}</span>
        <div className="dash-kpi-hero" translate="no">
          <span>{fmt(wages.total)}</span>
          {wages.currency !== null && wages.total > 0n ? (
            <span className="dash-kpi-unit">{currencyName(index, wages.currency)}</span>
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
