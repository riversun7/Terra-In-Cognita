// [임시] 경제 대리 판단 — docs/adr/2026-10-31-economy-core.md 7절
// 게임 규칙이 아니다. NPC 나라가 생산·유지비·거래소·환전을 실제로 돌려 보게 하는 자리 표시다. R5(NPC 두뇌, D-323 규칙식)가 대신한다.
// 세력마다 거래 판단 예약에서(상태 없는 계산, D-323 틀):
// 1. 내가 건 물자 주문을 모두 거둔다. 2. 남의 도시에 있는 내 물건을 필요한 내 도시로 보낸다.
// 3. 도시마다 목표 재고(생필품 48시간 + 시설 재료 24시간)와 견줘, 남는 도시 → 모자란 도시로 보낸다.
// 4. 남는 것은 그 도시 거래소에 판다: 크게 남으면(목표의 4배 넘게) 지난 값 95%, 아니면 101%(값이 바닥으로만 가지 않게).
// 5. 모자란 것은 남의 도시 거래소 매도 호가를 싼 차례로 산다(값은 환율로 내 화폐로 바꿔 견준다).
//    그 화폐가 모자라면 환전 주문을 낸다(기준 통화를 거쳐서). 자기 화폐를 발행하는 나라는 자기 화폐를 팔지 않는다
//    (시장 조성 quoteFx가 이미 내므로, 같은 회차의 자기 주문끼리 맞물리지 않게).
// 쓰는 돈은 판단 한 번에 국고의 1/4까지다. 발행 나라는 환전 회차마다 자기 화폐 양쪽 값을 낸다(quoteFx, 가진 것의 5%씩).
import type { FxMarket } from "../economy/fxMarket.ts";
import { BASE_EFFICIENCY } from "../economy/production.ts";
import { type Economy, EVENT_TRADE, fxRate, ship } from "./economy.ts";
import type { SimLoop } from "./loop.ts";
import type { SimEvent } from "./stubRules.ts";
import type { SimFaction, SimWorld } from "./world.ts";

/** 생필품 목표 재고(시간) */
const NECESSITY_BUFFER_HOURS = 48;
/** 시설 재료 목표 재고(시간) */
const INPUT_BUFFER_HOURS = 24;
/** 판단 한 번에 쓰는 국고 몫(분모) */
const SPEND_DIVISOR = 4n;
/** 이만큼(목표의 배수) 넘게 남으면 값을 내려 판다 */
const GLUT_MULTIPLE = 4n;
/** 발행 나라 시장 조성 몫(가진 것의 1/분모) */
const QUOTE_DIVISOR = 20n;

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
const pct = (value: bigint, percent: bigint): bigint => {
  const out = (value * percent) / 100n;
  return out > 0n ? out : 1n;
};

/** 도시 하나의 목표 재고 */
function targets(economy: Economy, cityId: number): Map<string, bigint> {
  const need = new Map<string, bigint>();
  const add = (asset: string, qty: bigint): void => {
    need.set(asset, (need.get(asset) ?? 0n) + qty);
  };
  const units = BigInt(economy.cityUnits.get(cityId) ?? 0);
  for (const spec of economy.catalog.necessities)
    add(spec.asset, (units * spec.perUnit * BigInt(NECESSITY_BUFFER_HOURS)) / BigInt(spec.periodHours));
  for (const facility of economy.facilities.values()) {
    if (facility.city !== cityId || facility.workers === 0) continue;
    const batches = BigInt(
      Math.floor((INPUT_BUFFER_HOURS * facility.workers * BASE_EFFICIENCY) / facility.recipe.work),
    );
    for (const input of facility.recipe.inputs) add(input.asset, input.qty * batches);
  }
  return need;
}

/** 거래소 기준값: 마지막 체결가, 없으면 기준 가치 */
function refPrice(economy: Economy, cityId: number, asset: string): bigint {
  return economy.markets.get(cityId)?.get(asset)?.lastPrice ?? economy.catalog.baseValue.get(asset) ?? 1n;
}

