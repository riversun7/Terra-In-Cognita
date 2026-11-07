// 물자 거래소 명령(서버 권위) — docs/adr/2026-11-07-play-flow.md "WP4 도시 경제·거래소", 경제 코어 ADR 4·5절.
// 거래소·에스크로·체결은 NPC 도시 경제의 거래소 모음(npc/economy.ts → market/books.ts, 시뮬과 같은 createGoodsMarket)이다. 여기는 유저 길만:
// - 주문 넣기: 도시·물건·값·수량·만료를 보고, 소유 주체를 지금까지 정산한 뒤(산출·유지비가 먼저) 그 도시 내 창고(팔기)·지갑(사기)에서 묶는다.
//   지정가는 만료까지 걸고, 시장가는 안전망 값까지 바로 체결한 뒤 남은 양을 거둔다(D-6035). 걸어 둔 주문 수는 ORDER_MAX까지(D-148·D-6034).
// - 취소: 내 걸린 주문만. 거래소 끔(49 N53)이어도 취소는 된다(묶인 것을 돌려받는다).
// - 바뀜(원장 거래·주문 줄·체결 줄)은 같은 동기 처리에서 쓰기 대기열에 들어가고, 커밋 뒤 답한다(S3 U2, 경제 ADR 5절).
// - 체결 알림: 거래소 모음의 체결을 걸린 주문(maker) 주인에게 알린다(게이트웨이가 알림을 켠 연결로 보낸다).
// - 환전(WP6, docs/adr/2026-11-07-play-flow.md "WP6 나라 화폐·체결 알림"): 나라 화폐 ↔ 기준 통화 동시호가(market/fx.ts)에 주문을 낸다. 사기 = 지갑
//   기준 통화, 팔기 = 지갑의 그 화폐를 묶고 다음 회차(1시간)에 한꺼번에 체결, 남은 양은 회차 뒤 돌려받는다. 한 회차에 낼 수 있는 내 주문 수 =
//   ORDER_MAX [임시]. 회차 전에 거둘 수 있다. 거래소 끔(49 N53)이면 내기만 막는다.
import type { FxResultCode, MarketResultCode } from "@terra/protocol";
import { DAY_MS, type Side, type SocietyCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { Settlement } from "../world/settlement.ts";
import type { FillNotice } from "./books.ts";

/** [임시] 걸어 둘 수 있는 주문 수(질문 149 기본안 → D-443 출발값, 경제 화면 시안과 같다). 거래소 유닛 INT·WIS 식은 기획 Step 5 */
export const ORDER_MAX = 10;
/** [임시] 지정가 만료로 고르는 날(기획 잠정 7일, E10) */
export const EXPIRY_DAYS: readonly number[] = [1, 3, 7];
/** DB int8 상한(묶이는 양·체결 총액이 넘으면 받지 않는다) */
const INT8_MAX = 9_223_372_036_854_775_807n;

export type MarketCommandResult =
  | { readonly ok: true; readonly orderId?: number; readonly filled?: string; readonly resting?: string }
  | { readonly ok: false; readonly code: MarketResultCode };

export type FxCommandResult =
  | { readonly ok: true; readonly orderId?: number }
  | { readonly ok: false; readonly code: FxResultCode };

export interface FxPlaceInput {
  /** 팩 화폐 코드(원장 자산 cur:<코드>의 코드) */
  readonly currency: string;
  readonly side: Side;
  readonly price: string;
  readonly lots: string;
}

export interface MarketPlaceInput {
  readonly city: number;
  readonly item: string;
  readonly side: Side;
  readonly kind: "limit" | "market";
  readonly price: string;
  readonly qty: string;
  readonly expiryDays?: number | undefined;
}

export interface MarketService {
  place(userId: string, input: MarketPlaceInput): Promise<MarketCommandResult>;
  cancel(userId: string, orderId: number): Promise<MarketCommandResult>;
  /** 환전 주문 내기(다음 회차에 체결) */
  fxPlace(userId: string, input: FxPlaceInput): Promise<FxCommandResult>;
  /** 회차 전에 내 환전 주문을 거둔다 */
  fxCancel(userId: string, orderId: number): Promise<FxCommandResult>;
  /** 사용자의 소유 주체(없으면 undefined, 만들지 않는다) */
  ownerOf(userId: string): number | undefined;
  /** 소유 주체의 사용자(세력이면 undefined) */
  userOf(ownerId: number): string | undefined;
  /** 체결 알림(걸린 주문 주인, 알림 내용). 돌려준 함수로 그친다 */
  onFill(listener: (ownerId: number, notice: FillNotice) => void): () => void;
}

export interface MarketDeps {
  readonly runtime: NpcRuntime;
  readonly ledger: Ledger;
  readonly settlement: Settlement;
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly writer: WorldWriter;
  readonly rules: () => SocietyCoefficients;
  readonly now: () => number;
}

const fail = (code: MarketResultCode): MarketCommandResult => ({ ok: false, code });
const fxFail = (code: FxResultCode): FxCommandResult => ({ ok: false, code });

export function createMarketService(d: MarketDeps): MarketService | undefined {
  const econ = d.runtime.economy;
  if (!econ) return undefined;
  const { registry, fx } = econ;
  const world = d.runtime.world;

  const commit = async <T>(result: T): Promise<T> => {
    await d.writer.durable();
    return result;
  };

  return {
    ownerOf: (userId) => d.settlement.findOwnerOfUser(userId),
    userOf: (ownerId) => d.owners.get(ownerId)?.userId ?? undefined,
    onFill(listener) {
      return registry.onFill((notice) => listener(notice.trade.makerOwner, notice));
    },

    async place(userId, input) {
      if (d.rules().switches.marketEnabled === 0) return fail("market_paused");
      if (!world.cities.has(input.city)) return fail("unknown_city");
      const asset = `item:${input.item}`;
      const book = registry.book(input.city, asset);
      if (!book) return fail("unknown_item");
      const price = BigInt(input.price);
      const qty = BigInt(input.qty);
      const lot = book.market.config.lotSize ?? 1n;
      if (price * qty > INT8_MAX || qty * lot > INT8_MAX) return fail("invalid_amount");
      const days = input.kind === "limit" ? (input.expiryDays ?? EXPIRY_DAYS.at(-1) ?? 7) : 0;
      if (input.kind === "limit" && !EXPIRY_DAYS.includes(days)) return fail("invalid_amount");
      const at = d.now();
      const me = d.settlement.ownerOfUser(userId, at).id;
      // 잔고를 지금까지 정산한 뒤 본다(직무 산출·유지비가 먼저)
      d.settlement.settleOwner(me, at);
      if (input.kind === "limit" && registry.openOf(me).length >= ORDER_MAX) return fail("order_limit");
      const currency = book.market.config.currency;
      if (input.side === "sell" && d.ledger.balanceOf(me, asset, input.city) < qty * lot)
        return fail("insufficient_goods");
      if (input.side === "buy" && d.ledger.balanceOf(me, currency) < price * qty)
        return fail("insufficient_funds");
      if (input.kind === "market") {
        // 시장가: 안전망 안에 남의 반대쪽 호가가 있어야 한다
        const crosses = book.market.orders().some((order) => {
          if (order.owner === me) return false;
          return input.side === "buy"
            ? order.side === "sell" && order.price <= price
            : order.side === "buy" && order.price >= price;
        });
        if (!crosses) return fail("no_liquidity");
      }
      const expiresAt = input.kind === "limit" ? at + days * DAY_MS : at + 1;
      const result = book.market.place(me, input.side, price, qty, at, expiresAt);
      if (!result.ok) return fail(input.side === "sell" ? "insufficient_goods" : "insufficient_funds");
      let filled = 0n;
      for (const fill of result.fills) filled += fill.qty;
      let resting = book.market.orders().find((order) => order.id === result.orderId)?.remaining ?? 0n;
      // 시장가는 남은 양을 걸지 않는다(돌려준다)
      if (input.kind === "market" && resting > 0n) {
        book.market.cancel(result.orderId, at);
        resting = 0n;
      }
      return commit({ ok: true, orderId: result.orderId, filled: String(filled), resting: String(resting) });
    },

    async cancel(userId, orderId) {
      const meta = registry.meta(orderId);
      const book = meta ? registry.bookById(meta.marketId) : undefined;
      const order = book?.market.orders().find((entry) => entry.id === orderId);
      if (!book || !order) return fail("unknown_order");
      const me = d.settlement.findOwnerOfUser(userId);
      if (me === undefined || order.owner !== me) return fail("not_owner");
      book.market.cancel(orderId, d.now());
      return commit({ ok: true, orderId });
    },

    async fxPlace(userId, input) {
      if (d.rules().switches.marketEnabled === 0) return fxFail("market_paused");
      const book = fx.get(`cur:${input.currency}`);
      if (!book) return fxFail("unknown_currency");
      const price = BigInt(input.price);
      const lots = BigInt(input.lots);
      if (price * lots > INT8_MAX || lots * book.market.pair.lotSize > INT8_MAX)
        return fxFail("invalid_amount");
      const at = d.now();
      const me = d.settlement.ownerOfUser(userId, at).id;
      // 잔고를 지금까지 정산한 뒤 본다(직무 산출·유지비가 먼저)
      d.settlement.settleOwner(me, at);
      if (fx.openOf(me).length >= ORDER_MAX) return fxFail("order_limit");
      const result = book.market.place(me, input.side, price, lots, at);
      if (!result.ok) return fxFail("insufficient_funds");
      return commit({ ok: true, orderId: result.orderId });
    },

    async fxCancel(userId, orderId) {
      const meta = fx.meta(orderId);
      const book = meta ? fx.bookById(meta.pairId) : undefined;
      const order = book?.market.orders().find((entry) => entry.id === orderId);
      if (!book || !order) return fxFail("unknown_order");
      const me = d.settlement.findOwnerOfUser(userId);
      if (me === undefined || order.owner !== me) return fxFail("not_owner");
      book.market.cancel(orderId, d.now());
      return commit({ ok: true });
    },
  };
}
