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
// - 거래소 개인 창고(기획 D-571 1943, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)" — lockers.ts): 사기 주문은 개인 창고에 자리가 있어야
//   받는다(locker_full — 체결되면 들어올 물건 자리). 넓히기(market_locker_expand)는 그 도시 화폐로 한 칸 값을 내고(그 거래소 건물 금고 — 사업장
//   장부 수입 exchange_locker) 칸을 하나 늘린다(locker_max — 위 끝). 바뀜 (질문 2081, 줄기 exchange-3): 창고는 유닛마다 — 크기 = 내 유닛 창고의 합,
//   넓히기는 고른 내 유닛 창고(unitId, 없으면 사이보그 본체 먼저 칸이 남은 유닛 — @terra/shared/exchange defaultLockerUnit)에 한 칸.
import type { FxResultCode, MarketResultCode } from "@terra/protocol";
import { ORDER_BASE, defaultLockerUnit, lockerFits } from "@terra/shared/exchange";
import type { BusinessCore } from "../business/core.ts";
import { DAY_MS, type Side, type SocietyCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import type { FillNotice } from "./books.ts";
import { type ExchangeDirectory, fxExchangeCurrencies } from "./exchangeBuildings.ts";
import { exchangeHolding } from "./exchangeStock.ts";
import { type LockerCoords, lockerUnitsOf, lockerUsedG, ownerLockerG } from "./lockers.ts";

/**
 * [임시] 걸어 둘 수 있는 기본 주문 수(질문 149 기본안 → D-443 출발값, 경제 화면 시안과 같다). 거래소 건물의 내 거래 직무 유닛(D-571 1944) INT·WIS가 한도를 더한다
 * (D-148 — @terra/shared/exchange orderLimit, exchangeBuildings.ts)
 */
export const ORDER_MAX = ORDER_BASE;
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
  /** 그 도시 거래소의 내 유닛 개인 창고를 한 칸 넓힌다(기획 D-571 1943, 질문 2081 — unitId가 없으면 사이보그 본체 먼저) */
  lockerExpand(userId: string, cityId: number, unitId?: number): Promise<MarketCommandResult>;
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
  /**
   * 거래소 건물(기획 D-561, docs/adr/2026-11-16-exchange-buildings.md): 물자 주문은 그 도시 물자 거래소 건물이 있어야 하고(팔 물건 = 그 건물 창고),
   * 환전은 그 화폐 나라 도시에 외환 거래소가 있어야 한다. 주문 한도는 그 종류 거래소의 배치 유닛 몫을 더한다(D-148). 없으면(시험) 건물을 보지 않고
   * 예전처럼 도시 창고·기본 한도
   */
  readonly exchanges?: ExchangeDirectory | undefined;
  /** 자산 한 기본 단위 무게(g) — 개인 창고(D-571 1943). 없으면 개인 창고 상한을 보지 않는다 */
  readonly weightOf?: ((asset: string) => bigint) | undefined;
  /** 2차맵(개인 창고를 받는 내 유닛 — 질문 2081). 없으면 개인 창고 상한을 보지 않고 넓히기는 busy */
  readonly maps?: ReadonlyMap<number, SecondMap> | undefined;
  /** 좌표 유닛(개인 창고 크기 — 어디에 있든 모든 유닛, lockers.ts). 없으면 띄운 2차맵만 */
  readonly coords?: (() => LockerCoords | undefined) | undefined;
  /** 사업장 장부(넓히기 값 → 그 거래소 건물 금고, D-548). 없으면 넓히기는 busy */
  readonly business?: Pick<BusinessCore, "receive"> | undefined;
}

const fail = (code: MarketResultCode): MarketCommandResult => ({ ok: false, code });
const fxFail = (code: FxResultCode): FxCommandResult => ({ ok: false, code });