/** 화폐 from의 금액을 to로(기준 통화 환율로) */
function convert(economy: Economy, amount: bigint, from: string, to: string): bigint {
  if (from === to) return amount;
  return (amount * fxRate(economy, from)) / fxRate(economy, to);
}

export function onTrade(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  factionId: number,
  nowMs: number,
): void {
  const faction = world.factions.get(factionId);
  if (!faction?.alive) return;
  loop.schedule(nowMs + economy.settings.tradeEveryMs, { kind: EVENT_TRADE, subject: factionId });
  if (faction.cities.size === 0) return;
  const { book } = world;
  const currency = economy.currencyOf.get(factionId) ?? economy.base;
  for (const perItem of economy.markets.values())
    for (const market of perItem.values()) market.cancelOwner(factionId, nowMs);

  const cities = [...faction.cities].toSorted((a, b) => a - b);
  const need = new Map(cities.map((cityId) => [cityId, targets(economy, cityId)]));
  const stock = (cityId: number, asset: string): bigint => book.balanceOf(factionId, asset, cityId);
  const deficit = (cityId: number, asset: string): bigint =>
    (need.get(cityId)?.get(asset) ?? 0n) - stock(cityId, asset);
  const neediest = (asset: string): number => {
    let best = cities[0] ?? 0;
    let most = -1n;
    for (const cityId of cities) {
      const gap = deficit(cityId, asset);
      if (gap > most) {
        most = gap;
        best = cityId;
      }
    }
    return best;
  };

  // 2. 남의 도시에 있는 내 물건을 가장 모자란 내 도시로(먼저 모은 뒤 보낸다: 보내는 중에 계정이 새로 생긴다)
  const abroad: { asset: string; location: number; qty: bigint }[] = [];
  for (const account of book.accounts()) {
    if (account.ownerId !== factionId || account.location === null || account.balance <= 0n) continue;
    if (faction.cities.has(account.location) || !economy.catalog.baseValue.has(account.asset)) continue;
    abroad.push({ asset: account.asset, location: account.location, qty: account.balance });
  }
  for (const held of abroad)
    ship(economy, world, loop, factionId, held.asset, held.location, neediest(held.asset), held.qty, nowMs);

  const budget = { left: book.balanceOf(factionId, currency) / SPEND_DIVISOR };
  for (const asset of economy.catalog.items) {
    // 3. 내 도시끼리 나누기
    let shortfall = 0n;
    for (const cityId of cities) {
      let gap = deficit(cityId, asset);
      if (gap <= 0n) continue;
      for (const source of cities) {
        const spare = -deficit(source, asset);
        if (source === cityId || spare <= 0n) continue;
        const qty = spare < gap ? spare : gap;
        if (ship(economy, world, loop, factionId, asset, source, cityId, qty, nowMs)) gap -= qty;
        if (gap <= 0n) break;
      }
      if (gap > 0n) shortfall += gap;
    }
    // 4. 남는 것 팔기
    for (const cityId of cities) {
      const spare = -deficit(cityId, asset);
      const market = economy.markets.get(cityId)?.get(asset);
      if (spare <= 0n || !market) continue;
      const target = need.get(cityId)?.get(asset) ?? 0n;
      const glut = stock(cityId, asset) > target * GLUT_MULTIPLE;
      const price = pct(refPrice(economy, cityId, asset), glut ? 95n : 101n);
      market.place(factionId, "sell", price, spare, nowMs, nowMs + economy.settings.orderLifeMs);
    }
    // 5. 모자란 것 사기
    if (shortfall > 0n) importGoods(economy, world, faction, currency, asset, shortfall, budget, nowMs);
  }
}

