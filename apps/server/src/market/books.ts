// 물자 거래소 모음(서버) — docs/adr/2026-11-07-play-flow.md "WP4 도시 경제·거래소", 경제 코어 ADR 2026-10-31-economy-core.md 4절.
// 호가창·에스크로·체결 정산은 시뮬과 같은 함수(@terra/sim createGoodsMarket)이고, 여기는 서버 몫만 둔다:
// - 도시 × 물건 거래소를 처음 쓸 때 만든다(lazy). 시뮬 경제(Economy.markets)가 이 모음의 도시 표를 그대로 본다(NPC 거래 규칙이 같은 거래소를 쓴다).
//   거래소 ID는 market_books에 남겨 같은 (도시, 물건)이면 늘 같은 ID다(에스크로 계정 escrow:goods:<ID>의 열쇠).
// - 거래소를 바꾸는 호출(걸기·취소·주인 취소·만료·주인 바뀜)마다 앞뒤 걸린 주문을 견줘 주문 줄·체결 줄을 쓰기 대기열에 넣는다(원장 거래와 같은
//   동기 처리 = 같은 커밋). 유저 주문은 끝나도 줄을 남기고(내 주문 기록), NPC 세력 주문은 끝나면 지운다.
// - 체결은 최근 창(TRADE_WINDOW_MS)을 메모리에 둔다(차트·최근 체결·24시간 수치). 체결 알림 듣는 쪽(거래소 게이트웨이)에 알린다.
// - 부팅: 걸린 주문(seq 그대로)과 최근 체결로 거래소를 다시 만든다(createGoodsMarket restore).
// - 화폐(docs/adr/2026-11-07-play-flow.md WP6 나라 화폐): 거래소 줄에 값을 매기는 화폐를 남긴다(비었으면 WP4 시험 화폐). 부팅 때 걸린 주문을
//   남긴 화폐로 되살린 뒤 지금 도시 주인의 화폐(configOf)와 다르면 시뮬 retarget으로 주문을 돌려주고 화폐를 바꾼다(주인이 바뀔 때와 같은 길).
//   화폐가 바뀌면 메모리 체결 창을 비운다(다른 화폐 값을 한 차트에 섞지 않는다). 체결 줄에도 화폐를 남긴다.
// - 거래소 건물 2(기획 D-571, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)"):
//   - 이용료(질문 1948 답 — D-564 1682·D-548·D-160): 체결마다 판 쪽이 총액 × 만분율(설정 칸 exchange_fee_bp)을 그 도시 물자 거래소 건물 금고에 낸다
//     (fee 고리 — 사업장 장부 수입, 소득세 포함). 거래세(국고)와 따로, 체결 거래 바로 뒤 같은 동기 처리.
//   - NPC(질문 1945 답 — D-212·D-564 1626, npcHaul 고리가 있을 때): 그 도시에 거래소 건물이 없으면 NPC 주문을 받지 않고, NPC 물건 자리도 거래소
//     건물 창고다. 팔 물건은 보이지 않는 운반꾼 시간 뒤에 오른다(npcHaul.ts). 런타임 틱(expire)이 닿은 짐을 처리한다.
// - 부팅 손질(줄기 escrow-fix, docs/questions/2026-11-22-escrow-fix.md):
//   - 묶음 크기가 바뀐 뒤 남은 옛 팔 주문: 걸린 팔 주문 줄의 locked(그때 묶은 물건 기본 단위)가 남은 묶음 × 지금 묶음 크기와 다르면, 그 주문은
//     되살리지 않고 locked 그대로 주인 물건 자리로 돌려준 뒤 취소로 끝낸다. 지금 묶음 크기로 되살리면 돌려주기·체결이 묶은 양과 다른 양을 옮겨
//     물건이 생기거나 사라진다(팩 core@137 광석 묶음 1kg·1개 → 10kg 때 "market escrow differs after restore"의 원인).
//   - 에스크로 맞추기(escrowRepair.ts): 위 손질 뒤에도 물건 에스크로 잔고가 걸린 팔 주문 합(남은 묶음 × 묶음 크기)과 다르면 차이를 시스템 계정 reconcile:escrow:<자산>과 맞바꿔
//     맞춘다(남는 것은 그 계정으로, 모자란 것은 그 계정에서 — 누구에게도 주지 않는다 [임시] 질문 2591). 되살리지 않은 거래소(걸린 주문 없음)의 남은
//     잔고도 0으로 맞춘다. 맞춘 뒤에는 차이가 0이라 다시 켜도 아무것도 하지 않는다. 돈 에스크로는 손대지 않는다(경고만).
import {
  TEST_ASSET_CREDIT,
  type BookFill,
  type BookOrder,
  type GoodsMarket,
  type GoodsMarketConfig,
  type LedgerBook,
  type PlaceResult,
  type Side,
  createGoodsMarket,
  goodsEscrowCode,
} from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";
import { exchangeEscrowLocation, exchangeHolding } from "./exchangeStock.ts";
import { type NpcHaulOptions, createNpcHauler } from "./npcHaul.ts";

