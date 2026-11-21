// 생산시설 지분 시장(서버 권위) — 사용자 요청 2026-11-15 "주식을 사고팔수있게도 해라", 기획 44 §6(생산시설 지분 100% 매각 가능 — 경영권 이전,
// 배당은 지분만큼)·D-125(주식은 동시호가)·D-130(지분은 원장의 자산 종류)·D-555(정산 = 지분 수대로, 주인 또는 대주주), docs/adr/2026-11-15-building-screen.md.
// - 지분 = 원장 자산 share:biz_<건물>(@terra/shared/businessBooks businessShareAsset). 처음 주문이 들어올 때 그 사업장 주인에게 설정 칸
//   business_share_count만큼 한 번 발행한다(시스템 계정 issue:share:biz_<건물>, 거래 share_issue). 발행 전에는 주인이 모두 가진 것으로 본다.
// - 체결 = 환전과 같은 동시호가 함수(@terra/sim createFxMarket, prefix "share" — 에스크로 escrow:share:<건물>:base·quote, 거래 share_escrow·
//   share_clear·share_refund). 1주 = 로트 1. 값을 매기는 화폐 = 사업장 금고 화폐(지금 서버 시험 화폐 [임시] — D-7010 "증권은 세력 화폐로만"은
//   사업장 돈이 나라 화폐로 바뀔 때 함께 바꾼다). 회차 = 설정 칸 business_share_round_ms(UTC 0시 기준 같은 간격). 남은 주문은 아래 "바뀜".
// - 주주(정산·대주주 판단) = 그 자산 잔고 + 걸어 둔 팔 주문의 주(에스크로에 있어도 그 사람 몫). 많은 주주 찾기는 바뀔 때마다 그 사업장만 다시 센다.
// - 증권 거래소 건물(D-561·D-583): cityShares/view.ts 거래소 목록이 이 모음의 조회를 부른다(주문·회차·조회 함수는 건물을 모른다 — 사업장 ID만
//   받는다). 조회에 호가창(값마다 걸린 주)·지금 닫으면 날 값을 더했다(D-583 "호가창처럼", docs/adr/2026-11-21-share-market.md).
// - 쓰기는 월드 쓰기 대기열(원장 고리와 같은 묶음). 부팅 때 걸린 주문(seq 그대로)·지난 체결가로 시장을 다시 만든다.
// 바뀜(줄기 share-market-2, 기획 D-587 — docs/adr/2026-11-21-share-market-2.md):
// - 남는 주문(질문 2472 나): 회차에 체결되지 않은 몫은 거둘 때까지 다음 회차에도 걸려 있다(createFxMarket rest — 묶음 그대로, 차례 그대로). 다시 켜도
//   걸린 줄(state open, shares = 아직 걸린 주, filled = 지금까지 체결)에서 되살린다.
// - 거래세·증권 거래소 이용료(질문 2474 다 — cityShares/levy.ts): 회차 정산 뒤 판 쪽이 받은 돈에서 거래세(그 사업장이 선 도시 주인 나라 국고, 거래
//   share_trade_tax)와 이용료(그 도시 증권 거래소 금고 — 사업장 장부 수입 share_fee)를 낸다.
import {
  type ShareHolder,
  type ShareMarketView,
  SHARE_MARKET_PREFIX,
  businessShareAsset,
  businessShareIssueCode,
  parseBusinessShareAsset,
} from "@terra/shared/businessBooks";
import { shareBookLevels } from "@terra/shared/shareBook";
import {
  type BusinessCoefficients,
  type FxMarket,
  type FxOrder,
  type Side,
  clearCallAuction,
  createFxMarket,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type ShareLevy, shareLevyAmounts } from "../cityShares/levy.ts";

/** 조회가 보이는 최근 회차 수 */
const ROUNDS_SHOWN = 24;
/** 메모리에 두는 회차 창(지난 회차 차트 + 여유) */
export const SHARE_ROUND_WINDOW_MS = 8 * 24 * 3_600_000;

export interface ShareRoundRecord {
  readonly id: number;
  readonly buildingId: number;
  readonly atMs: number;
  readonly price: bigint | undefined;
  readonly shares: bigint;
}