export function createMarketService(d: MarketDeps): MarketService | undefined {
  const econ = d.runtime.economy;
  if (!econ) return undefined;
  const { registry, fx } = econ;
  const world = d.runtime.world;

  /** 그 화폐(원장 자산)를 쓰는 나라의 도시에 외환 거래소 건물이 있나 */
  const fxOpen = (currency: string): boolean =>
    d.exchanges !== undefined &&
    fxExchangeCurrencies(d.exchanges, (cityId) => {
      const owner = world.cities.get(cityId)?.owner;
      return owner === undefined ? undefined : econ.economy.currencyOf.get(owner);
    }).has(currency);

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
      // 거래소 건물(D-561): 그 도시 물자 거래소가 없으면 주문을 받지 않는다(거두기는 된다)
      const exchange = d.exchanges?.cityExchange(input.city, "goods");
      if (d.exchanges && exchange === undefined) return fail("no_exchange");
      const limit = d.exchanges?.orderLimit(me, "goods") ?? ORDER_MAX;
      if (input.kind === "limit" && registry.openOf(me).length >= limit) return fail("order_limit");
      const currency = book.market.config.currency;
      // 팔 물건은 거래소 건물로 실어 나른 것만(D-564 1628 — exchangeStock.ts, 그 건물 창고)
      if (
        input.side === "sell" &&
        d.ledger.balanceOf(me, asset, exchangeHolding(input.city, true, exchange)) < qty * lot
      )
        return fail("insufficient_goods");
      if (input.side === "buy" && d.ledger.balanceOf(me, currency) < price * qty)
        return fail("insufficient_funds");
      // 개인 창고(D-571 1943): 산 물건이 들어올 자리(쓰는 무게 = 창고 물건 + 걸린 내 주문 남은 양)
      if (input.side === "buy" && exchange !== undefined && d.weightOf && d.maps) {
        const add = qty * lot * d.weightOf(asset);
        const used = lockerUsedG({
          ledger: d.ledger,
          registry,
          weightOf: d.weightOf,
          ownerId: me,
          cityId: input.city,
          exchangeBuildingId: exchange,
        });
        const capacity = ownerLockerG(
          d.rules().business,
          lockerUnitsOf(d.maps, econ.lockers, me, input.city, d.coords?.()),
        );
        if (!lockerFits(used, add, capacity)) return fail("locker_full");
      }
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
      // 외환 거래소(D-561): 그 화폐를 쓰는 나라의 도시에 외환 거래소 건물이 있어야 한다
      if (d.exchanges && !fxOpen(book.market.pair.base)) return fxFail("no_exchange");
      const limit = d.exchanges?.orderLimit(me, "fx") ?? ORDER_MAX;
      if (fx.openOf(me).length >= limit) return fxFail("order_limit");
      const result = book.market.place(me, input.side, price, lots, at);
      if (!result.ok) return fxFail("insufficient_funds");
      return commit({ ok: true, orderId: result.orderId });
    },

    async lockerExpand(userId, cityId, unitId) {
      if (!world.cities.has(cityId)) return fail("unknown_city");
      const exchange = d.exchanges?.cityExchange(cityId, "goods");
      if (exchange === undefined) return fail("no_exchange");
      if (!d.business || !d.maps) return fail("busy");
      const rules = d.rules().business;
      const at = d.now();
      const me = d.settlement.ownerOfUser(userId, at).id;
      d.settlement.settleOwner(me, at);
      // 넓힐 유닛 창고: 고른 내 유닛, 없으면 사이보그 본체 먼저 칸이 남은 유닛(질문 2081)
      const maxSteps = Math.max(0, Math.floor(rules.exchangeLockerMaxSteps));
      const units = lockerUnitsOf(d.maps, econ.lockers, me, cityId, d.coords?.());
      const target = unitId ?? defaultLockerUnit(units, maxSteps);
      const unit = units.find((entry) => entry.unitId === target);
      if (unit === undefined)
        return fail(unitId === undefined && units.length > 0 ? "locker_max" : "unknown_unit");
      const steps = unit.steps;
      if (steps >= maxSteps) return fail("locker_max");
      const owner = world.cities.get(cityId)?.owner;
      const currency =
        (owner === undefined ? undefined : econ.economy.currencyOf.get(owner)) ?? econ.economy.base;
      const price = BigInt(Math.max(0, Math.floor(rules.exchangeLockerStepPrice)));
      if (d.ledger.balanceOf(me, currency) < price) return fail("insufficient_funds");
      if (
        price > 0n &&
        !d.business.receive({
          from: d.ledger.ownerAccount(me, currency),
          buildingId: exchange,
          asset: currency,
          amount: price,
          kind: "exchange_locker",
          atMs: at,
        })
      )
        return fail("no_exchange");
      econ.lockers.setSteps(cityId, unit.unitId, steps + 1, at);
      return commit({ ok: true });
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
