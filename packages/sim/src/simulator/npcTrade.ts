// NPC 거래 실행 — docs/adr/2026-10-31-economy-core.md 7절, docs/adr/2026-11-01-npc-brain-r5.md 4절 (옛 economyStub.ts)
// 정책 값(매도 이익률·국고 쓰는 몫)은 NPC 규칙식 npc/policy.ts tradePolicy(성향·생필품 부족)이다(D-323 "운임 = 원가 + 성향별 이익률").
// 세력마다 거래 판단 예약에서(상태 없는 계산, D-323 틀):
// 1. 내가 건 물자 주문을 모두 거둔다. 2. 남의 도시에 있는 내 물건을 필요한 내 도시로 보낸다.
// 3. 도시마다 목표 재고(생필품 48시간 + 시설 재료 24시간)와 견줘, 남는 도시 → 모자란 도시로 보낸다.
// 4. 남는 것은 그 도시 거래소에 판다: 크게 남으면(목표의 4배 넘게) 지난 값 95%, 아니면 101% + 상업 성향 이익률.
// 5. 모자란 것은 남의 도시 거래소 매도 호가를 싼 차례로 산다(값은 환율로 내 화폐로 바꿔 견준다).
//    그 화폐가 모자라면 환전 주문을 낸다(기준 통화를 거쳐서). 자기 화폐를 발행하는 나라는 자기 화폐를 팔지 않는다
//    (시장 조성 quoteFx가 이미 내므로, 같은 회차의 자기 주문끼리 맞물리지 않게).
// 6. 자기 도시마다 모자란 것은 그 도시 거래소에 지난 값의 90%로 상시 매수 주문을 건다(도시 매입 호가 placeCityBids, 기획 답 530 가 —
//    서버 WP4에서 옮겨 시뮬·서버가 같은 규칙. 유저가 NPC 도시에 모자란 물건을 팔 곳이 된다). 같은 판단의 5에서 수입 주문으로 산 양(바로
//    체결된 것 + 걸어 둔 것)은 모자란 양에서 뺀다(기획 답 555 나 — 두 번 사지 않게, 도시 ID 차례로 나눠 뺀다).
// 쓰는 돈은 판단 한 번에 국고의 1/4까지다(생필품이 모자라면 1/2). 발행 나라는 환전 회차마다 자기 화폐 양쪽 값을 낸다(quoteFx, 가진 것의 5%씩).
// 묶음(302·D-506): 목표 재고·남는 양·운송은 기본 단위(광석 g), 거래소 주문은 묶음 단위다. 팔 때는 남는 양 ÷ 묶음(버림, 묶음 하나가
// 안 되면 팔지 않음), 살 때는 모자란 양 ÷ 묶음(올림).
import type { FxMarket } from "../economy/fxMarket.ts";
import { BASE_EFFICIENCY } from "../economy/production.ts";
import type { NpcCoefficients } from "../npc/coefficients.ts";
import { type TradePolicy, tradePolicy } from "../npc/policy.ts";
import { lotSizeOf } from "./catalog.ts";
import { type Economy, EVENT_TRADE, fxRate, ship } from "./economy.ts";
import type { SimLoop } from "./loop.ts";
import type { SimEvent } from "./npcRun.ts";
import type { SimFaction, SimWorld } from "./world.ts";

/** 생필품 목표 재고(시간) */
const NECESSITY_BUFFER_HOURS = 48;
/** 시설 재료 목표 재고(시간) */
const INPUT_BUFFER_HOURS = 24;
/** 이만큼(목표의 배수) 넘게 남으면 값을 내려 판다 */
const GLUT_MULTIPLE = 4n;
/** 발행 나라 시장 조성 몫(가진 것의 1/분모) */
const QUOTE_DIVISOR = 20n;

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
const pct = (value: bigint, percent: bigint): bigint => {
  const out = (value * percent) / 100n;
  return out > 0n ? out : 1n;
};

