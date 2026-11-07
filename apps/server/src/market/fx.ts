// 환전 시장 모음(서버) — docs/adr/2026-11-07-play-flow.md "WP6 나라 화폐·체결 알림", 경제 코어 ADR 2026-10-31-economy-core.md 5절.
// 동시호가·에스크로·회차 정산은 시뮬과 같은 함수(@terra/sim createFxMarket)이고, 여기는 서버 몫만 둔다:
// - 짝 = (나라 화폐, 기준 통화). 짝 ID는 fx_pairs에 남겨 같은 화폐면 늘 같은 ID다(에스크로 계정 escrow:fx:<ID>:base·quote의 열쇠).
//   시뮬 경제(Economy.fx)가 이 모음의 표를 그대로 본다(발행 나라 시장 조성 quoteFx·NPC 환전 requestCurrency·회차 onFx가 같은 시장을 쓴다).
// - 시장을 바꾸는 호출(내기·거두기·회차)마다 주문 줄(fx_orders)·회차 줄(fx_rounds, 추가만)을 쓰기 대기열에 넣는다(원장 거래와 같은 동기 처리 =
//   같은 커밋). 유저 주문은 회차가 끝나도 줄을 남기고(체결 로트·체결가, 내 환전 기록), NPC 세력 주문은 지운다(회차마다 다시 낸다).
// - 부팅: 걸린 주문(seq 그대로)·지난 체결가로 시장을 다시 만든다(createFxMarket restore). 걸린 주문은 다음 회차에 그대로 체결된다.
import {
  type FxMarket,
  type FxOrder,
  type FxPlaceResult,
  type LedgerBook,
  type Side,
  createFxMarket,
} from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 메모리에 두는 회차 창(지난 24회차 차트 + 여유) */
export const FX_ROUND_WINDOW_MS = 8 * 24 * 3_600_000;
/** 유저마다 메모리에 두는 끝난 환전 주문 수 */
export const FX_DONE_KEEP = 50;

export type FxDoneState = "done" | "cancelled";

export interface FxRoundRecord {
  readonly id: number;
  readonly pairId: number;
  readonly at: number;
  /** 체결가(로트당 기준 통화). 체결이 없었으면 undefined */
  readonly price: bigint | undefined;
  readonly lots: bigint;
}

export interface FxDoneOrder {
  readonly id: number;
  readonly pairId: number;
  readonly ownerId: number;
  readonly side: Side;
  readonly price: bigint;
  readonly lots: bigint;
  readonly filled: bigint;
  /** 그 회차 체결가(없으면 undefined) */
  readonly clearPrice: bigint | undefined;
  readonly state: FxDoneState;
  readonly atMs: number;
}

export interface FxBook {
  readonly id: number;
  /** 사고파는 화폐(원장 자산 코드 cur:<코드>) */
  readonly currency: string;
  readonly market: FxMarket;
  /** 최근 회차(오래된 차례) */
  readonly rounds: FxRoundRecord[];
}

/** 부팅 때 읽은 환전 자료(load.ts loadFx) */
export interface LoadedFx {
  readonly pairs: readonly { readonly id: number; readonly currency: string; readonly createdAtMs: number }[];
  readonly open: readonly { readonly pairId: number; readonly placedAtMs: number; readonly order: FxOrder }[];
  readonly done: readonly FxDoneOrder[];
  readonly rounds: readonly FxRoundRecord[];
  /** 짝마다 마지막 체결가(창 밖이어도) */
  readonly lastPrice: ReadonlyMap<number, bigint>;
  readonly maxOrderId: number;
  readonly maxRoundId: number;
  readonly maxPairId: number;
}

export const EMPTY_FX: LoadedFx = {
  pairs: [],
  open: [],
  done: [],
  rounds: [],
  lastPrice: new Map(),
  maxOrderId: 0,
  maxRoundId: 0,
  maxPairId: 0,
};

export interface FxRegistryOptions {
  readonly ledger: LedgerBook;
  readonly writer: WorldWriter;
  readonly loaded: LoadedFx;
  /** 기준 통화(원장 자산 코드) */
  readonly base: string;
  /** 로트 크기(화폐 최소 단위) */
  readonly lotSize: bigint;
  /** 유저 소유 주체인가(아니면 NPC 세력 — 끝난 주문 줄을 지운다) */
  readonly isUser: (ownerId: number) => boolean;
  readonly now: () => number;
}

