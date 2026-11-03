// economy 라우터 시험 — 로그인·시안 자료 권한(home: preview), 시안이 아니면 not_ready, 모르는 물건·도시는 NOT_FOUND,
// 출력 타입이 공용 응답 타입(@terra/shared/economy)과 서로 넣을 수 있는지
import type {
  EconomyCatalogResponse,
  EconomyExchangeResponse,
  EconomyHoldingsResponse,
  EconomyOrdersResponse,
  EconomyProductionResponse,
  MarketBookResponse,
  MarketCitiesResponse,
  MarketItemsResponse,
} from "@terra/shared/economy";
import type { inferRouterOutputs } from "@trpc/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { createEconomyServices } from "../economyView/services.ts";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import { createHomeServices } from "../home/services.ts";
import { createMailServices } from "../mail/list.ts";
import { NO_HOLDINGS } from "../holdings/reads.ts";
import { createRosterServices } from "../roster/services.ts";
import type { TrpcContext, Viewer } from "./context.ts";
import { createCallerFactory } from "./init.ts";
import { type AppRouter, appRouter } from "./router.ts";

const NOW = Date.UTC(2026, 9, 31, 9, 3, 0);
const PLAYER: Viewer = { id: "u-player", loginId: "player", roles: ["player"] };
const ADMIN: Viewer = { id: "u-admin", loginId: "admin", roles: ["admin"] };

const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
const catalog = economyCatalogFromPack(loaded.pack, loaded.content);

function callerFor(viewer: Viewer | null, accounts = new Map<string, number>()) {
  const ctx: TrpcContext = {
    contentVersion: "test",
    now: () => NOW,
    viewer: () => Promise.resolve(viewer),
    admin: undefined,
    settings: undefined,
    planetEditor: undefined,
    home: createHomeServices(),
    // 다른 화면 자료: 이 시험은 쓰지 않는다
    roster: createRosterServices(),
    faction: createFactionScreenServices(),
    mail: createMailServices(),
    holdings: NO_HOLDINGS,
    economy: createEconomyServices({
      catalog,
      world: {
        ownerOf: (userId) => accounts.get(userId),
        accountsOf: () => [
          { asset: "s3_test_credit", location: null, balance: 48n },
          { asset: "s3_test_ore", location: null, balance: 12n },
        ],
      },
    }),
  };
  return createCallerFactory(appRouter)(ctx);
}