/** 도시 하나의 목표 재고(서버 도시 매입 호가도 같은 값을 쓴다) */
export function cityTargets(economy: Economy, cityId: number): Map<string, bigint> {
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
      Math.floor(
        (INPUT_BUFFER_HOURS * facility.workers * BASE_EFFICIENCY * facility.progress) / facility.recipe.work,
      ),
    );
    for (const input of facility.recipe.inputs) add(input.asset, input.qty * batches);
  }
  // NPC 증축 재료(질문 1101 나, npcBuild.ts) — 거래 판단이 이 도시로 모은다
  for (const [asset, qty] of economy.buildWants?.get(cityId) ?? []) add(asset, qty);
  return need;
}

/** 거래소 기준값: 시장 시세(마지막 체결가). 체결이 아직 없으면 시작 시세(그 시장의 첫 가격, 295) */
export function marketRefPrice(economy: Economy, cityId: number, asset: string): bigint {
  return economy.markets.get(cityId)?.get(asset)?.lastPrice ?? economy.catalog.startPrice.get(asset) ?? 1n;
}

/** 화폐 from의 금액을 to로(기준 통화 환율로) */
function convert(economy: Economy, amount: bigint, from: string, to: string): bigint {
  if (from === to) return amount;
  return (amount * fxRate(economy, from)) / fxRate(economy, to);
}

/** 세력 거래 판단 한 번. 건 도시 매입 호가 수를 돌려준다(지표) */
export function onTrade(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  factionId: number,
  nowMs: number,
  npc: NpcCoefficients,
): number {
  const faction = world.factions.get(factionId);
  if (!faction?.alive) return 0;
  loop.schedule(nowMs + economy.settings.tradeEveryMs, { kind: EVENT_TRADE, subject: factionId });
  if (faction.cities.size === 0) return 0;
  const { book } = world;
  const currency = economy.currencyOf.get(factionId) ?? economy.base;
  for (const perItem of economy.markets.values())
    for (const market of perItem.values()) market.cancelOwner(factionId, nowMs);

  const cities = [...faction.cities].toSorted((a, b) => a - b);
  const need = new Map(cities.map((cityId) => [cityId, cityTargets(economy, cityId)]));
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
    if (faction.cities.has(account.location) || !economy.catalog.startPrice.has(account.asset)) continue;
    abroad.push({ asset: account.asset, location: account.location, qty: account.balance });
  }
  for (const held of abroad)
    ship(economy, world, loop, factionId, held.asset, held.location, neediest(held.asset), held.qty, nowMs);

  // 정책: 오늘 생필품을 못 낸 도시가 있으면 국고를 더 쓴다
  const foodShort = cities.some((cityId) => (economy.today.shortByCity.get(cityId) ?? 0) > 0);
  const policy = tradePolicy(faction.traits, foodShort, npc);
  const budget = { left: book.balanceOf(factionId, currency) / policy.spendDivisor };
  /** 이번 판단에서 수입 주문으로 산 양(기본 단위, 자산 → 양 — 555 나) */
  const imported = new Map<string, bigint>();
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
      const lots = spare / lotSizeOf(economy.catalog, asset);
      if (lots <= 0n || !market) continue;
      const target = need.get(cityId)?.get(asset) ?? 0n;
      const glut = stock(cityId, asset) > target * GLUT_MULTIPLE;
      const price = pct(marketRefPrice(economy, cityId, asset), glut ? policy.glutPct : policy.sellPct);
      market.place(factionId, "sell", price, lots, nowMs, nowMs + economy.settings.orderLifeMs);
    }
    // 5. 모자란 것 사기
    if (shortfall > 0n) {
      const lots = importGoods(economy, world, faction, currency, asset, shortfall, budget, nowMs);
      if (lots > 0n) imported.set(asset, lots * lotSizeOf(economy.catalog, asset));
    }
  }
  // 6. 자기 도시 매입 호가(수입한 양은 뺀다)
  return placeCityBids(economy, world, faction, policy, nowMs, imported);
}