/** 화폐 칸이 빈 거래소·체결 줄(WP4 판 앱이 쓴 것)의 화폐 */
export const LEGACY_MARKET_CURRENCY = TEST_ASSET_CREDIT;
/** 메모리에 두는 체결 창(차트 24시간 + 여유) */
export const TRADE_WINDOW_MS = 8 * 24 * 3_600_000;
/** 유저마다 메모리에 두는 끝난 주문 수 */
export const DONE_KEEP = 50;

export type DoneState = "filled" | "cancelled" | "expired";

export interface TradeRecord {
  readonly id: number;
  readonly marketId: number;
  readonly at: number;
  readonly price: bigint;
  readonly qty: bigint;
  /** 들어온 주문의 쪽 */
  readonly side: Side;
  readonly makerOrderId: number;
  readonly takerOrderId: number;
  readonly makerOwner: number;
  readonly takerOwner: number;
  /** 값을 매긴 화폐(원장 자산 코드) */
  readonly currency: string;
}

/** 주문 하나의 서버 몫(호가창 BookOrder에 없는 것) */
export interface OrderMeta {
  readonly marketId: number;
  readonly qty: bigint;
  readonly placedAtMs: number;
}

export interface DoneOrder {
  readonly id: number;
  readonly marketId: number;
  readonly ownerId: number;
  readonly side: Side;
  readonly price: bigint;
  readonly qty: bigint;
  readonly filled: bigint;
  readonly state: DoneState;
  readonly atMs: number;
}

export interface MarketBook {
  readonly id: number;
  readonly cityId: number;
  /** 팩 아이템 ID */
  readonly item: string;
  /** 원장 자산 코드(item:<ID>) */
  readonly asset: string;
  readonly market: GoodsMarket;
  /** 최근 체결(오래된 차례) */
  readonly trades: TradeRecord[];
}

export interface FillNotice {
  readonly book: MarketBook;
  readonly trade: TradeRecord;
  /** 체결 뒤 걸린 주문(maker)의 남은 양(다 찼으면 0) */
  readonly makerRemaining: bigint;
}

/** 부팅 때 읽은 거래소 자료(load.ts) */
export interface LoadedMarkets {
  readonly books: readonly {
    readonly id: number;
    readonly cityId: number;
    readonly item: string;
    /** 값을 매기는 화폐(비었으면 LEGACY_MARKET_CURRENCY) */
    readonly currency: string | null;
    readonly createdAtMs: number;
  }[];
  readonly open: readonly LoadedOrder[];
  readonly done: readonly DoneOrder[];
  readonly trades: readonly TradeRecord[];
  readonly maxOrderId: number;
  readonly maxTradeId: number;
  readonly maxBookId: number;
}

export interface LoadedOrder extends OrderMeta {
  readonly order: BookOrder;
  /** 줄에 남긴 지금 묶인 양(market_orders.locked). 팔 쪽이면 묶음 크기가 바뀌었는지 이것으로 안다. 없으면 보지 않는다 */
  readonly locked?: bigint | undefined;
}

/** 묶음 크기가 바뀐 뒤 남아 돌려준 옛 팔 주문 하나(부팅 손질) */
export interface RelottedOrder {
  readonly marketId: number;
  readonly orderId: number;
  readonly owner: number;
  readonly remaining: bigint;
  /** 돌려준 물건(기본 단위 — 줄의 locked) */
  readonly locked: bigint;
  /** 지금 묶음 크기 */
  readonly lot: bigint;
}

export const EMPTY_MARKETS: LoadedMarkets = {
  books: [],
  open: [],
  done: [],
  trades: [],
  maxOrderId: 0,
  maxTradeId: 0,
  maxBookId: 0,
};