describe("economy 라우터", () => {
  it("로그인하지 않으면 UNAUTHORIZED", async () => {
    await expect(callerFor(null).economy.catalog()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("플레이어: 목록·잔고는 실제 자료, 거래소·생산·환전은 not_ready, 시안 자료는 FORBIDDEN", async () => {
    const caller = callerFor(PLAYER, new Map([["u-player", 7]]));
    expect((await caller.economy.catalog()).items.length).toBeGreaterThan(0);
    const holdings = await caller.economy.holdings();
    expect(holdings).toMatchObject({ preview: false, status: "ready", hasOwner: true });
    expect(holdings.wallet.map((line) => line.asset)).toEqual(["s3_test_credit"]);
    expect(holdings.places.map((place) => place.id)).toEqual(["ledger"]);
    expect(await caller.economy.marketItems()).toMatchObject({ status: "not_ready", items: [] });
    expect(await caller.economy.production()).toMatchObject({ status: "not_ready", facilities: [] });
    expect(await caller.economy.exchange()).toMatchObject({ status: "not_ready", pairs: [] });
    expect(await caller.economy.orders()).toMatchObject({ status: "not_ready", open: [] });
    expect(await caller.economy.marketBook({ item: "grain", city: "101" })).toMatchObject({
      status: "not_ready",
      asks: [],
    });
    await expect(caller.economy.marketItems({ preview: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.economy.holdings({ preview: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("주체가 없는 계정은 hasOwner false, 빈 잔고", async () => {
    const holdings = await callerFor(PLAYER).economy.holdings();
    expect(holdings).toMatchObject({ hasOwner: false, wallet: [], places: [] });
  });

  it("admin 시안 자료: 모든 응답에 preview, 거래창·내 주문·환전이 ready", async () => {
    const caller = callerFor(ADMIN);
    const items = await caller.economy.marketItems({ preview: true });
    expect(items).toMatchObject({ preview: true, status: "ready", homeCity: { id: "101", name: "Nova" } });
    // 장비(완제품)는 호가창이 아니다(D-282)
    expect(items.items.map((item) => item.item)).not.toContain("test_sword");
    expect(items.items[0]?.spark.length).toBe(24);
    const cities = await caller.economy.marketCities({ item: "iron_ore", preview: true });
    expect(cities.rows.map((row) => row.city)).toEqual(["101", "102", "103", "104"]);
    expect(cities.rows[0]).toMatchObject({ distanceKm: 0, freightPerUnit: null, hasWarehouse: true });
    expect(cities.rows[3]).toMatchObject({ inSight: false });
    expect(cities.rows[3]?.observedAt).toBeLessThan(NOW);
    const book = await caller.economy.marketBook({ item: "iron_ore", city: "101", preview: true });
    expect(book.asks.length).toBeGreaterThan(3);
    expect(book.bids.length).toBeGreaterThan(3);
    expect(book.candles.length).toBe(48);
    expect(book.taxBp).toBe(200);
    expect(book.mine).toEqual({ goods: "310", cash: "1250000" });
    expect(book.expiryDays).toEqual([1, 3, 7]);
    const orders = await caller.economy.orders({ preview: true });
    expect(orders.open.length + orders.done.length).toBe(5);
    expect(orders.done.some((order) => order.status === "expired")).toBe(true);
    expect(orders.limit).toMatchObject({ used: orders.open.length, max: 10 });
    const holdings = await caller.economy.holdings({ preview: true });
    expect(holdings.places.find((place) => place.id === "104")?.name).toBe("Velmara Eastreach Free Port");
    expect(holdings.places.every((place) => place.preview === true)).toBe(true);
    const exchange = await caller.economy.exchange({ preview: true });
    expect(exchange).toMatchObject({ status: "ready", base: catalog.baseCurrency, intervalMs: 3_600_000 });
    expect(exchange.nextAuctionAt).toBe(Date.UTC(2026, 9, 31, 10, 0, 0));
    expect((await caller.economy.production({ preview: true })).facilities.length).toBeGreaterThan(3);
  });

  it("모르는 물건·도시는 NOT_FOUND(이유 코드), 형식이 틀리면 BAD_REQUEST", async () => {
    const caller = callerFor(ADMIN);
    await expect(caller.economy.marketCities({ item: "nope", preview: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller.economy.marketCities({ item: "test_sword" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      caller.economy.marketBook({ item: "grain", city: "999", preview: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.economy.marketBook({ item: "Grain", city: "101" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("출력 타입 = 공용 응답 타입(JSON 모양)", () => {
    type Out = inferRouterOutputs<AppRouter>["economy"];
    expectTypeOf<Out["catalog"]>().toExtend<EconomyCatalogResponse>();
    expectTypeOf<Out["holdings"]>().toExtend<EconomyHoldingsResponse>();
    expectTypeOf<Out["production"]>().toExtend<EconomyProductionResponse>();
    expectTypeOf<Out["marketItems"]>().toExtend<MarketItemsResponse>();
    expectTypeOf<Out["marketCities"]>().toExtend<MarketCitiesResponse>();
    expectTypeOf<Out["marketBook"]>().toExtend<MarketBookResponse>();
    expectTypeOf<Out["orders"]>().toExtend<EconomyOrdersResponse>();
    expectTypeOf<Out["exchange"]>().toExtend<EconomyExchangeResponse>();
  });
});