/**
 * 도시 매입 호가(기획 답 530 가, D-518 — 서버 WP4 규칙을 옮김): 자기 도시마다 목표 재고(cityTargets)보다 모자란 물건(목표 − 그 도시 재고 −
 * 그 도시로 오는 중인 내 화물 − 같은 판단에서 수입한 양)을 지난 값(marketRefPrice)의 bidPct%로, 모자란 양만큼(묶음 올림) 그 도시 거래소에
 * 매수 주문한다. 수입한 양(imported, 자산 → 기본 단위 양, 555 나)은 도시 ID 차례로 모자란 양을 채운 만큼 덜어 간다(남의 도시에서 산 물건은
 * 다음 판단의 2가 가장 모자란 내 도시로 보낸다). 국고 ÷ 지출 분모(판단 끝 잔고 기준) 안에서 도시 ID 차례·목표 차례로 건다. 다음 판단의 주문
 * 거두기(1)가 함께 거둔다. 건 주문 수를 돌려준다
 */
export function placeCityBids(
  economy: Economy,
  world: SimWorld,
  faction: SimFaction,
  policy: TradePolicy,
  nowMs: number,
  imported: ReadonlyMap<string, bigint> = new Map(),
): number {
  const { book } = world;
  const currency = economy.currencyOf.get(faction.id) ?? economy.base;
  // 오는 중인 내 화물(도시|자산 → 양): 남의 도시에서 보낸 것·내 도시끼리 나눈 것
  const incoming = new Map<string, bigint>();
  for (const cargo of economy.cargo.values()) {
    if (cargo.owner !== faction.id) continue;
    const key = `${cargo.to}|${cargo.asset}`;
    incoming.set(key, (incoming.get(key) ?? 0n) + cargo.qty);
  }
  const importLeft = new Map(imported);
  let budget = book.balanceOf(faction.id, currency) / policy.spendDivisor;
  let placed = 0;
  for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
    const perItem = economy.markets.get(cityId);
    if (!perItem) continue;
    for (const [asset, target] of cityTargets(economy, cityId)) {
      let gap =
        target - book.balanceOf(faction.id, asset, cityId) - (incoming.get(`${cityId}|${asset}`) ?? 0n);
      if (gap <= 0n) continue;
      const bought = importLeft.get(asset) ?? 0n;
      if (bought > 0n) {
        const used = bought < gap ? bought : gap;
        importLeft.set(asset, bought - used);
        gap -= used;
        if (gap <= 0n) continue;
      }
      const market = perItem.get(asset);
      if (!market) continue;
      const price = pct(marketRefPrice(economy, cityId, asset), policy.bidPct);
      let lots = ceilDiv(gap, lotSizeOf(economy.catalog, asset));
      if (price * lots > budget) lots = budget / price;
      if (lots <= 0n) continue;
      const result = market.place(
        faction.id,
        "buy",
        price,
        lots,
        nowMs,
        nowMs + economy.settings.orderLifeMs,
      );
      if (!result.ok) continue;
      budget -= price * lots;
      placed += 1;
    }
  }
  return placed;
}

/** 모자란 것을 남의 도시 매도 호가에서 산다(5). 산 묶음 수(바로 체결 + 걸어 둔 양)를 돌려준다 */
function importGoods(
  economy: Economy,
  world: SimWorld,
  faction: SimFaction,
  currency: string,
  asset: string,
  /** 모자란 양(기본 단위) */
  shortfall: bigint,
  budget: { left: bigint },
  nowMs: number,
): bigint {
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
  // 모자란 양(기본 단위) → 묶음(올림)
  const want = ceilDiv(shortfall, lotSizeOf(economy.catalog, asset));
  let left = want;
  for (const offer of offers) {
    if (left <= 0n) break;
    let qty = left < offer.qty ? left : offer.qty;
    const affordable = budget.left / offer.cost;
    if (affordable < qty) qty = affordable;
    if (qty <= 0n) break;
    const pay = offer.price * qty;
    const have = book.balanceOf(faction.id, offer.currency);
    if (have < pay) {
      requestCurrency(economy, world, faction, currency, offer.currency, pay - have, budget, nowMs);
      break;
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
    if (!result?.ok) break;
    budget.left -= offer.cost * qty;
    left -= qty;
  }
  // 산 묶음 수(바로 체결된 것 + 걸어 둔 것)
  return want - left;
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
