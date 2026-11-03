// 시뮬레이터 실행에 경제를 붙이는 접착 — docs/adr/2026-10-31-economy-core.md 7절
// run.ts가 시나리오에 economy 칸이 있을 때 부른다: 경제 차리기·예약, 사건 나누기, 하루 끝(중앙은행·지표 줄), 불변 조건, 요약.
import { HOUR_MS } from "../economy/production.ts";
import type { ScheduledEvent } from "../events/eventQueue.ts";
import type { EconomyCatalog } from "./catalog.ts";
import {
  EVENT_CARGO,
  EVENT_FX,
  EVENT_PRODUCE,
  EVENT_TRADE,
  EVENT_UPKEEP,
  type Economy,
  type GatherSettings,
  bankDay,
  beforeCityTransfer,
  cityRuined,
  checkEconomy,
  createEconomy,
  factionBorn,
  fxRate,
  moneySupply,
  onCargo,
  onFx,
  onProduce,
  onUpkeep,
  priceIndexMilli,
  scheduleEconomy,
  setTax,
  transferHoldings,
} from "./economy.ts";
import type { NpcCoefficients } from "../npc/coefficients.ts";
import { onTrade, quoteFx } from "./npcTrade.ts";
import type { SimLoop } from "./loop.ts";
import type { Scenario } from "./scenario.ts";
import type { SimEvent, SimHooks } from "./npcRun.ts";
import type { SimWorld } from "./world.ts";

/** 시스템 계정 앞머리 → 건드려도 되는 거래 종류(물건·돈이 생기고 사라지는 사건을 정해 둔다) */
const SYSTEM_KINDS: Readonly<Record<string, readonly string[]>> = {
  issue: ["issue"],
  sink: ["burn", "produce", "upkeep", "recruit"],
  source: ["produce", "endow"],
  reserve: ["job_output"],
  escrow: ["order_escrow", "order_fill", "order_refund", "fx_escrow", "fx_clear"],
  transit: ["ship", "cargo"],
};

/** 감사의 시스템 계정 규칙. S3 시험 자산(유지비 → sink, 산출 ← reserve)도 같은 표로 본다 */
export function systemRule(code: string, kind: string): boolean {
  return SYSTEM_KINDS[code.slice(0, code.indexOf(":"))]?.includes(kind) ?? false;
}

export interface EconomySummary {
  readonly currencies: number;
  readonly markets: number;
  readonly trades: number;
  readonly volume: Record<string, string>;
  /** 생산한 양 누적(물건 자산 → 기본 단위, 출력 형식 판 8) */
  readonly produced: Record<string, string>;
  readonly shortUnits: Record<string, number>;
  readonly inputShort: number;
  readonly money: Record<string, string>;
  readonly fx: Record<string, string>;
  readonly priceIndexMilli: Record<string, number | null>;
}

export interface EconomyRun {
  readonly economy: Economy;
  readonly hooks: SimHooks;
  /** 경제 사건이면 처리하고 true */
  handle(event: ScheduledEvent<SimEvent>, nowMs: number): boolean;
  /** 하루 끝(정산·기록 전): 중앙은행 */
  endOfDay(nowMs: number): void;
  /** 하루 지표 줄(econ)의 내용. 오늘 센 값을 비운다 */
  dayLine(): Record<string, unknown>;
  check(): string[];
  summary(): EconomySummary;
  /** 시설이 생산했을 때(도시, 레벨 × 오염 값 × 일한 ms). 정원사(gardenerRun.ts)가 붙인다 */
  onWork?: ((cityId: number, weightedWorkMs: number) => void) | undefined;
}