/** 부팅 때 읽은 지분 자료(store.ts loadShares) */
export interface LoadedShares {
  readonly open: readonly {
    readonly buildingId: number;
    readonly placedAtMs: number;
    readonly order: FxOrder;
    /** 지금까지 체결한 주 수(남는 주문 — 옛 줄은 0) */
    readonly filled?: bigint | undefined;
  }[];
  readonly rounds: readonly ShareRoundRecord[];
  /** 사업장마다 마지막 체결가(창 밖이어도) */
  readonly lastPrice: ReadonlyMap<number, bigint>;
  readonly maxOrderId: number;
  readonly maxRoundId: number;
}

export const EMPTY_SHARES: LoadedShares = {
  open: [],
  rounds: [],
  lastPrice: new Map(),
  maxOrderId: 0,
  maxRoundId: 0,
};

export type ShareFailure =
  | "unknown_building"
  | "not_business"
  | "order_limit"
  | "insufficient_shares"
  | "insufficient_funds"
  | "unknown_order"
  | "forbidden";

export type SharePlaceResult = { ok: true; orderId: number } | { ok: false; code: ShareFailure };

export interface ShareMarketsDeps {
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly planetId: string;
  readonly loaded: LoadedShares;
  /** 값을 매기는 화폐(원장 자산 — 사업장 금고 화폐) */
  readonly asset: string;
  /** 건물 주인(없는 건물이면 undefined, 주인 없음이면 null) */
  owner(buildingId: number): number | null | undefined;
  /** 사업장(시설 줄이 있는 건물)인가 */
  isBusiness(buildingId: number): boolean;
  readonly rules: () => BusinessCoefficients;
  readonly now: () => number;
  /** 사업장이 선 도시(거래세·이용료 — 없으면 세금·이용료 없음) */
  readonly cityOf?: ((buildingId: number) => number | null | undefined) | undefined;
  /** 거래세·증권 거래소 이용료(질문 2474 다). 없으면 세금·이용료 없음 */
  readonly levy?: (() => ShareLevy | undefined) | undefined;
}

export interface ShareMarkets {
  /** 발행한 지분 수(발행 전이면 0) */
  issued(buildingId: number): bigint;
  /** 전체 지분 수(발행 전이면 설정 칸 발행 수) */
  total(buildingId: number): bigint;
  /** 주주(많은 차례 → 작은 ID). 발행 전이면 주인 하나가 전체, 주인이 없으면 빈 목록 */
  holders(buildingId: number): ShareHolder[];
  /** 그 주체의 지분(잔고 + 걸어 둔 팔 주문) */
  sharesOf(buildingId: number, ownerId: number): bigint;
  /** 발행하지 않았으면 지금 주인에게 발행한다. 발행했으면(또는 이미 했으면) true */
  ensureIssued(buildingId: number, atMs: number): boolean;
  place(
    ownerId: number,
    buildingId: number,
    side: Side,
    price: bigint,
    shares: bigint,
    atMs: number,
  ): SharePlaceResult;
  cancel(ownerId: number, orderId: number, atMs: number): { ok: true } | { ok: false; code: ShareFailure };
  /** 회차 경계를 지났으면 모든 시장을 체결한다. 체결한 시장 수 */
  tick(nowMs: number): number;
  /** 다음 회차 시각 */
  nextRoundMs(nowMs: number): number;
  view(buildingId: number, viewerOwnerId: number | undefined, nowMs: number): ShareMarketView;
  /** 사라진 건물: 걸린 주문을 모두 거둔다(묶은 것을 돌려준다). 지분 잔고는 그대로 둔다(값어치만 잃는다 — 질문 1707) */
  forget(buildingId: number, atMs: number): void;
  check(): string[];
}

const lockOf = (order: { side: Side; price: bigint; lots: bigint }): bigint =>
  order.side === "buy" ? order.price * order.lots : order.lots;

const roundPeriod = (rules: BusinessCoefficients): number => Math.max(60_000, Math.floor(rules.shareRoundMs));