export interface MarketRegistryOptions {
  readonly ledger: LedgerBook;
  readonly writer: WorldWriter;
  readonly loaded: LoadedMarkets;
  /** 이 도시 × 자산에 거래소를 둘 수 있나(도시가 있고 호가창 물건) */
  readonly allowed: (cityId: number, asset: string) => boolean;
  /** 새 거래소의 설정(화폐·세율·국고·묶음 크기). id·location·item은 모음이 채운다 */
  readonly configOf: (cityId: number, asset: string) => Omit<GoodsMarketConfig, "id" | "location" | "item">;
  /** 유저 소유 주체인가(아니면 NPC 세력 — 끝난 주문 줄을 지운다) */
  readonly isUser: (ownerId: number) => boolean;
  /**
   * 그 도시 물자 거래소 건물 ID(docs/adr/2026-11-16-exchange-buildings.md — 유저 물건 자리, exchangeStock.ts). 없거나 undefined면 유저 물건도
   * 도시 창고(예전과 같다)
   */
  readonly exchangeOf?: ((cityId: number) => number | undefined) | undefined;
  /**
   * 거래소 이용료(질문 1948 답): 그 도시 이용료 받는 건물·만분율(없으면 이용료 없음)과 내기(판 쪽 지갑 → 그 건물 금고). 없으면 이용료 없음
   */
  readonly fee?:
    | {
        readonly of: (cityId: number) => { readonly buildingId: number; readonly bp: number } | undefined;
        readonly charge: (input: {
          readonly seller: number;
          readonly currency: string;
          readonly amount: bigint;
          readonly buildingId: number;
          readonly atMs: number;
        }) => void;
      }
    | undefined;
  /** NPC 거래소 운반(질문 1945 답, npcHaul.ts — exchangeOf가 함께 있어야 한다). 없으면 NPC는 예전처럼 도시 창고로 바로 거래 */
  readonly npcHaul?: Omit<NpcHaulOptions, "ledger" | "exchangeOf" | "isUser"> | undefined;
  readonly now: () => number;
}

export interface MarketRegistry {
  /** 도시 → 자산 → 거래소(시뮬 Economy.markets로 그대로 쓴다. 도시 표의 get은 없으면 만든다) */
  readonly markets: Map<number, Map<string, GoodsMarket>>;
  /** 그 도시 × 자산 거래소(없으면 만든다. 둘 수 없으면 undefined) */
  book(cityId: number, asset: string): MarketBook | undefined;
  /** 이미 있는 거래소만(만들지 않는다) */
  existing(cityId: number, asset: string): MarketBook | undefined;
  bookById(id: number): MarketBook | undefined;
  /** 만든 거래소 모두 */
  books(): IterableIterator<MarketBook>;
  meta(orderId: number): OrderMeta | undefined;
  /** 그 주인의 끝난 주문(새것 먼저) */
  doneOf(ownerId: number): readonly DoneOrder[];
  /** 걸린 주문을 그 주인 것만 */
  openOf(ownerId: number): { book: MarketBook; order: BookOrder }[];
  /** 도시 표를 둔다(새 도시·복원) */
  ensureCity(cityId: number): void;
  /** 없는 도시(폐허 등)의 거래소: 걸린 주문을 모두 돌려주고 도시 표를 뺀다(부팅 때). 돌려준 주문 수 */
  dropCity(cityId: number, nowMs: number): number;
  /** 체결을 듣는다(돌려준 함수로 그친다) */
  onFill(listener: (notice: FillNotice) => void): () => void;
  /** 만료 시각이 된 주문을 거둔다. 거둔 수 */
  expire(nowMs: number): number;
  /** 에스크로 불변식(모든 거래소) */
  check(): string[];
  /** 부팅 때 묶음 크기가 바뀌어 돌려준 옛 팔 주문(만들 때 한 것 — escrowRepair.ts가 기록에 남긴다) */
  relotted(): readonly RelottedOrder[];
  /** NPC 운반 대기 수(지표, 고리가 없으면 0) */
  npcHaulPending(): number;
}

function lotOf(config: GoodsMarketConfig): bigint {
  return config.lotSize ?? 1n;
}