function record<T>(map: ReadonlyMap<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of [...map.keys()].toSorted()) {
    const value = map.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function attachEconomy(
  world: SimWorld,
  scenario: Scenario,
  catalog: EconomyCatalog,
  loop: SimLoop<SimEvent>,
  startMs: number,
  npc: NpcCoefficients,
  gather?: GatherSettings,
): EconomyRun {
  const economy = createEconomy(world, scenario, catalog, startMs, gather);
  scheduleEconomy(economy, world, loop, startMs);
  const totals = {
    trades: 0,
    volume: new Map<string, bigint>(),
    shortUnits: new Map<string, number>(),
    inputShort: 0,
    produced: new Map<string, bigint>(),
  };
  const marketTotals = (): { trades: number; volume: Map<string, bigint> } => {
    let trades = 0;
    const volume = new Map<string, bigint>();
    for (const perItem of economy.markets.values()) {
      for (const [asset, market] of perItem) {
        trades += market.trades;
        volume.set(asset, (volume.get(asset) ?? 0n) + market.volume);
      }
    }
    return { trades, volume };
  };
  let lastTotals = marketTotals();

  const hooks: SimHooks = {
    treasuryAsset: (faction) => economy.currencyOf.get(faction.id) ?? economy.base,
    beforeCityTransfer: (cityId, from, to, nowMs) =>
      beforeCityTransfer(economy, world, cityId, from, to, nowMs),
    factionBorn: (child, parent) => factionBorn(economy, child, parent),
    cityRuined: (cityId, nowMs) => cityRuined(economy, world, loop, cityId, nowMs),
    factionDied: (target, attacker, nowMs) => {
      for (const perItem of economy.markets.values())
        for (const market of perItem.values()) market.cancelOwner(target.id, nowMs);
      transferHoldings(world, target, attacker, () => true, nowMs);
    },
    unitsChanged: (cityId, delta) =>
      economy.cityUnits.set(cityId, Math.max(0, (economy.cityUnits.get(cityId) ?? 0) + delta)),
    cityFounded: (cityId, units, nowMs) => {
      economy.cityUnits.set(cityId, units);
      loop.schedule(nowMs + HOUR_MS, { kind: EVENT_UPKEEP, subject: cityId });
    },
    taxCollectedOf: (cityId) => {
      let sum = 0n;
      for (const market of economy.markets.get(cityId)?.values() ?? []) sum += market.taxCollected;
      return sum;
    },
    interestPaidOf: (factionId) => economy.interestPaid.get(factionId) ?? 0n,
    taxOf: (faction) => economy.taxOf.get(faction.id) ?? 0,
    baseTaxOf: (faction) => economy.baseTax.get(faction.id) ?? 0,
    setTax: (faction, taxBp) => setTax(economy, faction, taxBp),
    foodPmOf: (cityId) => {
      const due = economy.today.dueByCity.get(cityId) ?? 0;
      if (due === 0) return 1000;
      return Math.max(0, 1000 - Math.floor(((economy.today.shortByCity.get(cityId) ?? 0) * 1000) / due));
    },
  };

  /** 화폐마다 값을 매기는 거래소의 마지막 체결가 평균(물건마다) */
  const prices = (): Record<string, Record<string, string>> => {
    const out: Record<string, Record<string, string>> = {};
    for (const asset of economy.catalog.items) {
      const sums = new Map<string, { sum: bigint; n: bigint }>();
      for (const perItem of economy.markets.values()) {
        const market = perItem.get(asset);
        if (!market || market.lastPrice === undefined) continue;
        const entry = sums.get(market.config.currency) ?? { sum: 0n, n: 0n };
        entry.sum += market.lastPrice;
        entry.n += 1n;
        sums.set(market.config.currency, entry);
      }
      if (sums.size === 0) continue;
      const perCurrency = new Map<string, string>();
      for (const [currency, entry] of sums) perCurrency.set(currency, (entry.sum / entry.n).toString());
      out[asset] = record(perCurrency);
    }
    return out;
  };

  const run: EconomyRun = {
    economy,
    hooks,
    onWork: undefined,
    handle(event, nowMs) {
      const { kind, subject } = event.payload;
      if (kind === EVENT_PRODUCE) {
        const work = onProduce(economy, world, loop, subject, nowMs);
        if (work && work.weightedWorkMs > 0) run.onWork?.(work.city, work.weightedWorkMs);
      } else if (kind === EVENT_UPKEEP) onUpkeep(economy, world, loop, subject, nowMs);
      else if (kind === EVENT_TRADE) onTrade(economy, world, loop, subject, nowMs, npc);
      else if (kind === EVENT_FX) onFx(economy, world, loop, nowMs, quoteFx(economy, world, nowMs));
      else if (kind === EVENT_CARGO) onCargo(economy, world, subject, nowMs);
      else return false;
      return true;
    },
    endOfDay(nowMs) {
      bankDay(economy, world, nowMs);
    },
    dayLine() {
      const now = marketTotals();
      const volume = new Map<string, string>();
      for (const [asset, qty] of now.volume) {
        const delta = qty - (lastTotals.volume.get(asset) ?? 0n);
        if (delta > 0n) volume.set(asset, delta.toString());
        totals.volume.set(asset, qty);
      }
      const trades = now.trades - lastTotals.trades;
      totals.trades = now.trades;
      lastTotals = now;
      for (const [asset, n] of economy.today.shortUnits)
        totals.shortUnits.set(asset, (totals.shortUnits.get(asset) ?? 0) + n);
      totals.inputShort += economy.today.inputShort;
      const produced = new Map<string, string>();
      for (const [asset, qty] of economy.today.produced) {
        produced.set(asset, qty.toString());
        totals.produced.set(asset, (totals.produced.get(asset) ?? 0n) + qty);
      }
      const money = new Map<string, string>();
      const fx = new Map<string, string>();
      const issued = new Map<string, string>();
      const burned = new Map<string, string>();
      for (const currency of economy.issuer.keys()) {
        money.set(currency, moneySupply(world.book, currency).toString());
        fx.set(currency, fxRate(economy, currency).toString());
      }
      for (const [currency, amount] of economy.today.issued) issued.set(currency, amount.toString());
      for (const [currency, amount] of economy.today.burned) burned.set(currency, amount.toString());
      const line = {
        trades,
        volume: record(volume),
        produced: record(produced),
        prices: prices(),
        money: record(money),
        issued: record(issued),
        burned: record(burned),
        fx: record(fx),
        shortUnits: record(economy.today.shortUnits),
        inputShort: economy.today.inputShort,
      };
      economy.today.shortUnits.clear();
      economy.today.dueByCity.clear();
      economy.today.shortByCity.clear();
      economy.today.issued.clear();
      economy.today.burned.clear();
      economy.today.inputShort = 0;
      economy.today.produced.clear();
      return line;
    },
    check() {
      return checkEconomy(economy, world);
    },
    summary() {
      const money = new Map<string, string>();
      const fx = new Map<string, string>();
      const index = new Map<string, number | null>();
      for (const currency of economy.issuer.keys()) {
        money.set(currency, moneySupply(world.book, currency).toString());
        fx.set(currency, fxRate(economy, currency).toString());
        index.set(currency, priceIndexMilli(economy, currency) ?? null);
      }
      const volume = new Map<string, string>();
      for (const [asset, qty] of totals.volume) volume.set(asset, qty.toString());
      const produced = new Map<string, string>();
      for (const [asset, qty] of totals.produced) produced.set(asset, qty.toString());
      let markets = 0;
      for (const perItem of economy.markets.values()) markets += perItem.size;
      return {
        currencies: economy.issuer.size,
        markets,
        trades: totals.trades,
        volume: record(volume),
        produced: record(produced),
        shortUnits: record(totals.shortUnits),
        inputShort: totals.inputShort,
        money: record(money),
        fx: record(fx),
        priceIndexMilli: record(index),
      };
    },
  };
  return run;
}