export function createShareMarkets(deps: ShareMarketsDeps): ShareMarkets {
  const { ledger, writer, loaded } = deps;
  let lastOrderId = loaded.maxOrderId;
  let lastRoundId = loaded.maxRoundId;
  const nextOrderId = (): number => {
    lastOrderId += 1;
    return lastOrderId;
  };
  const markets = new Map<number, FxMarket>();
  const placedAt = new Map<number, number>();
  /** 남는 주문의 지금까지 체결한 주 수(주문 ID → 주) */
  const filledSoFar = new Map<number, bigint>();
  const rounds = new Map<number, ShareRoundRecord[]>();
  const issuedBy = new Map<number, bigint>();
  /** 사업장 → 주주(잔고만, 걸린 팔 주문은 따로 더한다). 바뀐 사업장만 다시 센다 */
  const balances = new Map<number, Map<number, bigint>>();
  const dirty = new Set<number>();

  // 부팅: 발행 수·잔고를 원장에서 한 번 센다
  for (const account of ledger.accounts()) {
    const issuedFor = account.systemCode?.startsWith("issue:share:")
      ? parseBusinessShareAsset(account.asset)
      : undefined;
    if (issuedFor !== undefined && account.balance < 0n) issuedBy.set(issuedFor, -account.balance);
    const buildingId = parseBusinessShareAsset(account.asset);
    if (buildingId === undefined || account.ownerId === null || account.balance <= 0n) continue;
    const map = balances.get(buildingId) ?? new Map<number, bigint>();
    map.set(account.ownerId, (map.get(account.ownerId) ?? 0n) + account.balance);
    balances.set(buildingId, map);
  }
  for (const round of loaded.rounds) {
    const list = rounds.get(round.buildingId) ?? [];
    list.push(round);
    rounds.set(round.buildingId, list);
  }
  for (const list of rounds.values()) list.sort((a, b) => a.atMs - b.atMs || a.id - b.id);

  const recount = (buildingId: number): void => {
    const asset = businessShareAsset(buildingId);
    const map = new Map<number, bigint>();
    for (const account of ledger.accounts())
      if (account.asset === asset && account.ownerId !== null && account.balance > 0n)
        map.set(account.ownerId, (map.get(account.ownerId) ?? 0n) + account.balance);
    balances.set(buildingId, map);
    dirty.delete(buildingId);
  };

  const writeOpen = (
    buildingId: number,
    order: FxOrder,
    atMs: number,
    filled = 0n,
    clearPrice?: bigint,
  ): void => {
    writer.upsert("businessShareOrders", {
      id: order.id,
      building_id: buildingId,
      planet_id: deps.planetId,
      owner_id: order.owner,
      side: order.side,
      price: order.price,
      shares: order.lots,
      locked: lockOf(order),
      seq: order.seq,
      placed_at_ms: placedAt.get(order.id) ?? atMs,
      state: "open",
      filled,
      clear_price: clearPrice ?? null,
      done_at_ms: null,
    });
  };
  const writeDone = (
    buildingId: number,
    order: FxOrder,
    state: "done" | "cancelled",
    filled: bigint,
    clearPrice: bigint | undefined,
    atMs: number,
  ): void => {
    writer.upsert("businessShareOrders", {
      id: order.id,
      building_id: buildingId,
      planet_id: deps.planetId,
      owner_id: order.owner,
      side: order.side,
      price: order.price,
      shares: order.lots,
      locked: 0n,
      seq: order.seq,
      placed_at_ms: placedAt.get(order.id) ?? atMs,
      state,
      filled,
      clear_price: clearPrice ?? null,
      done_at_ms: atMs,
    });
    placedAt.delete(order.id);
    filledSoFar.delete(order.id);
  };

  const marketOf = (buildingId: number, restore?: readonly FxOrder[]): FxMarket => {
    const found = markets.get(buildingId);
    if (found) return found;
    const market = createFxMarket(
      {
        id: buildingId,
        base: businessShareAsset(buildingId),
        quote: deps.asset,
        lotSize: 1n,
        prefix: SHARE_MARKET_PREFIX,
        // 체결되지 않은 몫은 다음 회차에 남는다(D-587 질문 2472 나)
        rest: true,
      },
      ledger,
      nextOrderId,
      { orders: restore ?? [], lastPrice: loaded.lastPrice.get(buildingId) },
    );
    markets.set(buildingId, market);
    return market;
  };

  // 부팅 복원: 걸린 주문이 있는 사업장 시장을 되살린다(에스크로는 원장에 이미 있다)
  const openBy = new Map<number, FxOrder[]>();
  for (const row of loaded.open) {
    placedAt.set(row.order.id, row.placedAtMs);
    if ((row.filled ?? 0n) > 0n) filledSoFar.set(row.order.id, row.filled ?? 0n);
    const list = openBy.get(row.buildingId) ?? [];
    list.push(row.order);
    openBy.set(row.buildingId, list);
  }
  for (const [buildingId, orders] of openBy) marketOf(buildingId, orders);
  let lastBoundary = Math.floor(deps.now() / roundPeriod(deps.rules())) * roundPeriod(deps.rules());

  const issued = (buildingId: number): bigint => issuedBy.get(buildingId) ?? 0n;
  const total = (buildingId: number): bigint => {
    const count = issued(buildingId);
    return count > 0n ? count : BigInt(Math.max(1, Math.floor(deps.rules().shareCount)));
  };

  const sellLocked = (buildingId: number): Map<number, bigint> => {
    const out = new Map<number, bigint>();
    for (const order of markets.get(buildingId)?.orders() ?? [])
      if (order.side === "sell") out.set(order.owner, (out.get(order.owner) ?? 0n) + order.lots);
    return out;
  };

  const holders = (buildingId: number): ShareHolder[] => {
    if (issued(buildingId) <= 0n) {
      const owner = deps.owner(buildingId);
      return owner === null || owner === undefined ? [] : [{ ownerId: owner, shares: total(buildingId) }];
    }
    if (dirty.has(buildingId) || !balances.has(buildingId)) recount(buildingId);
    const sum = new Map(balances.get(buildingId) ?? []);
    for (const [owner, lots] of sellLocked(buildingId)) sum.set(owner, (sum.get(owner) ?? 0n) + lots);
    return [...sum]
      .filter(([, shares]) => shares > 0n)
      .map(([ownerId, shares]) => ({ ownerId, shares }))
      .toSorted((a, b) => (a.shares === b.shares ? a.ownerId - b.ownerId : a.shares > b.shares ? -1 : 1));
  };

  const ensureIssued = (buildingId: number, atMs: number): boolean => {
    if (issued(buildingId) > 0n) return true;
    const owner = deps.owner(buildingId);
    if (owner === null || owner === undefined || !deps.isBusiness(buildingId)) return false;
    const count = total(buildingId);
    const asset = businessShareAsset(buildingId);
    ledger.post({
      kind: "share_issue",
      atMs,
      entries: [
        { account: ledger.systemAccount(businessShareIssueCode(buildingId), asset), amount: -count },
        { account: ledger.ownerAccount(owner, asset), amount: count },
      ],
    });
    issuedBy.set(buildingId, count);
    dirty.add(buildingId);
    return true;
  };

  const openCount = (ownerId: number): number => {
    let count = 0;
    for (const market of markets.values())
      for (const order of market.orders()) if (order.owner === ownerId) count += 1;
    return count;
  };

  /** 회차 정산 뒤 판 쪽이 내는 거래세(국고 — 거래 share_trade_tax)·이용료(그 도시 증권 거래소 금고) — 질문 2474 다 */
  const levyRound = (
    buildingId: number,
    sells: readonly { owner: number; filled: bigint }[],
    price: bigint,
    atMs: number,
  ): void => {
    const levy = deps.levy?.();
    const cityId = deps.cityOf?.(buildingId);
    const rate = levy && cityId !== null && cityId !== undefined ? levy.rateOf(cityId) : undefined;
    if (!levy || !rate) return;
    for (const sell of sells) {
      const cut = shareLevyAmounts(sell.filled * price, rate, sell.owner);
      const from = ledger.ownerAccount(sell.owner, deps.asset);
      if (cut.tax > 0n && ledger.balance(from) >= cut.tax)
        ledger.post({
          kind: "share_trade_tax",
          atMs,
          entries: [
            { account: from, amount: -cut.tax },
            { account: ledger.ownerAccount(rate.treasuryOwner, deps.asset), amount: cut.tax },
          ],
        });
      if (cut.fee > 0n && rate.fee)
        levy.pay({ from, buildingId: rate.fee.buildingId, asset: deps.asset, amount: cut.fee, atMs });
    }
  };

  const run = (buildingId: number, market: FxMarket, atMs: number): void => {
    const before = [...market.orders()];
    const result = market.run(atMs);
    const left = new Map(market.orders().map((order) => [order.id, order]));
    const sold: { owner: number; filled: bigint }[] = [];
    for (const order of before) {
      const filled = result.fills.get(order.id) ?? 0n;
      if (filled <= 0n) continue;
      if (order.side === "sell") sold.push({ owner: order.owner, filled });
      const sum = (filledSoFar.get(order.id) ?? 0n) + filled;
      const rest = left.get(order.id);
      if (rest) {
        // 남은 몫은 다음 회차에(줄은 open 그대로 — 아직 걸린 주·지금까지 체결)
        filledSoFar.set(order.id, sum);
        writeOpen(buildingId, rest, atMs, sum, result.price);
      } else writeDone(buildingId, { ...order, lots: sum }, "done", sum, result.price, atMs);
    }
    if (result.price !== undefined) levyRound(buildingId, sold, result.price, atMs);
    lastRoundId += 1;
    const round: ShareRoundRecord = {
      id: lastRoundId,
      buildingId,
      atMs,
      price: result.price,
      shares: result.lots,
    };
    writer.append("businessShareRounds", {
      id: round.id,
      building_id: buildingId,
      planet_id: deps.planetId,
      at_ms: atMs,
      price: result.price ?? null,
      shares: result.lots,
    });
    const list = rounds.get(buildingId) ?? [];
    list.push(round);
    const cut = atMs - SHARE_ROUND_WINDOW_MS;
    while (list.length > 0 && (list[0]?.atMs ?? cut) < cut) list.shift();
    rounds.set(buildingId, list);
    dirty.add(buildingId);
  };

  const cancelOrder = (buildingId: number, market: FxMarket, order: FxOrder, atMs: number): void => {
    // 끝난 줄 = 체결 + 거둔 몫(shares), 지금까지 체결(filled)
    const filled = filledSoFar.get(order.id) ?? 0n;
    if (market.cancel(order.id, atMs))
      writeDone(buildingId, { ...order, lots: order.lots + filled }, "cancelled", filled, undefined, atMs);
  };
  const sharesOf = (buildingId: number, ownerId: number): bigint =>
    holders(buildingId).find((holder) => holder.ownerId === ownerId)?.shares ?? 0n;
  const nextRoundMs = (nowMs: number): number => {
    const period = roundPeriod(deps.rules());
    return Math.floor(nowMs / period) * period + period;
  };

  return {
    issued,
    total,
    holders,
    sharesOf,
    ensureIssued,
    place(ownerId, buildingId, side, price, shares, atMs) {
      const owner = deps.owner(buildingId);
      if (owner === undefined) return { ok: false, code: "unknown_building" };
      if (owner === null || !deps.isBusiness(buildingId)) return { ok: false, code: "not_business" };
      if (price <= 0n || shares <= 0n) return { ok: false, code: "insufficient_shares" };
      if (openCount(ownerId) >= Math.max(1, Math.floor(deps.rules().shareOrderMax)))
        return { ok: false, code: "order_limit" };
      const asset = businessShareAsset(buildingId);
      // 잔고 확인은 발행 전 주인도 가진 것으로 본다(팔 주문이 발행을 부른다)
      if (side === "sell") {
        const have =
          issued(buildingId) > 0n
            ? ledger.balanceOf(ownerId, asset)
            : ownerId === owner
              ? total(buildingId)
              : 0n;
        if (have < shares) return { ok: false, code: "insufficient_shares" };
      } else if (ledger.balanceOf(ownerId, deps.asset) < price * shares)
        return { ok: false, code: "insufficient_funds" };
      ensureIssued(buildingId, atMs);
      const market = marketOf(buildingId);
      const result = market.place(ownerId, side, price, shares, atMs);
      if (!result.ok)
        return { ok: false, code: side === "sell" ? "insufficient_shares" : "insufficient_funds" };
      placedAt.set(result.orderId, atMs);
      const order = market.orders().find((entry) => entry.id === result.orderId);
      if (order) writeOpen(buildingId, order, atMs);
      dirty.add(buildingId);
      return { ok: true, orderId: result.orderId };
    },
    cancel(ownerId, orderId, atMs) {
      for (const [buildingId, market] of markets) {
        const order = market.orders().find((entry) => entry.id === orderId);
        if (!order) continue;
        if (order.owner !== ownerId) return { ok: false, code: "forbidden" };
        cancelOrder(buildingId, market, order, atMs);
        dirty.add(buildingId);
        return { ok: true };
      }
      return { ok: false, code: "unknown_order" };
    },
    tick(nowMs) {
      const period = roundPeriod(deps.rules());
      const boundary = Math.floor(nowMs / period) * period;
      if (boundary <= lastBoundary) return 0;
      lastBoundary = boundary;
      let done = 0;
      for (const [buildingId, market] of [...markets].toSorted((a, b) => a[0] - b[0])) {
        if (market.orders().length === 0) continue;
        run(buildingId, market, boundary);
        done += 1;
      }
      return done;
    },
    nextRoundMs,
    view(buildingId, viewerOwnerId, nowMs) {
      const market = markets.get(buildingId);
      const orders = market?.orders() ?? [];
      let bid = 0n;
      let ask = 0n;
      for (const order of orders) {
        if (order.side === "buy") bid += order.lots;
        else ask += order.lots;
      }
      const shown = (rounds.get(buildingId) ?? []).filter((round) => round.price !== undefined);
      // 호가창·지금 닫으면 날 값(D-583 "호가창처럼" — 체결은 그대로 동시호가, docs/adr/2026-11-21-share-market.md)
      const lastKnown = market?.lastPrice ?? loaded.lastPrice.get(buildingId);
      const preview = clearCallAuction(
        orders.filter((order) => order.side === "buy"),
        orders.filter((order) => order.side === "sell"),
        lastKnown,
      );
      return {
        book: shareBookLevels(orders),
        expected:
          preview.price === undefined || preview.lots <= 0n
            ? null
            : { price: String(preview.price), shares: String(preview.lots) },
        asset: deps.asset,
        issued: issued(buildingId) > 0n,
        total: String(total(buildingId)),
        lastPrice:
          market?.lastPrice !== undefined
            ? String(market.lastPrice)
            : loaded.lastPrice.has(buildingId)
              ? String(loaded.lastPrice.get(buildingId))
              : null,
        roundMs: roundPeriod(deps.rules()),
        nextRoundMs: nextRoundMs(nowMs),
        bidShares: String(bid),
        askShares: String(ask),
        myShares: String(viewerOwnerId === undefined ? 0n : sharesOf(buildingId, viewerOwnerId)),
        myCash: String(viewerOwnerId === undefined ? 0n : ledger.balanceOf(viewerOwnerId, deps.asset)),
        myOrders: orders
          .filter((order) => viewerOwnerId !== undefined && order.owner === viewerOwnerId)
          .map((order) => ({
            id: order.id,
            side: order.side,
            price: String(order.price),
            shares: String(order.lots),
          })),
        orderMax: Math.max(1, Math.floor(deps.rules().shareOrderMax)),
        rounds: shown.slice(-ROUNDS_SHOWN).map((round) => ({
          atMs: round.atMs,
          price: round.price === undefined ? null : String(round.price),
          shares: String(round.shares),
        })),
      };
    },
    forget(buildingId, atMs) {
      const market = markets.get(buildingId);
      if (!market) return;
      // 거두기는 시장 안 목록을 새 배열로 바꾼다(지금 목록을 고치지 않는다) — 그대로 돌아도 된다
      const open = market.orders();
      for (const order of open) cancelOrder(buildingId, market, order, atMs);
      dirty.add(buildingId);
    },
    check() {
      const problems: string[] = [];
      for (const market of markets.values()) problems.push(...market.checkEscrow());
      return problems;
    },
  };
}