export interface FxRegistry {
  /** 화폐 → 환전 시장(시뮬 Economy.fx로 그대로 쓴다) */
  readonly markets: Map<string, FxMarket>;
  /** 그 화폐의 짝(없으면 만든다. 기준 통화면 undefined) */
  ensure(currency: string): FxBook | undefined;
  get(currency: string): FxBook | undefined;
  bookById(id: number): FxBook | undefined;
  books(): IterableIterator<FxBook>;
  /** 걸린 주문의 서버 몫(짝·낸 시각) */
  meta(orderId: number): { readonly pairId: number; readonly placedAtMs: number } | undefined;
  openOf(ownerId: number): { book: FxBook; order: FxOrder }[];
  doneOf(ownerId: number): readonly FxDoneOrder[];
  /** 마지막 회차 시각(아직 없으면 undefined) */
  lastRunAt(): number | undefined;
  check(): string[];
}

const lockOf = (order: { side: Side; price: bigint; lots: bigint }, lotSize: bigint): bigint =>
  order.side === "buy" ? order.price * order.lots : order.lots * lotSize;

export function createFxRegistry(o: FxRegistryOptions): FxRegistry {
  const { ledger, writer, loaded } = o;
  let lastOrderId = loaded.maxOrderId;
  let lastRoundId = loaded.maxRoundId;
  let lastPairId = loaded.maxPairId;
  let lastRun: number | undefined;
  const nextOrderId = (): number => {
    lastOrderId += 1;
    return lastOrderId;
  };
  const idOf = new Map(loaded.pairs.map((row) => [row.currency, row.id]));
  const byId = new Map<number, FxBook>();
  const byCurrency = new Map<string, FxBook>();
  const markets = new Map<string, FxMarket>();
  const metas = new Map<number, { pairId: number; placedAtMs: number }>();
  const done = new Map<number, FxDoneOrder[]>();

  for (const row of loaded.open) metas.set(row.order.id, { pairId: row.pairId, placedAtMs: row.placedAtMs });
  for (const row of loaded.done) {
    const list = done.get(row.ownerId) ?? [];
    list.push(row);
    done.set(row.ownerId, list);
  }
  for (const list of done.values()) {
    list.sort((a, b) => b.atMs - a.atMs || b.id - a.id);
    list.length = Math.min(list.length, FX_DONE_KEEP);
  }

  const writeOpen = (book: FxBook, order: FxOrder, placedAtMs: number): void => {
    writer.upsert("fxOrders", {
      id: order.id,
      pair_id: book.id,
      owner_id: order.owner,
      side: order.side,
      price: order.price,
      lots: order.lots,
      locked: lockOf(order, o.lotSize),
      seq: order.seq,
      placed_at_ms: placedAtMs,
      state: "open",
      filled_lots: 0n,
      clear_price: null,
      done_at_ms: null,
    });
  };

  /** 끝난 주문: 유저면 줄을 끝난 상태로 남기고, NPC 세력이면 지운다 */
  const writeDone = (
    book: FxBook,
    order: FxOrder,
    state: FxDoneState,
    filled: bigint,
    clearPrice: bigint | undefined,
    atMs: number,
  ): void => {
    const meta = metas.get(order.id);
    metas.delete(order.id);
    if (!o.isUser(order.owner)) {
      writer.remove("fxOrders", { id: order.id });
      return;
    }
    writer.upsert("fxOrders", {
      id: order.id,
      pair_id: book.id,
      owner_id: order.owner,
      side: order.side,
      price: order.price,
      lots: order.lots,
      locked: 0n,
      seq: order.seq,
      placed_at_ms: meta?.placedAtMs ?? atMs,
      state,
      filled_lots: filled,
      clear_price: clearPrice ?? null,
      done_at_ms: atMs,
    });
    const list = done.get(order.owner) ?? [];
    list.unshift({
      id: order.id,
      pairId: book.id,
      ownerId: order.owner,
      side: order.side,
      price: order.price,
      lots: order.lots,
      filled,
      clearPrice,
      state,
      atMs,
    });
    if (list.length > FX_DONE_KEEP) list.length = FX_DONE_KEEP;
    done.set(order.owner, list);
  };

  /** 시장 하나를 감싼다: 바꾸는 호출마다 주문 줄·회차 줄을 쓴다 */
  const wrap = (bookRef: { current?: FxBook }, inner: FxMarket): FxMarket => ({
    get pair() {
      return inner.pair;
    },
    get lastPrice() {
      return inner.lastPrice;
    },
    get volumeLots() {
      return inner.volumeLots;
    },
    place(owner, side, price, lots, nowMs): FxPlaceResult {
      const result = inner.place(owner, side, price, lots, nowMs);
      const book = bookRef.current;
      if (!result.ok || !book) return result;
      const order = inner.orders().find((entry) => entry.id === result.orderId);
      metas.set(result.orderId, { pairId: book.id, placedAtMs: nowMs });
      if (order) writeOpen(book, order, nowMs);
      return result;
    },
    run(nowMs) {
      const book = bookRef.current;
      const before = [...inner.orders()];
      const result = inner.run(nowMs);
      lastRun = nowMs;
      if (!book) return result;
      for (const order of before)
        writeDone(book, order, "done", result.fills.get(order.id) ?? 0n, result.price, nowMs);
      lastRoundId += 1;
      const round: FxRoundRecord = {
        id: lastRoundId,
        pairId: book.id,
        at: nowMs,
        price: result.price,
        lots: result.lots,
      };
      writer.append("fxRounds", {
        id: round.id,
        pair_id: book.id,
        at_ms: nowMs,
        price: result.price ?? null,
        lots: result.lots,
      });
      book.rounds.push(round);
      const cut = nowMs - FX_ROUND_WINDOW_MS;
      let drop = 0;
      while (drop < book.rounds.length && (book.rounds[drop]?.at ?? cut) < cut) drop += 1;
      if (drop > 0) book.rounds.splice(0, drop);
      return result;
    },
    cancel(orderId, nowMs) {
      const book = bookRef.current;
      const order = inner.orders().find((entry) => entry.id === orderId);
      const ok = inner.cancel(orderId, nowMs);
      if (ok && book && order) writeDone(book, order, "cancelled", 0n, undefined, nowMs);
      return ok;
    },
    orders() {
      return inner.orders();
    },
    checkEscrow() {
      return inner.checkEscrow();
    },
  });

  const create = (
    id: number,
    currency: string,
    restore: readonly FxOrder[],
    rounds: FxRoundRecord[],
  ): FxBook => {
    const ref: { current?: FxBook } = {};
    const market = wrap(
      ref,
      createFxMarket({ id, base: currency, quote: o.base, lotSize: o.lotSize }, ledger, nextOrderId, {
        orders: restore,
        lastPrice: loaded.lastPrice.get(id),
      }),
    );
    const book: FxBook = { id, currency, market, rounds };
    ref.current = book;
    byId.set(id, book);
    byCurrency.set(currency, book);
    markets.set(currency, market);
    return book;
  };

  const ensure = (currency: string): FxBook | undefined => {
    if (currency === o.base) return undefined;
    const found = byCurrency.get(currency);
    if (found) return found;
    let id = idOf.get(currency);
    if (id === undefined) {
      lastPairId += 1;
      id = lastPairId;
      idOf.set(currency, id);
      writer.upsert("fxPairs", { id, currency, created_at_ms: o.now() });
    }
    return create(id, currency, [], []);
  };

  // 부팅 복원: 걸린 주문이 있는 짝은 지금 발행 나라가 없어도 다시 만든다(에스크로를 되살려 다음 회차에 체결·돌려준다)
  const openByPair = new Map<number, FxOrder[]>();
  for (const row of loaded.open) {
    const list = openByPair.get(row.pairId) ?? [];
    list.push(row.order);
    openByPair.set(row.pairId, list);
  }
  const roundsByPair = new Map<number, FxRoundRecord[]>();
  for (const round of loaded.rounds) {
    const list = roundsByPair.get(round.pairId) ?? [];
    list.push(round);
    roundsByPair.set(round.pairId, list);
  }
  for (const row of loaded.pairs) {
    if (!openByPair.has(row.id)) continue;
    create(
      row.id,
      row.currency,
      openByPair.get(row.id) ?? [],
      (roundsByPair.get(row.id) ?? []).toSorted((a, b) => a.at - b.at || a.id - b.id),
    );
  }
  // 걸린 주문이 없는 짝은 처음 쓸 때(ensure) 회차 기록과 함께 만든다
  const createLater = new Map(loaded.pairs.map((row) => [row.id, row]));

  return {
    markets,
    ensure(currency) {
      const found = byCurrency.get(currency);
      if (found) return found;
      const id = idOf.get(currency);
      const row = id === undefined ? undefined : createLater.get(id);
      if (row && id !== undefined)
        return create(
          id,
          currency,
          [],
          (roundsByPair.get(id) ?? []).toSorted((a, b) => a.at - b.at || a.id - b.id),
        );
      return ensure(currency);
    },
    get: (currency) => byCurrency.get(currency),
    bookById: (id) => byId.get(id),
    books: () => byId.values(),
    meta: (orderId) => metas.get(orderId),
    openOf(ownerId) {
      const out: { book: FxBook; order: FxOrder }[] = [];
      for (const book of byId.values())
        for (const order of book.market.orders()) if (order.owner === ownerId) out.push({ book, order });
      return out;
    },
    doneOf: (ownerId) => done.get(ownerId) ?? [],
    lastRunAt: () => lastRun,
    check() {
      const problems: string[] = [];
      for (const book of byId.values()) problems.push(...book.market.checkEscrow());
      return problems;
    },
  };
}