function importGoods(
  economy: Economy,
  world: SimWorld,
  faction: SimFaction,
  currency: string,
  asset: string,
  shortfall: bigint,
  budget: { left: bigint },
  nowMs: number,
): void {
  const { book } = world;
  // 남의 도시 매도 호가를 내 화폐로 바꾼 값이 싼 차례(같으면 도시 ID 차례)
  const offers: { cityId: number; price: bigint; cost: bigint; qty: bigint; currency: string }[] = [];
  for (const [cityId, perItem] of economy.markets) {
    if (faction.cities.has(cityId)) continue;
    const market = perItem.get(asset);
    const ask = market?.best("sell");
    if (!market || !ask || ask.owner === faction.id) continue;
    const cost = convert(economy, ask.price, market.config.currency, currency);
    if (cost > 0n)
      offers.push({ cityId, price: ask.price, cost, qty: ask.remaining, currency: market.config.currency });
  }
  offers.sort((a, b) => (a.cost !== b.cost ? (a.cost < b.cost ? -1 : 1) : a.cityId - b.cityId));
  let left = shortfall;
  for (const offer of offers) {
    if (left <= 0n) return;
    let qty = left < offer.qty ? left : offer.qty;
    const affordable = budget.left / offer.cost;
    if (affordable < qty) qty = affordable;
    if (qty <= 0n) return;
    const pay = offer.price * qty;
    const have = book.balanceOf(faction.id, offer.currency);
    if (have < pay) {
      requestCurrency(economy, world, faction, currency, offer.currency, pay - have, budget, nowMs);
      return;
    }
    const market = economy.markets.get(offer.cityId)?.get(asset);
    const result = market?.place(
      faction.id,
      "buy",
      offer.price,
      qty,
      nowMs,
      nowMs + economy.settings.orderLifeMs,
    );
    if (!result?.ok) return;
    budget.left -= offer.cost * qty;
    left -= qty;
  }
}

/** 화폐 target을 amount만큼 얻으려는 환전 주문(기준 통화를 거친다). 이번 회차에 못 받으면 다음 판단에 다시 본다 */
function requestCurrency(
  economy: Economy,
  world: SimWorld,
  faction: SimFaction,
  own: string,
  target: string,
  amount: bigint,
  budget: { left: bigint },
  nowMs: number,
): void {
  const { book } = world;
  const lot = economy.settings.fxLot;
  if (target !== economy.base) {
    // 기준 통화로 target을 산다(값 = 로트당 기준 통화, 상한 110%)
    const market = economy.fx.get(target);
    if (!market) return;
    const lots = ceilDiv(amount, lot);
    const limit = pct(fxRate(economy, target), 110n);
    if (book.balanceOf(faction.id, economy.base) >= lots * limit) {
      market.place(faction.id, "buy", limit, lots, nowMs);
      return;
    }
    if (own === economy.base) return;
    amount = lots * limit - book.balanceOf(faction.id, economy.base);
  }
  // 기준 통화 나라, 또는 자기 화폐를 발행하는 나라(시장 조성이 이미 판다)는 여기서 팔지 않는다
  if (own === economy.base || economy.issuer.get(own) === faction.id) return;
  // 내 화폐를 팔아 기준 통화를 얻는다(하한 90%)
  const market = economy.fx.get(own);
  if (!market) return;
  const limit = pct(fxRate(economy, own), 90n);
  let lots = ceilDiv(amount, limit);
  const spendable = budget.left / lot;
  if (spendable < lots) lots = spendable;
  if (lots <= 0n) return;
  if (market.place(faction.id, "sell", limit, lots, nowMs).ok) budget.left -= lots * lot;
}

/** 발행 나라의 시장 조성: 자기 화폐를 지난 환율 ±2%로 양쪽에 낸다(가진 것의 5%씩) */
export function quoteFx(economy: Economy, world: SimWorld, nowMs: number) {
  return (market: FxMarket, issuer: SimFaction): void => {
    const rate = fxRate(economy, market.pair.base);
    const ask = pct(rate, 102n);
    const bid = pct(rate, 98n);
    const sellLots = world.book.balanceOf(issuer.id, market.pair.base) / QUOTE_DIVISOR / market.pair.lotSize;
    const buyLots = world.book.balanceOf(issuer.id, market.pair.quote) / QUOTE_DIVISOR / bid;
    if (sellLots > 0n) market.place(issuer.id, "sell", ask, sellLots, nowMs);
    if (buyLots > 0n) market.place(issuer.id, "buy", bid, buyLots, nowMs);
  };
}
