// 거래창·내 주문·도시 생산 화면 자료(실제 거래소) — docs/adr/2026-11-07-play-flow.md WP4. economyView/services.ts가 시안이 아닐 때 부른다.
// 읽기만 한다(거래소를 새로 만들지 않는다: 아직 쓰지 않은 도시 × 물건은 빈 호가창으로 보인다). 모양 만들기는 시안과 같은 함수(economyView/marketShape.ts).
// - 기준 도시 = 내 사이보그 시작 도시(없으면 내 창고가 있는 첫 도시, 그것도 없으면 가장 작은 도시 ID).
// - 도시 이름 = 도시 자리의 이름(world_cities.name, 팩 도시 이름 — 번역하지 않는다 D-476), 이름 없는 도시만 "#<도시 ID>"(폐허 카드와 같은
//   대체, docs/adr/2026-11-07-play-flow.md "WP12 특산·이름 마무리"). 시야·운임은 아직 없다(모두 지금 값, 운임 없음).
// - 거래소 건물(기획 D-561, docs/adr/2026-11-16-exchange-buildings.md): 팔 수 있는 양 = 그 도시 물자 거래소 건물 창고, 건물이 없으면 안내(exchange null).
// - 화폐(WP6): 값은 그 도시 거래소 화폐(주인 나라 화폐)다. 화면에는 팩 화폐 코드(원장 자산 cur:<코드>의 코드, 기준 통화는 자산 코드 그대로)로 보낸다.
import type {
  MarketDeskView,
  MarketLockerView,
  EconomyOrdersResponse,
  EconomyProductionResponse,
  MarketBookResponse,
  MarketCitiesResponse,
  MarketCityRow,
  MarketItemsResponse,
  MyOrder,
  MyOrderDone,
  ProductionFacility,
} from "@terra/shared/economy";
import type { BookOrder } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { bookLevels, candles, changeBp, recentTrades, tradeStats } from "../economyView/marketShape.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { MarketBook, TradeRecord } from "./books.ts";
import { type ExchangeDirectory, fxExchangeCurrencies } from "./exchangeBuildings.ts";
import { exchangeHolding } from "./exchangeStock.ts";
import { type FxExchangeView, createFxViews, currencyCode } from "./fxViews.ts";
import { EXPIRY_DAYS, ORDER_MAX } from "./service.ts";

const HOUR_MS = 3_600_000;
const DAY = 24 * HOUR_MS;
/** 호가창 봉 길이(30분 [임시], 시안과 같다)·창(24시간) */
export const BOOK_CANDLE_MS = 30 * 60_000;
/** [임시] 2차맵 칸 하나의 거리(m): 지구 크기 행성 F9 칸 ≈ 19.5km ÷ 256칸 */
const CELL_METERS = 76;
/** [임시] 다른 2차맵에 있는 도시까지의 거리(km, 2차맵 한 장 ≈ 20km) */
const OTHER_MAP_KM = 20;

export interface MarketViewSource {
  readonly runtime: NpcRuntime;
  readonly ledger: Ledger;
  readonly ownerOf: (userId: string) => number | undefined;
  /** 사용자의 사이보그 시작 도시(없으면 undefined) */
  readonly homeCityOf: (userId: string) => number | undefined;
  /**
   * 거래소 건물(기획 D-561, docs/adr/2026-11-16-exchange-buildings.md): 그 도시 물자 거래소·배치 유닛 주문 한도. 없으면(시험) 건물 안내 없이 도시 창고·
   * 기본 한도(예전과 같다)
   */
  readonly exchanges?: ExchangeDirectory | undefined;
  /** 건물 ID → 시설 이름(거래소 건물 안내). 없으면 빈 이름 */
  readonly buildingName?:
    | ((buildingId: number) => { readonly ko: string; readonly en: string } | undefined)
    | undefined;
  /** 내 개인 창고(기획 D-571 1943, exchangeDesk.ts). 없으면 칸 없음 */
  readonly locker?: ((ownerId: number, cityId: number, buildingId: number) => MarketLockerView) | undefined;
  /** 내 거래 직무(기획 D-571 1944, exchangeDesk.ts). 없으면 칸 없음 */
  readonly desk?: ((ownerId: number, buildingId: number) => MarketDeskView) | undefined;
}

