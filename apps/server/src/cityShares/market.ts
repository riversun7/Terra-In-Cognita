// 도시(정부) 지분 시장(서버 권위) — 기획 D-583(질문 2438 답: "정부건물 내 전체지분 조회기능, 호가창처럼 거래가능 … 소유자는 지분을 매도가 정해서 걸어놓을 수
// 있음, 반대로 매수자는 매수금액 걸어놓기 가능", "기존기술을 그대로 사용하자 빠른 구현이 먼저다"), D-125(동시호가)·D-130(도시 지분 = 원장 자산 share_<도시>)·
// D-344(독재 지배 쪽 과반)·D-581(국고 지분), docs/adr/2026-11-21-share-market.md.
// - 체결 = 환전·사업장 지분과 같은 동시호가 함수(@terra/sim clearCallAuction — 체결가 하나, 값·차례 우선). 체결만 이 함수에 맡겨 나중에 연속 체결로
//   바꿔 끼울 수 있게 둔다(matchRound 한 곳). 회차 = 설정 칸 city_share_round_ms(UTC 0시 기준 같은 간격).
// - 주문은 회차가 지나도 남는다(호가창 — 체결되지 않은 몫이 다음 회차에 그대로 걸려 있다, 거두기 전까지). 사업장 지분은 회차마다 돌려준다(옛 판 그대로).
// - 낸 쪽(holder): o:<소유 주체>(사용자·국고) | h:<가문 꼬리>(가문 지분 계정 shares:house:<꼬리>share_<도시> · 가문 금고 vault:house:<꼬리><화폐>).
// - 사기: 1주 상한 × 주 수를 낸 쪽 돈 계정에서 에스크로(escrow:cityshare:<도시>:<화폐>)로 묶는다(cityshare_escrow). 값 화폐 = 낸 때 그 도시 주인 나라 화폐.
// - 팔기: 지분을 묶지 않는다(도시 지분은 의결권·배당·과반·상장폐지가 계정 잔고로 센다 — 묶으면 회차 동안 그 몫이 사라진다). 낼 때와 회차 때
//   "가진 주 − 같은 쪽의 다른 팔 주문"을 보고, 회차 때 모자라면 주문을 줄인다(0이면 거둔다).
// - 독재 과반(D-344): 회차·주문 때 지배 쪽 팔기·국고 팔기를 과반이 남는 데까지로 줄인다(caps — 서비스가 의결 상태로 셈해 넘긴다, majorityCaps).
// - 회차 정산은 원장 거래 하나(cityshare_clear — 계정마다 합쳐 적는다): 산 쪽 에스크로 −(체결 × 체결가 + 남은 묶음 차이), 산 쪽 지분 +, 판 쪽 지분 −, 판 쪽 돈 +.
// - 도시가 사라졌거나(폐허) 주인이 바뀌어 화폐가 바뀌면 그 도시의 옛 화폐 주문은 회차 때 거둔다(묶은 돈을 돌려준다).
// - 쓰기는 월드 쓰기 대기열(원장 고리와 같은 묶음). 부팅 때 걸린 주문(seq 그대로)·지난 체결가로 다시 만든다(store.ts).
import { cityShareEscrowCode, CITY_SHARE_MARKET_PREFIX } from "@terra/shared/cityShares";
import { type ShareBookView, shareBookLevels } from "@terra/shared/shareBook";
import {
  type AuctionOrder,
  type AuctionResult,
  type LedgerEntry,
  clearCallAuction,
  houseMoneyCode,
  houseShareCode,
  shareAsset,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

export type CityShareSide = "buy" | "sell";

/** 걸린 주문 하나(shares = 아직 걸린 주 수, filled = 지금까지 체결한 주 수) */
export interface CityShareOrder {
  readonly id: number;
  readonly cityId: number;
  readonly holder: string;
  readonly side: CityShareSide;
  readonly price: bigint;
  shares: bigint;
  filled: bigint;
  readonly asset: string;
  readonly seq: number;
  readonly placedAtMs: number;
  readonly agendaId: number | null;
}

export interface CityShareRound {
  readonly id: number;
  readonly cityId: number;
  readonly atMs: number;
  readonly price: bigint | undefined;
  readonly shares: bigint;
  readonly asset: string;
}

/** 부팅 때 읽은 자료(store.ts loadCityShares) */
export interface LoadedCityShares {
  readonly open: readonly CityShareOrder[];
  readonly rounds: readonly CityShareRound[];
  /** 도시마다 마지막 체결가(창 밖이어도) */
  readonly lastPrice: ReadonlyMap<number, bigint>;
  readonly maxOrderId: number;
  readonly maxRoundId: number;
}

export const EMPTY_CITY_SHARES: LoadedCityShares = {
  open: [],
  rounds: [],
  lastPrice: new Map(),
  maxOrderId: 0,
  maxRoundId: 0,
};

/** 메모리에 두는 회차 창(지난 회차 차트 + 여유) */
export const CITY_SHARE_ROUND_WINDOW_MS = 8 * 24 * 3_600_000;
/** 조회가 보이는 최근 회차 수 */
const ROUNDS_SHOWN = 24;

export type CityShareFailure =
  | "unknown_city"
  | "order_limit"
  | "insufficient_shares"
  | "insufficient_funds"
  | "dictatorship_majority"
  | "unknown_order"
  | "forbidden";

export type CitySharePlaceResult =
  | { readonly ok: true; readonly orderId: number }
  | { readonly ok: false; readonly code: CityShareFailure };

export interface CityShareRules {
  readonly roundMs: number;
  readonly orderMax: number;
}

/** 독재 과반 줄이기: holder → 이번에 더 걸 수 있는(또는 회차에 팔 수 있는) 주 수의 위 끝. 없는 holder는 끝이 없다 */
export type CityShareCaps = ReadonlyMap<string, bigint>;

export interface CityShareMarketDeps {
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly planetId: string;
  readonly loaded: LoadedCityShares;
  /** 그 도시의 지금 값 화폐(주인 나라 국고 화폐). 없는 도시(폐허·모르는 도시)면 undefined */
  currencyOf(cityId: number): string | undefined;
  readonly rules: () => CityShareRules;
  readonly now: () => number;
}

export const ownerHolder = (ownerId: number): string => `o:${ownerId}`;
export const houseHolder = (tail: string): string => `h:${tail}`;
/** holder → 소유 주체 ID(가문이면 undefined) */
export function ownerOfHolder(holder: string): number | undefined {
  const match = /^o:(\d+)$/.exec(holder);
  return match ? Number(match[1]) : undefined;
}
/** holder → 가문 꼬리(소유 주체면 undefined) */
export function tailOfHolder(holder: string): string | undefined {
  return holder.startsWith("h:") && holder.endsWith(":") ? holder.slice(2) : undefined;
}

const roundPeriod = (rules: CityShareRules): number => Math.max(60_000, Math.floor(rules.roundMs));
const lockOf = (order: { side: CityShareSide; price: bigint; shares: bigint }): bigint =>
  order.side === "buy" ? order.price * order.shares : 0n;

/**
 * 독재 과반(D-344 — governance/electorate.ts rulingSharePm과 같은 셈: 지배 쪽 ÷ (합 − 국고) > 500‰)이 남는 데까지의 위 끝.
 * own = 지배 쪽이 가진 주(걸린 팔 주문 포함 — 팔 지분은 묶지 않는다), others = 합 − 국고. pending* = 이미 걸린 팔 주문.
 * 지배 쪽이 s를 팔면 (own − s) × 1000 ≥ 501 × others, 국고가 t를 팔면(다른 주주에게 간다고 보고) own × 1000 ≥ 501 × (others + t).
 * 지분이 없으면(상장폐지) 끝이 없다(undefined).
 */
export function majorityCaps(input: {
  readonly total: bigint;
  readonly own: bigint;
  readonly others: bigint;
  readonly pendingRuling: bigint;
  readonly pendingTreasury: bigint;
}): { readonly ruling: bigint; readonly treasury: bigint } | undefined {
  if (input.total <= 0n) return undefined;
  const own = input.own - input.pendingRuling;
  const others = input.others + input.pendingTreasury;
  // 지배 쪽: own − s ≥ ⌈501 × others ÷ 1000⌉
  const keep = (501n * others + 999n) / 1000n;
  const ruling = own - keep;
  // 국고: others + t ≤ ⌊own × 1000 ÷ 501⌋
  const treasury = (own * 1000n) / 501n - others;
  return { ruling: ruling > 0n ? ruling : 0n, treasury: treasury > 0n ? treasury : 0n };
}

/** 한 회차 체결(동시호가 — 연속 체결로 바꿀 때 이 함수만 바꾼다). 주문 차례·값으로 체결가 하나와 주문마다 체결 주 수 */
export function matchRound(
  buys: readonly AuctionOrder[],
  sells: readonly AuctionOrder[],
  reference: bigint | undefined,
): AuctionResult {
  return clearCallAuction(buys, sells, reference);
}

export interface CityShareMarketView {
  readonly lastPrice: bigint | undefined;
  readonly roundMs: number;
  readonly nextRoundMs: number;
  readonly book: ShareBookView;
  readonly expected: { readonly price: bigint; readonly shares: bigint } | undefined;
  readonly bidShares: bigint;
  readonly askShares: bigint;
  readonly rounds: readonly CityShareRound[];
}

export function createCityShareMarket(deps: CityShareMarketDeps) {
  const { ledger, writer, loaded } = deps;
  let lastOrderId = loaded.maxOrderId;
  let lastRoundId = loaded.maxRoundId;
  let seq = 0;
  /** 도시 → 걸린 주문(seq 차례) */
  const books = new Map<number, CityShareOrder[]>();
  const rounds = new Map<number, CityShareRound[]>();
  const lastPrice = new Map<number, bigint>(loaded.lastPrice);
  for (const order of loaded.open) {
    const list = books.get(order.cityId) ?? [];
    list.push({ ...order });
    books.set(order.cityId, list);
    seq = Math.max(seq, order.seq);
  }
  for (const list of books.values()) list.sort((a, b) => a.seq - b.seq);
  for (const round of loaded.rounds) {
    const list = rounds.get(round.cityId) ?? [];
    list.push(round);
    rounds.set(round.cityId, list);
  }
  for (const list of rounds.values()) list.sort((a, b) => a.atMs - b.atMs || a.id - b.id);
  let lastBoundary = Math.floor(deps.now() / roundPeriod(deps.rules())) * roundPeriod(deps.rules());

  /** 시스템 계정 잔고(없으면 0 — 읽기만, 계정을 만들지 않는다) */
  const systemBalance = (code: string): bigint => {
    for (const account of ledger.accounts()) if (account.systemCode === code) return account.balance;
    return 0n;
  };
  const shareBalance = (holder: string, cityId: number): bigint => {
    const owner = ownerOfHolder(holder);
    if (owner !== undefined) return ledger.balanceOf(owner, shareAsset(cityId));
    const tail = tailOfHolder(holder);
    return tail === undefined ? 0n : systemBalance(houseShareCode(tail, cityId));
  };
  const cashBalance = (holder: string, asset: string): bigint => {
    const owner = ownerOfHolder(holder);
    if (owner !== undefined) return ledger.balanceOf(owner, asset);
    const tail = tailOfHolder(holder);
    return tail === undefined ? 0n : systemBalance(houseMoneyCode(tail, asset));
  };
  const shareAccount = (holder: string, cityId: number): number => {
    const owner = ownerOfHolder(holder);
    if (owner !== undefined) return ledger.ownerAccount(owner, shareAsset(cityId));
    return ledger.systemAccount(houseShareCode(tailOfHolder(holder) ?? "", cityId), shareAsset(cityId));
  };
  const cashAccount = (holder: string, asset: string): number => {
    const owner = ownerOfHolder(holder);
    if (owner !== undefined) return ledger.ownerAccount(owner, asset);
    return ledger.systemAccount(houseMoneyCode(tailOfHolder(holder) ?? "", asset), asset);
  };
  const escrow = (cityId: number, asset: string): number =>
    ledger.systemAccount(cityShareEscrowCode(cityId, asset), asset);

  const write = (
    order: CityShareOrder,
    state: "open" | "done" | "cancelled",
    atMs: number,
    clear?: bigint,
  ) => {
    const total = order.shares + order.filled;
    writer.upsert("cityShareOrders", {
      id: order.id,
      city_id: order.cityId,
      planet_id: deps.planetId,
      holder: order.holder,
      side: order.side,
      price: order.price,
      // 끝난 주문은 체결 + 거둔 몫을 남긴다(0이면 1 — 표 검사 shares > 0), 걸린 주문은 아직 걸린 주 수
      shares: state === "open" ? order.shares : total > 0n ? total : 1n,
      asset: order.asset,
      locked: state === "open" ? lockOf(order) : 0n,
      seq: order.seq,
      placed_at_ms: order.placedAtMs,
      state,
      filled: order.filled,
      clear_price: clear ?? null,
      done_at_ms: state === "open" ? null : atMs,
      agenda_id: order.agendaId,
    });
  };

  const openOf = (cityId: number): CityShareOrder[] => books.get(cityId) ?? [];
  /** 그 쪽이 그 도시에 이미 걸어 둔 팔 주 수(except = 셈에서 뺄 주문) */
  const pendingSell = (holder: string, cityId: number, except?: number): bigint =>
    openOf(cityId)
      .filter((order) => order.holder === holder && order.side === "sell" && order.id !== except)
      .reduce((sum, order) => sum + order.shares, 0n);
  const openCount = (holder: string): number => {
    let count = 0;
    for (const list of books.values())
      for (const order of list) if (order.holder === holder && order.agendaId === null) count += 1;
    return count;
  };
  const drop = (order: CityShareOrder): void => {
    const list = books.get(order.cityId);
    if (!list) return;
    const next = list.filter((entry) => entry.id !== order.id);
    if (next.length === 0) books.delete(order.cityId);
    else books.set(order.cityId, next);
  };
  /** 주문을 거둔다(묶은 돈을 돌려준다) */
  const cancelOrder = (order: CityShareOrder, atMs: number): void => {
    const lock = lockOf(order);
    if (lock > 0n)
      ledger.post({
        kind: `${CITY_SHARE_MARKET_PREFIX}_refund`,
        atMs,
        entries: [
          { account: escrow(order.cityId, order.asset), amount: -lock },
          { account: cashAccount(order.holder, order.asset), amount: lock },
        ],
      });
    drop(order);
    write(order, "cancelled", atMs);
  };
  const nextRoundMs = (nowMs: number): number => {
    const period = roundPeriod(deps.rules());
    return Math.floor(nowMs / period) * period + period;
  };
  const sellable = (holder: string, cityId: number, cap?: bigint): bigint => {
    const free = shareBalance(holder, cityId) - pendingSell(holder, cityId);
    const room = cap === undefined || cap > free ? free : cap;
    return room > 0n ? room : 0n;
  };

  /** 한 도시 회차: 옛 화폐 주문 거두기 → 팔 주문 줄이기(가진 주·과반) → 체결 → 정산 → 남은 몫은 다음 회차로 */
  const runCity = (cityId: number, atMs: number, caps: CityShareCaps): boolean => {
    const asset = deps.currencyOf(cityId);
    for (const order of openOf(cityId)) if (order.asset !== asset) cancelOrder(order, atMs);
    const list = openOf(cityId);
    if (list.length === 0 || asset === undefined) return false;
    // 팔 주문을 그 쪽이 지금 가진 주(과반 끝 포함)까지로 줄인다 — seq 차례로 먼저 낸 주문부터 채운다
    const room = new Map<string, bigint>();
    for (const order of list.filter((entry) => entry.side === "sell")) {
      if (!room.has(order.holder)) {
        const have = shareBalance(order.holder, cityId);
        const cap = caps.get(order.holder);
        room.set(order.holder, cap === undefined || cap > have ? have : cap);
      }
      const left = room.get(order.holder) ?? 0n;
      if (left < order.shares) {
        if (left <= 0n) {
          cancelOrder(order, atMs);
          continue;
        }
        order.shares = left;
        write(order, "open", atMs);
      }
      room.set(order.holder, left - order.shares);
    }
    const live = openOf(cityId);
    const auction = (side: CityShareSide): AuctionOrder[] =>
      live
        .filter((order) => order.side === side)
        .map((order) => ({ id: order.id, owner: 0, price: order.price, lots: order.shares, seq: order.seq }));
    const result = matchRound(auction("buy"), auction("sell"), lastPrice.get(cityId));
    const price = result.price ?? 0n;
    const sums = new Map<number, bigint>();
    const add = (account: number, amount: bigint): void => {
      if (amount !== 0n) sums.set(account, (sums.get(account) ?? 0n) + amount);
    };
    for (const order of live) {
      const filled = result.fills.get(order.id) ?? 0n;
      if (filled <= 0n) continue;
      if (order.side === "buy") {
        // 묶은 것 = 상한 × 체결 주, 쓴 것 = 체결가 × 체결 주 → 차이는 돌려준다(남은 주의 묶음은 그대로)
        add(escrow(cityId, asset), -(order.price * filled));
        add(cashAccount(order.holder, asset), (order.price - price) * filled);
        add(shareAccount(order.holder, cityId), filled);
      } else {
        add(shareAccount(order.holder, cityId), -filled);
        add(cashAccount(order.holder, asset), price * filled);
      }
    }
    const entries: LedgerEntry[] = [];
    for (const [account, amount] of sums) if (amount !== 0n) entries.push({ account, amount });
    if (entries.length > 0) ledger.post({ kind: `${CITY_SHARE_MARKET_PREFIX}_clear`, atMs, entries });
    for (const order of live) {
      const filled = result.fills.get(order.id) ?? 0n;
      if (filled <= 0n) continue;
      order.shares -= filled;
      order.filled += filled;
      if (order.shares <= 0n) {
        drop(order);
        write(order, "done", atMs, price);
      } else write(order, "open", atMs, price);
    }
    if (result.price !== undefined) lastPrice.set(cityId, result.price);
    lastRoundId += 1;
    const round: CityShareRound = {
      id: lastRoundId,
      cityId,
      atMs,
      price: result.price,
      shares: result.lots,
      asset,
    };
    writer.append("cityShareRounds", {
      id: round.id,
      city_id: cityId,
      planet_id: deps.planetId,
      at_ms: atMs,
      price: result.price ?? null,
      shares: result.lots,
      asset,
    });
    const shown = rounds.get(cityId) ?? [];
    shown.push(round);
    const cut = atMs - CITY_SHARE_ROUND_WINDOW_MS;
    while (shown.length > 0 && (shown[0]?.atMs ?? cut) < cut) shown.shift();
    rounds.set(cityId, shown);
    return true;
  };

  return {
    shareBalance,
    cashBalance,
    sellable,
    nextRoundMs,
    /** 걸린 주문(도시 하나 — seq 차례) */
    orders: (cityId: number): readonly CityShareOrder[] => openOf(cityId),
    /** 주문이 걸린 도시들(작은 차례) */
    cities: (): number[] => [...books.keys()].toSorted((a, b) => a - b),
    /** 그 쪽들의 걸린 주문(모든 도시 — 도시·seq 차례) */
    ordersOf(holders: readonly string[]): CityShareOrder[] {
      const set = new Set(holders);
      return [...books.values()]
        .flat()
        .filter((order) => set.has(order.holder))
        .toSorted((a, b) => a.cityId - b.cityId || a.seq - b.seq);
    },
    orderMax: (): number => Math.max(1, Math.floor(deps.rules().orderMax)),
    lastPriceOf: (cityId: number): bigint | undefined => lastPrice.get(cityId),
    /**
     * 주문을 넣는다. cap = 독재 과반 끝(팔기만 — 서비스가 셈해 넘긴다). agendaId = 승인된 국고 지분 팔기(주문 수 한도 밖).
     * 사기는 그 도시 지금 화폐로 돈을 묶는다.
     */
    place(input: {
      readonly holder: string;
      readonly cityId: number;
      readonly side: CityShareSide;
      readonly price: bigint;
      readonly shares: bigint;
      readonly atMs: number;
      readonly cap?: bigint | undefined;
      readonly agendaId?: number | undefined;
    }): CitySharePlaceResult {
      const asset = deps.currencyOf(input.cityId);
      if (asset === undefined) return { ok: false, code: "unknown_city" };
      if (input.price <= 0n || input.shares <= 0n) return { ok: false, code: "insufficient_shares" };
      if (
        input.agendaId === undefined &&
        openCount(input.holder) >= Math.max(1, Math.floor(deps.rules().orderMax))
      )
        return { ok: false, code: "order_limit" };
      if (input.side === "sell") {
        const free = sellable(input.holder, input.cityId);
        if (free < input.shares) return { ok: false, code: "insufficient_shares" };
        if (input.cap !== undefined && input.cap < input.shares)
          return { ok: false, code: "dictatorship_majority" };
      } else {
        const lock = input.price * input.shares;
        if (cashBalance(input.holder, asset) < lock) return { ok: false, code: "insufficient_funds" };
        ledger.post({
          kind: `${CITY_SHARE_MARKET_PREFIX}_escrow`,
          atMs: input.atMs,
          entries: [
            { account: cashAccount(input.holder, asset), amount: -lock },
            { account: escrow(input.cityId, asset), amount: lock },
          ],
        });
      }
      seq += 1;
      lastOrderId += 1;
      const order: CityShareOrder = {
        id: lastOrderId,
        cityId: input.cityId,
        holder: input.holder,
        side: input.side,
        price: input.price,
        shares: input.shares,
        filled: 0n,
        asset,
        seq,
        placedAtMs: input.atMs,
        agendaId: input.agendaId ?? null,
      };
      const list = books.get(input.cityId) ?? [];
      list.push(order);
      books.set(input.cityId, list);
      write(order, "open", input.atMs);
      return { ok: true, orderId: order.id };
    },
    /** 주문 거두기: holders = 거둘 수 있는 쪽(내 계정·내 가문) */
    cancel(
      holders: readonly string[],
      orderId: number,
      atMs: number,
    ): { ok: true } | { ok: false; code: CityShareFailure } {
      for (const list of books.values()) {
        const order = list.find((entry) => entry.id === orderId);
        if (!order) continue;
        if (!holders.includes(order.holder)) return { ok: false, code: "forbidden" };
        cancelOrder(order, atMs);
        return { ok: true };
      }
      return { ok: false, code: "unknown_order" };
    },
    /** 회차 경계를 지났으면 그 경계(아직 돌리지 않음), 아니면 undefined */
    due(nowMs: number): number | undefined {
      const period = roundPeriod(deps.rules());
      const boundary = Math.floor(nowMs / period) * period;
      return boundary > lastBoundary ? boundary : undefined;
    },
    /** 그 경계의 회차를 모든 도시에 돌린다(caps = 도시마다 과반 끝). 체결을 돌린 도시 수 */
    run(boundary: number, caps: (cityId: number) => CityShareCaps): number {
      if (boundary <= lastBoundary) return 0;
      lastBoundary = boundary;
      let done = 0;
      for (const cityId of [...books.keys()].toSorted((a, b) => a - b))
        if (runCity(cityId, boundary, caps(cityId))) done += 1;
      return done;
    },
    view(cityId: number, nowMs: number): CityShareMarketView {
      const list = openOf(cityId);
      let bid = 0n;
      let ask = 0n;
      for (const order of list) {
        if (order.side === "buy") bid += order.shares;
        else ask += order.shares;
      }
      const auction = (side: CityShareSide): AuctionOrder[] =>
        list
          .filter((order) => order.side === side)
          .map((order) => ({
            id: order.id,
            owner: 0,
            price: order.price,
            lots: order.shares,
            seq: order.seq,
          }));
      const preview = matchRound(auction("buy"), auction("sell"), lastPrice.get(cityId));
      return {
        lastPrice: lastPrice.get(cityId),
        roundMs: roundPeriod(deps.rules()),
        nextRoundMs: nextRoundMs(nowMs),
        book: shareBookLevels(
          list.map((order) => ({ side: order.side, price: order.price, lots: order.shares })),
        ),
        expected:
          preview.price === undefined || preview.lots <= 0n
            ? undefined
            : { price: preview.price, shares: preview.lots },
        bidShares: bid,
        askShares: ask,
        rounds: (rounds.get(cityId) ?? []).filter((round) => round.price !== undefined).slice(-ROUNDS_SHOWN),
      };
    },
    /** 에스크로(도시·화폐마다) = 걸린 사기 주문 묶음 합 */
    check(): string[] {
      const want = new Map<string, bigint>();
      for (const list of books.values())
        for (const order of list)
          if (order.side === "buy") {
            const code = cityShareEscrowCode(order.cityId, order.asset);
            want.set(code, (want.get(code) ?? 0n) + lockOf(order));
          }
      const problems: string[] = [];
      const prefix = `escrow:${CITY_SHARE_MARKET_PREFIX}:`;
      for (const account of ledger.accounts()) {
        if (!account.systemCode?.startsWith(prefix)) continue;
        if (account.balance !== (want.get(account.systemCode) ?? 0n))
          problems.push(`city share escrow mismatch ${account.systemCode}`);
        want.delete(account.systemCode);
      }
      for (const [code, amount] of want)
        if (amount !== 0n) problems.push(`city share escrow missing ${code}`);
      return problems;
    },
  };
}

export type CityShareMarket = ReturnType<typeof createCityShareMarket>;
