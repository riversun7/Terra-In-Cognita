// NPC의 도시 지분 주문 — 기획 D-587(질문 2471 다 "NPC도 플레이어와 같은 동시호가 시장으로 사고판다", D-323 점수 고르기 + 성향 규칙식),
// docs/adr/2026-11-21-share-market-2.md.
// - 팔기: NPC 판단의 "지분 팔기"(@terra/sim society.sellShares — 점수 shareSaleScore + 상업 성향)가 직접 양도 대신 시장 팔 주문을 낸다(시뮬 고리
//   marketShareSale — npc/governanceHooks.ts가 이 모듈 등록표에서 찾는다). 파는 쪽 = 독재 NPC 나라면 지배 가문 지분 계정(shareSellerOf), 아니면 국고.
//   수량 = 설정 칸 d_share_sale_amount, 값 = 그 도시 지난 체결가(없으면 d_share_sale_price — 시뮬 직접 양도와 같은 값) [임시]. 그 도시에 그 쪽 팔 주문이 이미
//   걸려 있으면 더 걸지 않는다. 가문 계정은 팔아도 그 도시 과반(> 500‰)이 남는 데까지만(D-344, 도시마다 — 질문 2477 나), 회차 때 시장이 다시 본다.
// - 사기(npcBuyOrders — 회차마다 체결 전에): NPC가 이끄는 살아 있는 나라마다 지난 회차의 제 사기 주문을 거두고, 그 나라 국고 화폐로 값을 매기는 도시들
//   가운데 지난 체결가(없으면 d_share_sale_price) 이하로 걸린 남의 팔 주문이 있는 도시 하나를 고른다(가장 싼 값 ÷ 기준가가 작은 곳, 같으면 작은 도시 ID).
//   기준가에 산다. 수량 = d_share_sale_amount·걸린 싼 팔 주 합·예산 ÷ 기준가 가운데 작은 것. 예산 = 국고 × 설정 칸 city_share_npc_buy_budget_pm ÷ 1000 ×
//   상업 성향 배율(500~1500‰ — npc/rulingSpend.ts traitScalePm) ÷ 1000 [임시]. NPC 가문(가문 금고)은 사지 않는다 [임시 — 질문 2522].
// 정수 연산만 쓴다. 시뮬 판정은 바뀌지 않는다(시뮬은 고리를 붙이지 않는다 — SIM_VERSION 그대로).
import { traitScalePm } from "../npc/rulingSpend.ts";
import { type CityShareMarket, houseHolder, ownerHolder } from "./market.ts";

/** 시뮬 고리가 부르는 NPC 지분 팔기(맡았으면 true — 직접 양도하지 않는다) */
export type NpcShareSale = (
  seller: { readonly id: number },
  house: string | undefined,
  cityId: number,
  nowMs: number,
) => boolean;

/** 원장(세계)마다 NPC 지분 팔기 고리 — 시장이 만들어질 때 등록한다(NPC 런타임보다 늦게 붙는다) */
const sales = new WeakMap<object, NpcShareSale>();

export function registerNpcShareSale(ledger: object, sale: NpcShareSale): void {
  sales.set(ledger, sale);
}

export function npcShareSaleOf(ledger: object): NpcShareSale | undefined {
  return sales.get(ledger);
}

/** NPC 지분 주문 규칙(설정 칸) */
export interface NpcShareRules {
  /** 한 번에 파는·사는 주 수(d_share_sale_amount) */
  readonly lot: bigint;
  /** 체결가가 없을 때 기준가(d_share_sale_price) */
  readonly price: bigint;
  /** 사기 예산(국고 ‰ — city_share_npc_buy_budget_pm) */
  readonly budgetPm: number;
  readonly traitMin: number;
  readonly traitMax: number;
}

/** NPC가 이끄는 살아 있는 나라 하나(사기) */
export interface NpcShareNation {
  readonly ownerId: number;
  /** 국고 화폐 */
  readonly asset: string;
  readonly commerce: number;
}

