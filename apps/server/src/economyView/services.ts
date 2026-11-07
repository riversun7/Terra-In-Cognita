// 경제 화면 자료 — tRPC economy.*(조회만, ADR 37 끝 "구현하며 정한 것 (경제·거래창 화면)").
// - 실제 자료: 팩 목록(economy.catalog), 로그인한 본인의 원장 잔고(economy.holdings, 월드 원장 메모리 장부를 읽기만 한다),
//   물자 거래소(거래 물건·도시별 값·호가창·체결·봉·내 주문)와 내 기준 도시의 생산(NPC 도시 경제, docs/adr/2026-11-07-play-flow.md WP4 —
//   market/views.ts), 환전(나라 화폐 ↔ 기준 통화, WP6 — market/fxViews.ts). 거래소·생산·환전은 NPC 사회 런타임이 도시 경제를 돌릴 때만 ready다.
// - 시안 자료(preview, 권한 home: preview를 프로시저가 본 뒤): 창고·생산·거래창·내 주문·환전(previewWorld·Market·Exchange·Production).
// - 시안이 아니면 서버가 아직 돌리지 않는 시스템(도시 경제가 없는 세계의 거래소·생산·환전)은 status "not_ready"와 빈 목록이다
//   (지어내지 않는다, [결정 2]).
// 게임 상태를 바꾸지 않는다(주문·취소 명령은 WebSocket market_place·market_cancel, packages/protocol/src/market.ts).
import type {
  EconomyCatalogResponse,
  EconomyExchangeResponse,
  EconomyHoldingsResponse,
  EconomyOrdersResponse,
  EconomyProductionResponse,
  HoldingLine,
  HoldingPlace,
  MarketBookResponse,
  MarketCitiesResponse,
  MarketCityRow,
  MarketItemsResponse,
  MyOrder,
  MyOrderDone,
} from "@terra/shared/economy";
import { placeKey, placeOfLocation } from "@terra/shared/goodsPlaces";
import type { MarketViews } from "../market/views.ts";
import { reasonedError } from "../trpc/init.ts";
import type { EconomyQuery, EconomyServices, Viewer } from "../trpc/context.ts";
import { bookLevels, candles, changeBp, recentTrades, tradeStats } from "./marketShape.ts";
import { FX_INTERVAL_MS, nextAuctionAt, previewFxPairs } from "./previewExchange.ts";
import {
  PREVIEW_BUCKET_MS,
  PREVIEW_CANDLE_MS,
  PREVIEW_MY_PLANS,
  PREVIEW_WINDOW_BUCKETS,
  type PreviewMarketState,
  bucketOf,
  mix32,
  simulatePreviewMarket,
} from "./previewMarket.ts";
import { previewProduction } from "./previewProduction.ts";
import {
  PREVIEW_CITIES,
  PREVIEW_ME,
  type PreviewCity,
  cityCurrency,
  cityTaxBp,
  previewStartPrice,
  previewCash,
  previewGoods,
  lotSizeOfItem,
  previewPlaces,
  previewWallet,
  tradesOnBook,
} from "./previewWorld.ts";

/** 원장 계정 한 줄(읽기만) */
export interface EconomyAccountRow {
  readonly asset: string;
  readonly location: number | null;
  readonly balance: bigint;
}

/** 월드 원장 읽기(월드가 DB와 함께 켜졌을 때만) */
export interface EconomyWorldSource {
  /** 그 사용자의 소유 주체(없으면 undefined) */
  ownerOf(userId: string): number | undefined;
  /** 그 주체의 계정(잔고 포함) */
  accountsOf(ownerId: number): readonly EconomyAccountRow[];
  /** 실제 거래소·도시 생산 화면 자료(도시 경제가 돌 때만) */
  readonly market?: (() => MarketViews | undefined) | undefined;
  /** 도시 이름(팩 도시 이름, 번역하지 않는다 D-476 — NPC 런타임 도시 자리). 없거나 이름 없는 도시는 undefined */
  readonly cityName?: ((cityId: number) => string | undefined) | undefined;
  /** 이름 있는 도시 모두(도시 ID 차례) */
  readonly cityNames?: (() => readonly { readonly id: number; readonly name: string }[]) | undefined;
}