/** 주문이 지금 에스크로에 묶어 둔 양(팔 쪽 = 남은 묶음 × 묶음 크기, 살 쪽 = 값 × 남은 묶음) */
function lockedOf(config: GoodsMarketConfig, order: BookOrder, remaining: bigint): bigint {
  return order.side === "sell" ? remaining * lotOf(config) : order.price * remaining;
}

export function createMarketRegistry(o: MarketRegistryOptions): MarketRegistry {
  const { ledger, writer, loaded } = o;
  let lastOrderId = loaded.maxOrderId;
  let lastTradeId = loaded.maxTradeId;
  let lastBookId = loaded.maxBookId;
  const nextOrderId = (): number => {
    lastOrderId += 1;
    return lastOrderId;
  };
  /** (도시|물건) → 거래소 ID(만든 적이 있으면 그 ID) */
  const idOf = new Map<string, number>(loaded.books.map((row) => [`${row.cityId}|${row.item}`, row.id]));
  /** 거래소 줄(화폐를 바꿀 때 다시 쓴다) */
  const bookRows = new Map<number, { cityId: number; item: string; createdAtMs: number }>();
  /** 남긴 화폐(쓰지 않던 거래소를 처음 쓸 때도 이 화폐로 시작해 다르면 바꾼다) */
  const storedCurrency = new Map(loaded.books.map((row) => [row.id, row.currency ?? LEGACY_MARKET_CURRENCY]));
  const byId = new Map<number, MarketBook>();
  const metas = new Map<number, OrderMeta>();
  const done = new Map<number, DoneOrder[]>();
  const listeners = new Set<(notice: FillNotice) => void>();
  const markets = new Map<number, Map<string, GoodsMarket>>();
  const exchangeOf = o.exchangeOf;
  const hauler =
    o.npcHaul && exchangeOf
      ? createNpcHauler({ ...o.npcHaul, ledger, exchangeOf, isUser: o.isUser })
      : undefined;

  /** 부팅 때 읽은 걸린 주문의 묶인 양(줄의 locked — 묶음 크기가 바뀐 옛 팔 주문을 찾는다) */
  const restoredLocked = new Map<number, bigint>();
  /** 부팅 때 묶음 크기가 바뀌어 돌려준 옛 팔 주문(escrowRepair.ts가 함께 알린다) */
  const relotted: RelottedOrder[] = [];
  for (const row of loaded.open) {
    metas.set(row.order.id, { marketId: row.marketId, qty: row.qty, placedAtMs: row.placedAtMs });
    if (row.locked !== undefined) restoredLocked.set(row.order.id, row.locked);
  }
  for (const row of loaded.done) {
    const list = done.get(row.ownerId) ?? [];
    list.push(row);
    done.set(row.ownerId, list);
  }
  for (const list of done.values()) {
    list.sort((a, b) => b.atMs - a.atMs || b.id - a.id);
    list.length = Math.min(list.length, DONE_KEEP);
  }

  const writeOpen = (book: MarketBook, order: BookOrder): void => {
    const meta = metas.get(order.id);
    writer.upsert("marketOrders", {
      id: order.id,
      market_id: book.id,
      owner_id: order.owner,
      side: order.side,
      price: order.price,
      qty: meta?.qty ?? order.remaining,
      remaining: order.remaining,
      locked: lockedOf(book.market.config, order, order.remaining),
      seq: order.seq,
      placed_at_ms: meta?.placedAtMs ?? o.now(),
      expires_at_ms: order.expiresAtMs,
      state: "open",
      done_at_ms: null,
    });
  };

  const remember = (row: DoneOrder): void => {
    const list = done.get(row.ownerId) ?? [];
    list.unshift(row);
    if (list.length > DONE_KEEP) list.length = DONE_KEEP;
    done.set(row.ownerId, list);
  };

  /** 끝난 주문: 유저면 줄을 끝난 상태로 남기고, NPC 세력이면 지운다 */
  const writeDone = (
    book: MarketBook,
    order: { id: number; owner: number; side: Side; price: bigint; seq: number; expiresAtMs: number },
    remaining: bigint,
    state: DoneState,
    atMs: number,
  ): void => {
    const meta = metas.get(order.id);
    metas.delete(order.id);
    if (!o.isUser(order.owner)) {
      writer.remove("marketOrders", { id: order.id });
      return;
    }
    const qty = meta?.qty ?? remaining;
    writer.upsert("marketOrders", {
      id: order.id,
      market_id: book.id,
      owner_id: order.owner,
      side: order.side,
      price: order.price,
      qty,
      remaining,
      locked: 0n,
      seq: order.seq,
      placed_at_ms: meta?.placedAtMs ?? atMs,
      expires_at_ms: order.expiresAtMs,
      state,
      done_at_ms: atMs,
    });
    remember({
      id: order.id,
      marketId: book.id,
      ownerId: order.owner,
      side: order.side,
      price: order.price,
      qty,
      filled: qty - remaining,
      state,
      atMs,
    });
  };

  const pushTrade = (book: MarketBook, fill: BookFill, atMs: number, makerRemaining: bigint): void => {
    lastTradeId += 1;
    const trade: TradeRecord = {
      id: lastTradeId,
      marketId: book.id,
      at: atMs,
      price: fill.price,
      qty: fill.qty,
      side: fill.takerSide,
      makerOrderId: fill.makerId,
      takerOrderId: fill.takerId,
      makerOwner: fill.makerOwner,
      takerOwner: fill.takerOwner,
      currency: book.market.config.currency,
    };
    writer.append("marketTrades", {
      id: trade.id,
      market_id: book.id,
      price: trade.price,
      qty: trade.qty,
      taker_side: trade.side,
      maker_order_id: trade.makerOrderId,
      taker_order_id: trade.takerOrderId,
      maker_owner_id: trade.makerOwner,
      taker_owner_id: trade.takerOwner,
      at_ms: atMs,
      currency: trade.currency,
    });
    book.trades.push(trade);
    // 거래소 이용료(1948): 판 쪽이 그 거래소 건물 금고에
    const seller = fill.takerSide === "buy" ? fill.makerOwner : fill.takerOwner;
    const buyer = fill.takerSide === "buy" ? fill.takerOwner : fill.makerOwner;
    const feeAt = o.fee?.of(book.cityId);
    if (feeAt && feeAt.bp > 0) {
      const amount = (trade.price * trade.qty * BigInt(feeAt.bp)) / 10_000n;
      if (amount > 0n)
        o.fee?.charge({
          seller,
          currency: trade.currency,
          amount,
          buildingId: feeAt.buildingId,
          atMs,
        });
    }
    hauler?.touch(buyer, book.cityId, book.asset);
    const cut = atMs - TRADE_WINDOW_MS;
    let drop = 0;
    while (drop < book.trades.length && (book.trades[drop]?.at ?? cut) < cut) drop += 1;
    if (drop > 0) book.trades.splice(0, drop);
    for (const listener of listeners) listener({ book, trade, makerRemaining });
  };

  /** 거래소 하나를 감싼다: 바꾸는 호출마다 앞뒤 걸린 주문을 견줘 저장한다 */
  const wrap = (bookRef: { current?: MarketBook }, inner: GoodsMarket): GoodsMarket => {
    const snapshot = (): Map<number, { order: BookOrder; remaining: bigint }> =>
      new Map(inner.orders().map((order) => [order.id, { order: { ...order }, remaining: order.remaining }]));
    /** 앞(before)과 지금을 견준다. 사라진 주문은 reason으로 끝난다 */
    const sync = (
      before: Map<number, { order: BookOrder; remaining: bigint }>,
      reason: DoneState,
      atMs: number,
    ): void => {
      const book = bookRef.current;
      if (!book) return;
      const now = new Map(inner.orders().map((order) => [order.id, order]));
      for (const order of now.values()) {
        const prev = before.get(order.id);
        if (prev === undefined || prev.remaining !== order.remaining) writeOpen(book, order);
      }
      for (const [id, prev] of before) {
        if (now.has(id)) continue;
        writeDone(book, prev.order, reason === "filled" ? 0n : prev.remaining, reason, atMs);
        // 돌려받은 NPC 물건은 거래소 건물 창고에 있다 — 도시 창고로 돌려보낼 후보
        hauler?.touch(prev.order.owner, book.cityId, book.asset);
      }
    };
    const guarded = <T>(reason: DoneState, atMs: number, run: () => T): T => {
      if (inner.orders().length === 0) return run();
      const before = snapshot();
      const result = run();
      sync(before, reason, atMs);
      return result;
    };
    return {
      get config() {
        return inner.config;
      },
      get lastPrice() {
        return inner.lastPrice;
      },
      get trades() {
        return inner.trades;
      },
      get volume() {
        return inner.volume;
      },
      get taxCollected() {
        return inner.taxCollected;
      },
      place(owner, side, price, rawQty, nowMs, expiresAtMs): PlaceResult {
        const book = bookRef.current;
        let qty = rawQty;
        // NPC(1945): 거래소 건물이 있어야 거래하고, 팔 물건은 거래소 건물 창고에 있는 만큼만 바로 건다(나머지는 운반 뒤)
        if (hauler && exchangeOf && book && !o.isUser(owner)) {
          if (exchangeOf(book.cityId) === undefined) return { ok: false, reason: "insufficient" };
          if (side === "sell") {
            qty = hauler.sell(
              {
                owner,
                cityId: book.cityId,
                asset: book.asset,
                lot: lotOf(inner.config),
                price,
                lots: rawQty,
                expiresAtMs,
              },
              nowMs,
            );
            if (qty <= 0n) return { ok: true, orderId: 0, fills: [] };
          }
        }
        const before = snapshot();
        const result = inner.place(owner, side, price, qty, nowMs, expiresAtMs);
        if (!result.ok || !book) return result;
        metas.set(result.orderId, { marketId: book.id, qty, placedAtMs: nowMs });
        const after = new Map(inner.orders().map((order) => [order.id, order]));
        // 체결: 걸린 주문(maker)의 남은 양은 체결 뒤 값(다 찼으면 0)
        const left = new Map([...before].map(([id, entry]) => [id, entry.remaining]));
        try {
          for (const fill of result.fills) {
            const rem = (left.get(fill.makerId) ?? fill.qty) - fill.qty;
            left.set(fill.makerId, rem);
            pushTrade(book, fill, nowMs, rem);
          }
        } finally {
          // 체결 알림·이용료가 던져도 주문 줄은 이미 넣은 원장 거래(에스크로·체결)와 같은 쓰기 묶음에 쓴다. 안 쓰면 DB의 주문 줄과 에스크로가
          // 어긋나 다시 켤 때 "market escrow differs after restore"가 된다
          sync(before, "filled", nowMs);
          // 들어온 주문이 다 찼으면(걸리지 않음) 끝난 주문으로 남긴다
          if (!after.has(result.orderId)) {
            writeDone(
              book,
              { id: result.orderId, owner, side, price, seq: 0, expiresAtMs },
              0n,
              "filled",
              nowMs,
            );
          }
        }
        return result;
      },
      cancel(orderId, nowMs = o.now()) {
        return guarded("cancelled", nowMs, () => inner.cancel(orderId, nowMs));
      },
      cancelOwner(owner, nowMs) {
        const book = bookRef.current;
        if (book) hauler?.cancel(owner, book.cityId, book.asset);
        return guarded("cancelled", nowMs, () => inner.cancelOwner(owner, nowMs));
      },
      expire(nowMs) {
        return guarded("expired", nowMs, () => inner.expire(nowMs));
      },
      retarget(nowMs, currency, treasuryOwner, taxBp) {
        const before = inner.config.currency;
        guarded("cancelled", nowMs, () => inner.retarget(nowMs, currency, treasuryOwner, taxBp));
        const book = bookRef.current;
        if (!book || before === currency) return;
        // 다른 화폐의 값은 차트에 섞지 않는다. 거래소 줄의 화폐를 바꿔 둔다(부팅 복원이 이 화폐로 주문을 되살린다)
        book.trades.length = 0;
        writeBook(book.id, currency);
      },
      setTax(taxBp) {
        inner.setTax(taxBp);
      },
      orders() {
        return inner.orders();
      },
      best(side) {
        return inner.best(side);
      },
      checkEscrow() {
        return inner.checkEscrow();
      },
    };
  };

  /** 거래소 줄을 쓴다(만들 때·화폐가 바뀔 때) */
  function writeBook(id: number, currency: string): void {
    const row = bookRows.get(id);
    if (!row) return;
    writer.upsert("marketBooks", {
      id,
      city_id: row.cityId,
      item: row.item,
      created_at_ms: row.createdAtMs,
      currency,
    });
  }

  /**
   * 거래소를 만든다. stored = 남긴 화폐(복원할 때, 걸린 주문을 이 화폐로 되살린다). 지금 주인의 화폐와 다르면(둘 수 있는 도시일 때만 —
   * 없는 도시는 dropCity가 남긴 화폐로 돌려준다) 주문을 돌려주고 화폐를 바꾼다
   */
  const create = (
    id: number,
    cityId: number,
    asset: string,
    restore: readonly BookOrder[],
    trades: TradeRecord[],
    stored?: string,
  ): MarketBook => {
    const wanted = o.configOf(cityId, asset);
    const lot = wanted.lotSize ?? 1n;
    // 묶음 크기가 바뀐 뒤 남은 옛 팔 주문(줄의 locked ≠ 남은 묶음 × 지금 묶음 크기)은 되살리지 않고 아래에서 locked 그대로 돌려준다
    const stale = (order: BookOrder): boolean => {
      const locked = restoredLocked.get(order.id);
      return order.side === "sell" && locked !== undefined && locked !== order.remaining * lot;
    };
    const old = restore.filter(stale);
    const kept = old.length === 0 ? restore : restore.filter((order) => !stale(order));
    const config: GoodsMarketConfig = {
      ...wanted,
      currency: stored ?? wanted.currency,
      id,
      // 에스크로 = 그 도시(거래소 금고), 주인 물건 자리 = 유저는 거래소 건물 창고(D-564 1628 — exchangeStock.ts)
      location: exchangeEscrowLocation(cityId),
      // NPC 운반 고리가 있으면 NPC도 거래소 건물 창고(1945 답), 없으면 도시 창고(예전 — 시뮬과 같다)
      holdingOf: (owner) =>
        o.isUser(owner) || hauler
          ? exchangeHolding(cityId, true, o.exchangeOf?.(cityId))
          : exchangeEscrowLocation(cityId),
      item: asset,
    };
    const ref: { current?: MarketBook } = {};
    const market = wrap(ref, createGoodsMarket(config, ledger, nextOrderId, kept));
    const book: MarketBook = {
      id,
      cityId,
      item: asset.slice(5),
      asset,
      market,
      trades: trades.filter((trade) => trade.currency === config.currency),
    };
    ref.current = book;
    byId.set(id, book);
    markets.get(cityId)?.set(asset, market);
    for (const order of old) refundRelotted(book, order, lot);
    if (config.currency !== wanted.currency && o.allowed(cityId, asset))
      market.retarget(o.now(), wanted.currency, wanted.treasuryOwner, wanted.taxBp);
    return book;
  };

  /** 묶음 크기가 바뀐 옛 팔 주문: 묶어 둔 양(locked) 그대로 에스크로 → 주인 물건 자리, 취소로 끝낸다(부팅 때 만들면서) */
  function refundRelotted(book: MarketBook, order: BookOrder, lot: bigint): void {
    const locked = restoredLocked.get(order.id) ?? 0n;
    const atMs = o.now();
    const config = book.market.config;
    if (locked > 0n)
      ledger.post({
        kind: "order_refund",
        atMs,
        entries: [
          {
            account: ledger.systemAccount(goodsEscrowCode(book.id), book.asset, config.location),
            amount: -locked,
          },
          {
            account: ledger.ownerAccount(
              order.owner,
              book.asset,
              config.holdingOf?.(order.owner) ?? config.location,
            ),
            amount: locked,
          },
        ],
      });
    writeDone(book, order, order.remaining, "cancelled", atMs);
    hauler?.touch(order.owner, book.cityId, book.asset);
    relotted.push({
      marketId: book.id,
      orderId: order.id,
      owner: order.owner,
      remaining: order.remaining,
      locked,
      lot,
    });
  }

  const existing = (cityId: number, asset: string): MarketBook | undefined => {
    const id = idOf.get(`${cityId}|${asset.slice(5)}`);
    return id === undefined ? undefined : byId.get(id);
  };

  const book = (cityId: number, asset: string): MarketBook | undefined => {
    const found = existing(cityId, asset);
    if (found) return found;
    if (!asset.startsWith("item:") || !o.allowed(cityId, asset)) return undefined;
    const item = asset.slice(5);
    let id = idOf.get(`${cityId}|${item}`);
    if (id === undefined) {
      lastBookId += 1;
      id = lastBookId;
      idOf.set(`${cityId}|${item}`, id);
      bookRows.set(id, { cityId, item, createdAtMs: o.now() });
      writeBook(id, o.configOf(cityId, asset).currency);
    }
    if (!markets.has(cityId)) markets.set(cityId, cityMap(cityId));
    // 쓰지 않던 옛 거래소는 남긴 화폐로 만든 뒤 다르면 바꾼다(거래소 줄의 화폐를 고쳐 둔다)
    return create(id, cityId, asset, [], [], storedCurrency.get(id));
  };

  /** 도시 표: get은 없으면 만든다(시뮬 NPC 거래 규칙이 도시 × 물건 거래소를 찾을 때) */
  function cityMap(cityId: number): Map<string, GoodsMarket> {
    const map = new Map<string, GoodsMarket>();
    const plainGet = map.get.bind(map);
    map.get = (asset: string): GoodsMarket | undefined => plainGet(asset) ?? book(cityId, asset)?.market;
    return map;
  }

  // 부팅 복원: 걸린 주문·최근 체결이 있는 거래소를 다시 만든다(도시가 없어도 — 아래에서 돌려준다)
  const openByBook = new Map<number, BookOrder[]>();
  for (const row of loaded.open) {
    const list = openByBook.get(row.marketId) ?? [];
    list.push(row.order);
    openByBook.set(row.marketId, list);
  }
  const tradesByBook = new Map<number, TradeRecord[]>();
  for (const trade of loaded.trades) {
    const list = tradesByBook.get(trade.marketId) ?? [];
    list.push(trade);
    tradesByBook.set(trade.marketId, list);
  }
  const restoring = new Set([...openByBook.keys(), ...tradesByBook.keys()]);
  for (const row of loaded.books)
    bookRows.set(row.id, { cityId: row.cityId, item: row.item, createdAtMs: row.createdAtMs });
  for (const row of loaded.books) {
    if (!restoring.has(row.id)) continue;
    if (!markets.has(row.cityId)) markets.set(row.cityId, cityMap(row.cityId));
    create(
      row.id,
      row.cityId,
      `item:${row.item}`,
      openByBook.get(row.id) ?? [],
      (tradesByBook.get(row.id) ?? []).toSorted((a, b) => a.at - b.at || a.id - b.id),
      storedCurrency.get(row.id),
    );
  }

  return {
    markets,
    book,
    existing,
    bookById: (id) => byId.get(id),
    books: () => byId.values(),
    meta: (orderId) => metas.get(orderId),
    doneOf: (ownerId) => done.get(ownerId) ?? [],
    openOf(ownerId) {
      const out: { book: MarketBook; order: BookOrder }[] = [];
      for (const entry of byId.values())
        for (const order of entry.market.orders())
          if (order.owner === ownerId) out.push({ book: entry, order });
      return out;
    },
    ensureCity(cityId) {
      if (!markets.has(cityId)) markets.set(cityId, cityMap(cityId));
      // 이미 만든 그 도시 거래소(복원한 도시)를 다시 잇는다
      for (const entry of byId.values())
        if (entry.cityId === cityId) markets.get(cityId)?.set(entry.asset, entry.market);
    },
    dropCity(cityId, nowMs) {
      let count = 0;
      for (const entry of byId.values()) {
        if (entry.cityId !== cityId) continue;
        const owners = [...new Set(entry.market.orders().map((order) => order.owner))].toSorted(
          (a, b) => a - b,
        );
        for (const owner of owners) count += entry.market.cancelOwner(owner, nowMs);
      }
      markets.delete(cityId);
      return count;
    },
    onFill(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    expire(nowMs) {
      let count = 0;
      for (const entry of byId.values()) {
        const orders = entry.market.orders();
        if (orders.some((order) => order.expiresAtMs <= nowMs)) count += entry.market.expire(nowMs);
      }
      // NPC 운반(1945): 닿은 짐 — 거래소 건물 창고에 오른 팔 물건을 건다(만료가 지났으면 버린다)
      for (const due of hauler?.tick(nowMs, markets.keys()) ?? []) {
        if (due.expiresAtMs <= nowMs) continue;
        book(due.cityId, due.asset)?.market.place(
          due.owner,
          "sell",
          due.price,
          due.lots,
          nowMs,
          due.expiresAtMs,
        );
      }
      return count;
    },
    check() {
      const problems: string[] = [];
      for (const entry of byId.values()) problems.push(...entry.market.checkEscrow());
      return problems;
    },

    npcHaulPending: () => hauler?.pending() ?? 0,
    relotted: () => [...relotted],
  };
}