export interface MarketViews {
  items(
    userId: string,
    bookItems: readonly string[],
    now: number,
  ): Omit<MarketItemsResponse, "generatedAt" | "preview" | "status">;
  cities(
    userId: string,
    item: string,
    now: number,
  ): Omit<MarketCitiesResponse, "generatedAt" | "preview" | "status">;
  /** 없는 도시면 undefined */
  book(
    userId: string,
    item: string,
    cityId: number,
    now: number,
  ): Omit<MarketBookResponse, "generatedAt" | "preview" | "status"> | undefined;
  orders(userId: string, now: number): Omit<EconomyOrdersResponse, "generatedAt" | "preview" | "status">;
  production(userId: string): Omit<EconomyProductionResponse, "generatedAt" | "preview" | "status">;
  /** 환전(나라 화폐 ↔ 기준 통화, WP6 — fxViews.ts) */
  exchange(userId: string, now: number): FxExchangeView;
}

/** 도시 이름(NPC 런타임 도시 자리의 이름), 없으면 "#<도시 ID>" */
export const cityLabel = (places: NpcRuntime["places"], cityId: number): string =>
  places.get(cityId)?.name ?? `#${cityId}`;

/** 창 안 체결(TradeLike 모양) */
function windowTrades(trades: readonly TradeRecord[], from: number): TradeRecord[] {
  return trades.filter((trade) => trade.at >= from);
}