/** [임시] 남은 주문 한도(D-148·D-6034). 거래소 유닛 INT·WIS 식은 기획 Step 5 */
const PREVIEW_ORDER_MAX = 10;
/** [임시] 지정가 만료로 고르는 날(기획 잠정 7일, E10) */
const EXPIRY_DAYS = [1, 3, 7] as const;
/** 시험 화폐 자산(S3 시험 자원 정산). 위치 없는 화폐로 본다 */
const TEST_CREDIT_ASSETS = new Set(["s3_test_credit"]);

/** 원장 자산 → 보유 한 줄 */
function holdingLine(row: EconomyAccountRow): HoldingLine {
  const item = row.asset.startsWith("item:") ? row.asset.slice(5) : null;
  const currency = row.asset.startsWith("cur:") ? row.asset.slice(4) : null;
  return { asset: row.asset, item, currency, qty: String(row.balance), locked: "0", spoilsAt: null };
}

/** 실제 원장 계정 → 지갑·곳(잔고 0은 뺀다). 도시 창고 곳의 이름 = 도시 이름(cityName, 없으면 null — 화면이 "창고 #ID") */
export function holdingsFromAccounts(
  rows: readonly EconomyAccountRow[],
  cityName: (cityId: number) => string | undefined = () => undefined,
): {
  wallet: HoldingLine[];
  places: HoldingPlace[];
} {
  const wallet: HoldingLine[] = [];
  const byPlace = new Map<string, { kind: HoldingPlace["kind"]; lines: HoldingLine[] }>();
  for (const row of rows) {
    if (row.balance <= 0n) continue;
    const line = holdingLine(row);
    if (row.location === null && (line.currency !== null || TEST_CREDIT_ASSETS.has(row.asset))) {
      wallet.push(line);
      continue;
    }
    // 위치 없음 = 장부에만 있는 자산, 음수 = 유닛이 실은 화물(−유닛 ID, R3 ADR 8절), 양수 = 도시 창고 위치,
    // 건물 창고 위치(@terra/shared/goodsPlaces, 창고 시설·임대 몫)
    const where = placeOfLocation(row.location);
    const id = where.kind === "city" ? String(where.id) : placeKey(where);
    const kind: HoldingPlace["kind"] = where.kind === "city" ? "warehouse" : where.kind;
    const place = byPlace.get(id) ?? { kind, lines: [] };
    place.lines.push(line);
    byPlace.set(id, place);
  }
  const places = [...byPlace.entries()].map(([id, place]) => ({
    id,
    kind: place.kind,
    name: place.kind === "warehouse" ? (cityName(Number(id)) ?? null) : null,
    store: null,
    capacity: null,
    lines: place.lines,
  }));
  return { wallet, places };
}

function head(query: EconomyQuery, ready: boolean) {
  return { generatedAt: query.now, preview: query.preview, status: ready ? "ready" : "not_ready" } as const;
}

/**
 * catalog: 경제 목록 또는 그 접근자(그 세계의 실효 아이템, 아이템 편집기 덮어쓰기가 바로 든다 — docs/adr/2026-11-01-item-editor.md 4절).
 * 요청마다 지금 목록을 읽고, 목록이 바뀌면 호가창 물건·시안 시장 캐시를 새로 만든다
 */