const refPrice = (m: CityShareMarket, cityId: number, rules: NpcShareRules): bigint => {
  const last = m.lastPriceOf(cityId);
  return last !== undefined && last > 0n ? last : rules.price > 0n ? rules.price : 1n;
};

/** NPC 지분 팔기를 시장 팔 주문으로(위 머리 주석). total = 그 도시 지분 합 */
export function placeNpcSale(
  m: CityShareMarket,
  input: {
    readonly sellerId: number;
    readonly house: string | undefined;
    readonly cityId: number;
    readonly total: bigint;
    readonly nowMs: number;
  },
  rules: NpcShareRules,
): void {
  const holder = input.house === undefined ? ownerHolder(input.sellerId) : houseHolder(input.house);
  if (m.orders(input.cityId).some((order) => order.holder === holder && order.side === "sell")) return;
  let shares = rules.lot;
  const free = m.sellable(holder, input.cityId);
  if (free < shares) shares = free;
  // 가문 계정(독재 지배 가문)은 그 도시 과반이 남는 데까지(D-344 — 도시마다)
  if (input.house !== undefined) {
    const keep = input.total / 2n + 1n;
    const room = m.shareBalance(holder, input.cityId) - keep;
    if (room < shares) shares = room;
  }
  if (shares <= 0n) return;
  m.place({
    holder,
    cityId: input.cityId,
    side: "sell",
    price: refPrice(m, input.cityId, rules),
    shares,
    atMs: input.nowMs,
  });
}

/** 회차마다 NPC 나라 사기 주문(위 머리 주석). currencyOf = 그 도시 지금 값 화폐. 건 주문 수 */
export function npcBuyOrders(
  m: CityShareMarket,
  nations: readonly NpcShareNation[],
  currencyOf: (cityId: number) => string | undefined,
  rules: NpcShareRules,
  nowMs: number,
): number {
  let placed = 0;
  for (const nation of nations.toSorted((a, b) => a.ownerId - b.ownerId)) {
    const holder = ownerHolder(nation.ownerId);
    // 지난 회차의 제 사기 주문(안건 주문은 빼고)을 거두고 다시 고른다
    for (const order of m.ordersOf([holder]))
      if (order.side === "buy" && order.agendaId === null) m.cancel([holder], order.id, nowMs);
    if (rules.budgetPm <= 0 || rules.lot <= 0n) continue;
    const cash = m.cashBalance(holder, nation.asset);
    const scale = BigInt(traitScalePm(nation.commerce, rules));
    const budget = (cash * BigInt(Math.trunc(rules.budgetPm)) * scale) / 1_000_000n;
    let best: { cityId: number; ref: bigint; cheap: bigint; low: bigint } | undefined;
    for (const cityId of m.cities()) {
      if (currencyOf(cityId) !== nation.asset) continue;
      const ref = refPrice(m, cityId, rules);
      let cheap = 0n;
      let low: bigint | undefined;
      for (const order of m.orders(cityId)) {
        if (order.side !== "sell" || order.holder === holder || order.price > ref) continue;
        cheap += order.shares;
        if (low === undefined || order.price < low) low = order.price;
      }
      if (low === undefined || cheap <= 0n) continue;
      // 가장 싼 값 ÷ 기준가가 작은 곳(교차 곱으로 견준다), 같으면 작은 도시 ID(cities()가 작은 차례)
      if (!best || low * best.ref < best.low * ref) best = { cityId, ref, cheap, low };
    }
    if (!best) continue;
    let shares = rules.lot < best.cheap ? rules.lot : best.cheap;
    const affordable = budget / best.ref;
    if (affordable < shares) shares = affordable;
    if (shares <= 0n) continue;
    const result = m.place({
      holder,
      cityId: best.cityId,
      side: "buy",
      price: best.ref,
      shares,
      atMs: nowMs,
    });
    if (result.ok) placed += 1;
  }
  return placed;
}