export function createMarketViews(src: MarketViewSource): MarketViews {
  const { runtime, ledger } = src;
  const econ = (): NonNullable<NpcRuntime["economy"]> => {
    if (!runtime.economy) throw new Error("market views need the city economy");
    return runtime.economy;
  };
  const cityIds = (): number[] => [...runtime.world.cities.keys()].toSorted((a, b) => a - b);
  const exchanges = src.exchanges;
  /** 도시 → 그 도시 주인 나라 화폐 */
  const cityCurrency = (cityId: number): string | undefined => {
    const owner = runtime.world.cities.get(cityId)?.owner;
    return owner === undefined ? undefined : runtime.economy?.economy.currencyOf.get(owner);
  };
  const fxViews = createFxViews({
    runtime,
    ledger,
    ownerOf: src.ownerOf,
    ...(exchanges
      ? {
          fxOpen: () => fxExchangeCurrencies(exchanges, cityCurrency),
          fxLimit: (me: number | undefined) =>
            me === undefined ? ORDER_MAX : exchanges.orderLimit(me, "fx"),
        }
      : {}),
  });

  const homeCity = (userId: string, me: number | undefined): number | undefined => {
    const start = src.homeCityOf(userId);
    if (start !== undefined && runtime.world.cities.has(start)) return start;
    if (me !== undefined)
      for (const account of ledger.accounts())
        if (
          account.ownerId === me &&
          account.location !== null &&
          account.balance > 0n &&
          runtime.world.cities.has(account.location)
        )
          return account.location;
    return cityIds()[0];
  };

  /** 내 물건이 있는 도시 창고 위치(원장을 한 번 훑는다) */
  const warehousesOf = (me: number | undefined): Set<number> => {
    const out = new Set<number>();
    if (me === undefined) return out;
    for (const account of ledger.accounts())
      if (account.ownerId === me && account.location !== null && account.balance > 0n)
        out.add(account.location);
    return out;
  };

  const distanceKm = (from: number | undefined, to: number): number => {
    if (from === undefined || from === to) return 0;
    const a = runtime.places.get(from);
    const b = runtime.places.get(to);
    if (!a || !b) return 0;
    if (a.mapKey !== b.mapKey) return OTHER_MAP_KM;
    const dx = a.cellX - b.cellX;
    const dy = a.cellY - b.cellY;
    return Math.max(1, Math.round((Math.sqrt(dx * dx + dy * dy) * CELL_METERS) / 1000));
  };

  const taxOf = (cityId: number): number => {
    const owner = runtime.world.cities.get(cityId)?.owner ?? 0;
    return econ().economy.taxOf.get(owner) ?? 0;
  };
  /** 도시 거래소의 화폐(원장 자산): 만든 거래소면 그 설정, 아니면 도시 주인 나라 화폐 */
  const currencyOf = (cityId: number, book?: MarketBook): string => {
    if (book) return book.market.config.currency;
    const owner = runtime.world.cities.get(cityId)?.owner ?? 0;
    return econ().economy.currencyOf.get(owner) ?? ASSET_CREDIT;
  };

  const orderView = (book: MarketBook, order: BookOrder): MyOrder => {
    const meta = econ().registry.meta(order.id);
    return {
      id: String(order.id),
      item: book.item,
      city: String(book.cityId),
      cityName: cityLabel(runtime.places, book.cityId),
      currency: currencyCode(book.market.config.currency),
      side: order.side,
      type: "limit",
      price: String(order.price),
      qty: String(meta?.qty ?? order.remaining),
      remaining: String(order.remaining),
      placedAt: meta?.placedAtMs ?? 0,
      expiresAt: order.expiresAtMs,
    };
  };

  const limitOf = (me: number | undefined) => {
    const open = me === undefined ? [] : econ().registry.openOf(me);
    // 한도 = 기본 + 물자 거래소 건물 둘레에 선 내 유닛 몫(D-148, exchangeBuildings.ts)
    const max = me === undefined || !exchanges ? ORDER_MAX : exchanges.orderLimit(me, "goods");
    const used = Math.min(max, open.length);
    const recoversAt = open.length < max ? null : Math.min(...open.map((entry) => entry.order.expiresAtMs));
    return { used, max, recoversAt };
  };

  return {
    exchange: (userId, now) => fxViews.exchange(userId, now),
    items(userId, bookItems, now) {
      const me = src.ownerOf(userId);
      const home = homeCity(userId, me);
      const end = (Math.floor(now / HOUR_MS) + 1) * HOUR_MS;
      const cities = cityIds();
      const items = bookItems.map((item) => {
        const asset = `item:${item}`;
        let volume = 0n;
        for (const cityId of cities) {
          const found = econ().registry.existing(cityId, asset);
          if (found) volume += tradeStats(windowTrades(found.trades, now - DAY)).volume;
        }
        const homeBook = home === undefined ? undefined : econ().registry.existing(home, asset);
        const stats = homeBook ? tradeStats(windowTrades(homeBook.trades, now - DAY)) : undefined;
        const last = stats?.last ?? homeBook?.market.lastPrice ?? homeBook?.trades.at(-1)?.price;
        return {
          item,
          cities: cities.length,
          volume: String(volume),
          last: last === undefined ? null : String(last),
          currency: currencyCode(home === undefined ? ASSET_CREDIT : currencyOf(home, homeBook)),
          changeBp: changeBp(stats?.last, stats?.first),
          spark: homeBook
            ? candles(homeBook.trades, end - DAY, end, HOUR_MS).map((candle) => candle.close)
            : [],
        };
      });
      return {
        homeCity: home === undefined ? null : { id: String(home), name: cityLabel(runtime.places, home) },
        items,
      };
    },

    cities(userId, item, now) {
      const me = src.ownerOf(userId);
      const home = homeCity(userId, me);
      const asset = `item:${item}`;
      const warehouses = warehousesOf(me);
      const rows: MarketCityRow[] = cityIds().map((cityId) => {
        const found = econ().registry.existing(cityId, asset);
        const stats = found ? tradeStats(windowTrades(found.trades, now - DAY)) : undefined;
        const last = stats?.last ?? found?.market.lastPrice ?? found?.trades.at(-1)?.price;
        const bid = found?.market.best("buy");
        const ask = found?.market.best("sell");
        return {
          city: String(cityId),
          name: cityLabel(runtime.places, cityId),
          currency: currencyCode(currencyOf(cityId, found)),
          bestBid: bid ? String(bid.price) : null,
          bestAsk: ask ? String(ask.price) : null,
          last: last === undefined ? null : String(last),
          changeBp: changeBp(stats?.last, stats?.first),
          volume: String(stats?.volume ?? 0n),
          distanceKm: distanceKm(home, cityId),
          // [임시] 정규 운송이 아직 없다
          freightPerUnit: null,
          observedAt: now,
          inSight: true,
          hasWarehouse: warehouses.has(cityId),
        };
      });
      // 기준 도시를 맨 앞에(거리 차례)
      rows.sort((a, b) => a.distanceKm - b.distanceKm || Number(a.city) - Number(b.city));
      return { item, rows };
    },

    book(userId, item, cityId, now) {
      if (!runtime.world.cities.has(cityId)) return undefined;
      const me = src.ownerOf(userId);
      const asset = `item:${item}`;
      const found = econ().registry.existing(cityId, asset);
      const day = found ? windowTrades(found.trades, now - DAY) : [];
      const stats = tradeStats(day);
      const end = (Math.floor(now / BOOK_CANDLE_MS) + 1) * BOOK_CANDLE_MS;
      const lot = found?.market.config.lotSize ?? econ().economy.catalog.lotSize.get(asset) ?? 1n;
      const last = stats.last ?? found?.market.lastPrice ?? found?.trades.at(-1)?.price;
      const levels = found ? bookLevels(found.market.orders(), me ?? -1) : { asks: [], bids: [] };
      const currency = currencyOf(cityId, found);
      // 거래소 건물(D-561): 팔 수 있는 양 = 그 건물 창고, 도시 창고 몫은 실어 나를 양으로 따로 보인다(D-564 1628)
      const exchangeId = exchanges?.cityExchange(cityId, "goods");
      const holding = exchanges ? exchangeHolding(cityId, true, exchangeId) : cityId;
      const exchange =
        exchanges === undefined
          ? {}
          : {
              exchange:
                exchangeId === undefined
                  ? null
                  : {
                      buildingId: String(exchangeId),
                      name: src.buildingName?.(exchangeId) ?? { ko: "", en: "" },
                      cityGoods: String(me === undefined ? 0n : ledger.balanceOf(me, asset, cityId) / lot),
                      ...(me !== undefined && src.locker
                        ? { locker: src.locker(me, cityId, exchangeId) }
                        : {}),
                      ...(me !== undefined && src.desk ? { desk: src.desk(me, exchangeId) } : {}),
                    },
              ...(exchangeId === undefined && exchanges.stoppedIn(cityId, "goods")
                ? { exchangeStopped: true }
                : {}),
            };
      return {
        item,
        city: String(cityId),
        cityName: cityLabel(runtime.places, cityId),
        currency: currencyCode(currency),
        taxBp: found?.market.config.taxBp ?? taxOf(cityId),
        ...levels,
        last: last === undefined ? null : String(last),
        changeBp: changeBp(stats.last, stats.first),
        high: stats.high === undefined ? null : String(stats.high),
        low: stats.low === undefined ? null : String(stats.low),
        volume: String(stats.volume),
        trades: found ? recentTrades(found.trades) : [],
        candles: found ? candles(found.trades, end - DAY, end, BOOK_CANDLE_MS) : [],
        candleMs: BOOK_CANDLE_MS,
        // 팔 수 있는 양 = 거래소 건물 창고(기본 단위) ÷ 묶음(버림), 살 수 있는 돈 = 지갑의 이 화폐
        mine: {
          goods: String(me === undefined ? 0n : ledger.balanceOf(me, asset, holding) / lot),
          cash: String(me === undefined ? 0n : ledger.balanceOf(me, currency)),
        },
        limit: limitOf(me),
        ...exchange,
        expiryDays: [...EXPIRY_DAYS],
        observedAt: now,
        inSight: true,
      };
    },

    orders(userId) {
      const me = src.ownerOf(userId);
      if (me === undefined) return { open: [], done: [], limit: limitOf(undefined) };
      const registry = econ().registry;
      const open = registry
        .openOf(me)
        .map((entry) => orderView(entry.book, entry.order))
        .toSorted((a, b) => b.placedAt - a.placedAt);
      const done: MyOrderDone[] = [];
      for (const row of registry.doneOf(me)) {
        const book = registry.bookById(row.marketId);
        if (!book) continue;
        done.push({
          id: String(row.id),
          item: book.item,
          city: String(book.cityId),
          cityName: cityLabel(runtime.places, book.cityId),
          currency: currencyCode(book.market.config.currency),
          side: row.side,
          price: String(row.price),
          qty: String(row.qty),
          filled: String(row.filled),
          status: row.state,
          at: row.atMs,
        });
      }
      return { open, done, limit: limitOf(me) };
    },

    production(userId) {
      const me = src.ownerOf(userId);
      const home = homeCity(userId, me);
      if (home === undefined) return { facilities: [], repeats: [], wages: [] };
      const facilities: ProductionFacility[] = econ()
        .production(home)
        .map((run) => {
          const spec = econ().economy.catalog.facilities.get(run.facility.recipe.facility);
          const running = run.endsAtMs !== null && run.facility.workers > 0;
          return {
            id: run.buildingId === null ? `job_${run.facility.id}` : String(run.buildingId),
            facility: run.facility.recipe.facility,
            place: cityLabel(runtime.places, home),
            level: run.facility.level,
            workers: run.facility.workers,
            slots: (spec?.slotsPerLevel ?? 0) * run.facility.level,
            status: running ? "running" : "idle",
            current:
              running && run.endsAtMs !== null
                ? { recipe: run.facility.recipe.id, startedAt: run.startedAtMs, endsAt: run.endsAtMs }
                : null,
            queue: [],
          };
        });
      return { facilities, repeats: [], wages: [] };
    },
  };
}