export function createEconomyServices(options: {
  catalog: EconomyCatalogResponse | (() => EconomyCatalogResponse);
  world?: EconomyWorldSource | undefined;
}): EconomyServices {
  const { world } = options;
  const source = options.catalog;
  const current = typeof source === "function" ? source : () => source;
  /** 목록 하나에서 만든 것: 호가창 물건·물건 차례·시장 캐시("도시|물건" → 창 끝 칸의 결과, 칸이 바뀌면 다시 만든다) */
  let derived:
    | {
        catalog: EconomyCatalogResponse;
        bookItems: EconomyCatalogResponse["items"];
        itemIndex: Map<string, number>;
        cache: Map<string, PreviewMarketState>;
      }
    | undefined;
  const view = () => {
    const catalog = current();
    if (derived?.catalog !== catalog)
      derived = {
        catalog,
        bookItems: catalog.items.filter(tradesOnBook),
        itemIndex: new Map(catalog.items.map((item, index) => [item.id, index])),
        cache: new Map(),
      };
    return derived;
  };

  /** 시안 시장 하나(시야 밖 도시는 마지막 관측 시각까지) */
  const marketOf = (city: PreviewCity, itemId: string, now: number): PreviewMarketState | undefined => {
    const { catalog, itemIndex, cache } = view();
    const item = catalog.items.find((entry) => entry.id === itemId);
    const currency = cityCurrency(catalog, city);
    if (!item || currency === null || !tradesOnBook(item)) return undefined;
    const at = now - city.observedAgoMs;
    const key = `${city.id}|${item.id}`;
    const cached = cache.get(key);
    if (cached && cached.bucket === bucketOf(at)) return cached;
    const state = simulatePreviewMarket(
      {
        seed: mix32(Number(city.id), (itemIndex.get(item.id) ?? 0) + 1),
        location: Number(city.id),
        item: item.id,
        currency,
        startPrice: previewStartPrice(item, city),
        taxBp: cityTaxBp(catalog, city),
        mine: PREVIEW_MY_PLANS[key] ?? [],
      },
      at,
    );
    cache.set(key, state);
    return state;
  };

  const homeCity = PREVIEW_CITIES[0];

  const ensureItem = (itemId: string): void => {
    if (!view().bookItems.some((item) => item.id === itemId))
      throw reasonedError("NOT_FOUND", "UNKNOWN_ITEM", "unknown_item");
  };

  const myOrders = (now: number): { open: MyOrder[]; done: MyOrderDone[] } => {
    const { catalog } = view();
    const open: MyOrder[] = [];
    const done: MyOrderDone[] = [];
    for (const key of Object.keys(PREVIEW_MY_PLANS)) {
      const [cityId = "", itemId = ""] = key.split("|");
      const city = PREVIEW_CITIES.find((entry) => entry.id === cityId);
      const currency = city ? cityCurrency(catalog, city) : null;
      const state = city ? marketOf(city, itemId, now) : undefined;
      if (!city || !state || currency === null) continue;
      for (const order of state.mine) {
        const common = {
          id: `p${city.id}_${itemId}_${order.id}`,
          item: itemId,
          city: city.id,
          cityName: city.name,
          currency,
          side: order.side,
          price: String(order.price),
          qty: String(order.qty),
        };
        if (order.status === "open") {
          open.push({
            ...common,
            type: "limit",
            remaining: String(order.remaining),
            placedAt: order.placedAt,
            expiresAt: order.expiresAt,
          });
        } else {
          done.push({
            ...common,
            filled: String(order.qty - order.remaining),
            status: order.status,
            at: order.doneAt ?? order.placedAt,
          });
        }
      }
    }
    open.sort((a, b) => b.placedAt - a.placedAt);
    done.sort((a, b) => b.at - a.at);
    return { open, done };
  };

  /** 남은 주문 수(질문 149 기본안 → D-443, 출발값 [임시]): 걸린 주문 수. 한도에 닿으면 다시 되는 시각 = 가장 이른 만료 */
  const orderLimit = (now: number) => {
    const open = myOrders(now).open;
    const used = Math.min(PREVIEW_ORDER_MAX, open.length);
    const recoversAt =
      used < PREVIEW_ORDER_MAX || open.length === 0
        ? null
        : Math.min(...open.map((order) => order.expiresAt));
    return { used, max: PREVIEW_ORDER_MAX, recoversAt };
  };

  return {
    catalog: () => view().catalog,
    cityNames: () => ({ cities: world?.cityNames?.() ?? [] }),

    async holdings(viewer: Viewer, query: EconomyQuery): Promise<EconomyHoldingsResponse> {
      const { catalog } = view();
      const owner = world?.ownerOf(viewer.id);
      const real =
        owner === undefined
          ? { wallet: [], places: [] }
          : holdingsFromAccounts(world?.accountsOf(owner) ?? [], world?.cityName);
      if (!query.preview) {
        return { ...head(query, true), hasOwner: owner !== undefined, ...real };
      }
      return {
        ...head(query, true),
        hasOwner: true,
        wallet: [...previewWallet(catalog), ...real.wallet],
        places: [...previewPlaces(catalog, query.now), ...real.places],
      };
    },

    production(viewer: Viewer, query: EconomyQuery): EconomyProductionResponse {
      if (!query.preview) {
        const real = world?.market?.();
        if (real) return { ...head(query, true), ...real.production(viewer.id) };
        return { ...head(query, false), facilities: [], repeats: [], wages: [] };
      }
      return { ...head(query, true), ...previewProduction(view().catalog, query.now) };
    },

    marketItems(viewer: Viewer, query: EconomyQuery): MarketItemsResponse {
      if (!query.preview) {
        const real = world?.market?.();
        if (real)
          return {
            ...head(query, true),
            ...real.items(
              viewer.id,
              view().bookItems.map((item) => item.id),
              query.now,
            ),
          };
      }
      if (!query.preview || !homeCity) return { ...head(query, false), homeCity: null, items: [] };
      const { catalog, bookItems } = view();
      const items = bookItems.map((item) => {
        let volume = 0n;
        let cities = 0;
        for (const city of PREVIEW_CITIES) {
          const state = marketOf(city, item.id, query.now);
          if (!state) continue;
          cities += 1;
          volume += tradeStats(state.trades).volume;
        }
        const home = marketOf(homeCity, item.id, query.now);
        const stats = home ? tradeStats(home.trades) : undefined;
        const end = (bucketOf(query.now) + 1) * PREVIEW_BUCKET_MS;
        const hourly = home ? candles(home.trades, end - 24 * 3_600_000, end, 3_600_000) : [];
        return {
          item: item.id,
          cities,
          volume: String(volume),
          last: stats?.last === undefined ? null : String(stats.last),
          currency: cityCurrency(catalog, homeCity),
          changeBp: changeBp(stats?.last, stats?.first),
          spark: hourly.map((candle) => candle.close),
        };
      });
      return { ...head(query, true), homeCity: { id: homeCity.id, name: homeCity.name }, items };
    },

    marketCities(viewer: Viewer, itemId: string, query: EconomyQuery): MarketCitiesResponse {
      ensureItem(itemId);
      const { catalog } = view();
      if (!query.preview) {
        const real = world?.market?.();
        if (real) return { ...head(query, true), ...real.cities(viewer.id, itemId, query.now) };
        return { ...head(query, false), item: itemId, rows: [] };
      }
      const rows: MarketCityRow[] = [];
      for (const city of PREVIEW_CITIES) {
        const state = marketOf(city, itemId, query.now);
        const currency = cityCurrency(catalog, city);
        if (!state || currency === null) continue;
        const stats = tradeStats(state.trades);
        const levels = bookLevels(state.orders, PREVIEW_ME, 1);
        rows.push({
          city: city.id,
          name: city.name,
          currency,
          bestBid: levels.bids[0]?.price ?? null,
          bestAsk: levels.asks[0]?.price ?? null,
          last: stats.last === undefined ? null : String(stats.last),
          changeBp: changeBp(stats.last, stats.first),
          volume: String(stats.volume),
          distanceKm: city.distanceKm,
          // [임시] 운임 = 거리 × 2(물건 1개, 무게 미정) × 화폐 배율. ECO-4 식(거리 × 무게 × 지형 × 도로)은 기획 Step 5
          freightPerUnit:
            city.distanceKm === 0
              ? null
              : String(BigInt(Math.max(1, Math.round((city.distanceKm * 2 * city.currencyPm) / 1000)))),
          observedAt: query.now - city.observedAgoMs,
          inSight: city.inSight,
          hasWarehouse: city.store !== null,
        });
      }
      return { ...head(query, true), item: itemId, rows };
    },

    marketBook(viewer: Viewer, itemId: string, cityId: string, query: EconomyQuery): MarketBookResponse {
      ensureItem(itemId);
      if (!query.preview) {
        const real = world?.market?.();
        if (real) {
          const id = Number(cityId);
          const book = Number.isSafeInteger(id) ? real.book(viewer.id, itemId, id, query.now) : undefined;
          if (!book) throw reasonedError("NOT_FOUND", "UNKNOWN_CITY", "unknown_city");
          return { ...head(query, true), ...book };
        }
      }
      const { catalog } = view();
      const city = PREVIEW_CITIES.find((entry) => entry.id === cityId);
      const empty = {
        item: itemId,
        city: cityId,
        cityName: city?.name ?? "",
        currency: city ? (cityCurrency(catalog, city) ?? "") : "",
        taxBp: city ? cityTaxBp(catalog, city) : 0,
        asks: [],
        bids: [],
        last: null,
        changeBp: null,
        high: null,
        low: null,
        volume: "0",
        trades: [],
        candles: [],
        candleMs: PREVIEW_CANDLE_MS,
        mine: { goods: "0", cash: "0" },
        limit: { used: 0, max: PREVIEW_ORDER_MAX, recoversAt: null },
        expiryDays: [...EXPIRY_DAYS],
        observedAt: query.now,
        inSight: true,
      };
      if (!query.preview) return { ...head(query, false), ...empty };
      const state = city ? marketOf(city, itemId, query.now) : undefined;
      if (!city || !state) throw reasonedError("NOT_FOUND", "UNKNOWN_CITY", "unknown_city");
      const observedAt = query.now - city.observedAgoMs;
      const to = (bucketOf(observedAt) + 1) * PREVIEW_BUCKET_MS;
      const from = to - PREVIEW_WINDOW_BUCKETS * PREVIEW_BUCKET_MS;
      const stats = tradeStats(state.trades);
      const currency = empty.currency;
      return {
        ...head(query, true),
        ...empty,
        ...bookLevels(state.orders, PREVIEW_ME),
        last: stats.last === undefined ? null : String(stats.last),
        changeBp: changeBp(stats.last, stats.first),
        high: stats.high === undefined ? null : String(stats.high),
        low: stats.low === undefined ? null : String(stats.low),
        volume: String(stats.volume),
        trades: recentTrades(state.trades),
        candles: candles(state.trades, from, to, PREVIEW_CANDLE_MS),
        // 팔 수 있는 양은 묶음 단위(창고 기본 단위 ÷ 묶음, 버림, 302·D-506)
        mine: {
          goods: String(
            previewGoods(city.id, itemId) / lotSizeOfItem(catalog.items.find((entry) => entry.id === itemId)),
          ),
          cash: String(previewCash(catalog, currency)),
        },
        limit: orderLimit(query.now),
        observedAt,
        inSight: city.inSight,
      };
    },

    orders(viewer: Viewer, query: EconomyQuery): EconomyOrdersResponse {
      const real = query.preview ? undefined : world?.market?.();
      if (real) return { ...head(query, true), ...real.orders(viewer.id, query.now) };
      if (!query.preview) {
        return {
          ...head(query, false),
          open: [],
          done: [],
          limit: { used: 0, max: PREVIEW_ORDER_MAX, recoversAt: null },
        };
      }
      const { open, done } = myOrders(query.now);
      return { ...head(query, true), open, done, limit: orderLimit(query.now) };
    },

    exchange(viewer: Viewer, query: EconomyQuery): EconomyExchangeResponse {
      if (!query.preview) {
        // 실제 환전(나라 화폐 ↔ 기준 통화, docs/adr/2026-11-07-play-flow.md WP6 — market/fxViews.ts)
        const real = world?.market?.();
        if (real) return { ...head(query, true), ...real.exchange(viewer.id, query.now) };
      }
      const { catalog } = view();
      const base = catalog.baseCurrency;
      const common = { base, intervalMs: FX_INTERVAL_MS, nextAuctionAt: nextAuctionAt(query.now) };
      if (!query.preview || base === null)
        return { ...head(query, false), ...common, baseBalance: "0", pairs: [] };
      return {
        ...head(query, true),
        ...common,
        baseBalance: String(previewCash(catalog, base)),
        pairs: previewFxPairs(catalog, query.now),
      };
    },
  };
}
