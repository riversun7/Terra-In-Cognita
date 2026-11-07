// 환전 화면 자료(실제 환전 시장) — docs/adr/2026-11-07-play-flow.md "WP6 나라 화폐·체결 알림". economyView/services.ts가 시안이 아닐 때 부른다.
// 읽기만 한다. 짝 = 찍는 나라가 있는 나라 화폐 ↔ 기준 통화(서버 시험 화폐).
// - 예상 체결가 = 지금 모인 주문 + 이번 회차에 찍는 나라가 낼 시장 조성 값(시뮬 quoteFx와 같은 식: 지난 환율 ±2%, 가진 것의 1/20)을 같은 동시호가
//   함수(clearCallAuction)로 맞춘 값이다. 시장 조성 값은 회차 때 국고로 다시 정하므로 어림값이다.
// - 다음 회차 = 마지막 회차 + 회차 길이(아직 없으면 경제를 켠 시각 + 회차 길이).
import type {
  EconomyExchangeResponse,
  FxLevel,
  FxMyDone,
  FxMyOrder,
  FxPairView,
} from "@terra/shared/economy";
import { type AuctionOrder, type FxOrder, clearCallAuction } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { changeBp } from "../economyView/marketShape.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { FxBook } from "./fx.ts";
import { ORDER_MAX } from "./service.ts";

/** 보내는 지난 회차 수 */
const FX_HISTORY = 24;
/** 보내는 호가 단계 수(쪽마다) */
const FX_DEPTH = 8;
/** 시뮬 quoteFx와 같은 시장 조성 몫(가진 것의 1/분모)·값(지난 환율의 %) */
const QUOTE_DIVISOR = 20n;
const QUOTE_ASK_PCT = 102n;
const QUOTE_BID_PCT = 98n;
/** 시장 조성 어림 주문의 ID(실제 주문 ID와 겹치지 않는 음수) */
const MAKER_ASK_ID = -1;
const MAKER_BID_ID = -2;

/** 원장 화폐 자산 → 화면 화폐 코드(cur:<코드> → 코드, 기준 통화 등은 그대로) */
export const currencyCode = (asset: string): string => (asset.startsWith("cur:") ? asset.slice(4) : asset);

const pct = (value: bigint, percent: bigint): bigint => {
  const out = (value * percent) / 100n;
  return out > 0n ? out : 1n;
};

/** 같은 값끼리 로트를 합친 단계(살 쪽 높은 값 차례, 팔 쪽 낮은 값 차례) */
function levels(orders: readonly AuctionOrder[], descending: boolean): FxLevel[] {
  const byPrice = new Map<bigint, bigint>();
  for (const order of orders) byPrice.set(order.price, (byPrice.get(order.price) ?? 0n) + order.lots);
  return [...byPrice.keys()]
    .toSorted((a, b) => {
      const ascending = a < b ? -1 : a > b ? 1 : 0;
      return descending ? -ascending : ascending;
    })
    .slice(0, FX_DEPTH)
    .map((price) => ({ price: String(price), lots: String(byPrice.get(price) ?? 0n) }));
}

export interface FxViewSource {
  readonly runtime: NpcRuntime;
  readonly ledger: Ledger;
  readonly ownerOf: (userId: string) => number | undefined;
}

export type FxExchangeView = Omit<EconomyExchangeResponse, "generatedAt" | "preview" | "status">;

export function createFxViews(src: FxViewSource): { exchange(userId: string, now: number): FxExchangeView } {
  const { runtime, ledger } = src;

  /** 이번 회차에 찍는 나라가 낼 시장 조성 값(시뮬 quoteFx와 같은 식) */
  const makerOrders = (book: FxBook): FxOrder[] => {
    const econ = runtime.economy;
    const issuerId = econ?.economy.issuer.get(book.currency);
    const issuer = issuerId === undefined ? undefined : runtime.world.factions.get(issuerId);
    if (!econ || !issuer?.alive) return [];
    const pair = book.market.pair;
    const rate = book.market.lastPrice ?? econ.economy.settings.fxLot;
    const ask = pct(rate, QUOTE_ASK_PCT);
    const bid = pct(rate, QUOTE_BID_PCT);
    const sellLots = ledger.balanceOf(issuer.id, pair.base) / QUOTE_DIVISOR / pair.lotSize;
    const buyLots = ledger.balanceOf(issuer.id, pair.quote) / QUOTE_DIVISOR / bid;
    const out: FxOrder[] = [];
    if (sellLots > 0n)
      out.push({ id: MAKER_ASK_ID, owner: issuer.id, side: "sell", price: ask, lots: sellLots, seq: 0 });
    if (buyLots > 0n)
      out.push({ id: MAKER_BID_ID, owner: issuer.id, side: "buy", price: bid, lots: buyLots, seq: 0 });
    return out;
  };

  const pairView = (book: FxBook, me: number | undefined): FxPairView => {
    const orders = [...makerOrders(book), ...book.market.orders()];
    const buys = orders.filter((order) => order.side === "buy");
    const sells = orders.filter((order) => order.side === "sell");
    const last = book.market.lastPrice;
    const indicative = clearCallAuction(buys, sells, last);
    const history = book.rounds
      .filter((round) => round.price !== undefined)
      .slice(-FX_HISTORY)
      .map((round) => ({ at: round.at, price: String(round.price) }));
    const first = history[0]?.price;
    return {
      currency: currencyCode(book.currency),
      lotSize: String(book.market.pair.lotSize),
      last: last === undefined ? null : String(last),
      indicative: indicative.price === undefined ? null : String(indicative.price),
      indicativeLots: String(indicative.lots),
      changeBp: changeBp(last, first === undefined ? undefined : BigInt(first)),
      buys: levels(buys, true),
      sells: levels(sells, false),
      history,
      balance: String(me === undefined ? 0n : ledger.balanceOf(me, book.currency)),
    };
  };

  return {
    exchange(userId, now) {
      const econ = runtime.economy;
      if (!econ) throw new Error("fx views need the city economy");
      const me = src.ownerOf(userId);
      const base = econ.economy.base;
      const books = [...econ.fx.books()]
        .filter((book) => econ.economy.issuer.has(book.currency) || book.market.orders().length > 0)
        .toSorted((a, b) => a.id - b.id);
      const open: FxMyOrder[] =
        me === undefined
          ? []
          : econ.fx
              .openOf(me)
              .map(({ book, order }) => ({
                id: String(order.id),
                currency: currencyCode(book.currency),
                side: order.side,
                price: String(order.price),
                lots: String(order.lots),
                placedAt: econ.fx.meta(order.id)?.placedAtMs ?? now,
              }))
              .toSorted((a, b) => b.placedAt - a.placedAt);
      const done: FxMyDone[] = [];
      for (const row of me === undefined ? [] : econ.fx.doneOf(me)) {
        const book = econ.fx.bookById(row.pairId);
        if (!book) continue;
        done.push({
          id: String(row.id),
          currency: currencyCode(book.currency),
          side: row.side,
          price: String(row.price),
          lots: String(row.lots),
          filled: String(row.filled),
          clearPrice: row.clearPrice === undefined ? null : String(row.clearPrice),
          status: row.state,
          at: row.atMs,
        });
      }
      const interval = econ.economy.settings.fxEveryMs;
      return {
        base: currencyCode(base),
        baseBalance: String(me === undefined ? 0n : ledger.balanceOf(me, base)),
        intervalMs: interval,
        nextAuctionAt: Math.max(now, econ.nextFxAt()),
        pairs: books.map((book) => pairView(book, me)),
        open,
        done,
        maxOrders: ORDER_MAX,
      };
    },
  };
}
