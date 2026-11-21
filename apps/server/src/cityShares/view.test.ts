// 증권 거래소 건물 판 조회 시험(D-583 — 그 나라 정부 지분·사업장 지분 시장 목록), docs/adr/2026-11-21-share-market.md
import type { ShareMarketView } from "@terra/shared/businessBooks";
import { createLedgerBook, shareAsset } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { WorldWriter } from "../world/persist/writer.ts";
import { EMPTY_CITY_SHARES, createCityShareMarket, ownerHolder } from "./market.ts";
import type { CitySharePort, ShareFacilities } from "./port.ts";
import { createCityShareView } from "./view.ts";

const NOW = 1_800_000 * 1_000_000 + 5;
const CITY = 4;
const OTHER_CITY = 5;
const EXCHANGE = 900;

const writer: WorldWriter = {
  upsert: () => undefined,
  remove: () => undefined,
  append: () => undefined,
  durable: () => Promise.resolve(),
  drain: () => Promise.resolve(),
  pendingCount: 0,
  takeMetrics: () => ({}),
  crash: () => Promise.resolve(),
};

const shareView = (issued: boolean): ShareMarketView => ({
  asset: "credit",
  issued,
  total: "1000",
  lastPrice: issued ? "12" : null,
  roundMs: 1_800_000,
  nextRoundMs: NOW + 1_000,
  bidShares: "0",
  askShares: issued ? "5" : "0",
  myShares: "0",
  myCash: "0",
  myOrders: [],
  orderMax: 10,
  rounds: [],
});

function setup() {
  let ids = 1;
  const ledger = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  ledger.post({
    kind: "issue",
    atMs: 0,
    entries: [
      { account: ledger.ownerAccount(1, shareAsset(CITY)), amount: 1000n },
      { account: ledger.systemAccount("issue:a", shareAsset(CITY)), amount: -1000n },
    ],
  });
  const market = createCityShareMarket({
    ledger,
    writer,
    planetId: "p",
    loaded: EMPTY_CITY_SHARES,
    currencyOf: (cityId) => (cityId === CITY || cityId === OTHER_CITY ? "cur_aa" : undefined),
    rules: () => ({ roundMs: 1_800_000, orderMax: 10 }),
    now: () => NOW,
  });
  const records = [
    { buildingId: EXCHANGE, facilityId: "stock_exchange", cityId: CITY, level: 1 },
    { buildingId: 10, facilityId: "farm", cityId: CITY, level: 1 },
    { buildingId: 11, facilityId: "farm", cityId: OTHER_CITY, level: 1 },
    { buildingId: 12, facilityId: "mine", cityId: OTHER_CITY, level: 1 },
    { buildingId: 13, facilityId: "farm", cityId: 77, level: 1 },
  ];
  const facilities: ShareFacilities = {
    records: () => records,
    record: (buildingId) => records.find((row) => row.buildingId === buildingId),
    facility: (facilityId) =>
      facilityId === "stock_exchange"
        ? { name: { ko: "증권 거래소", en: "Stock exchange" }, exchange: "securities" }
        : { name: { ko: facilityId, en: facilityId } },
    shareView: (buildingId) => shareView(buildingId === 12),
  };
  const port: CitySharePort = {
    ready: () => true,
    ledger: () => ledger,
    writer: () => writer,
    pool: () => undefined,
    currencyOf: (cityId) => (cityId === CITY || cityId === OTHER_CITY ? "cur_aa" : undefined),
    cityName: (cityId) => `city${cityId}`,
    cityOwner: () => 1,
    ownerOfUser: () => 2,
    houseOfUser: () => undefined,
    facilities: () => facilities,
    levy: () => ({
      rateOf: (cityId) => (cityId === CITY ? { treasuryOwner: 1, taxBp: 300 } : undefined),
      pay: () => undefined,
    }),
    npcNations: () => [],
  };
  const view = createCityShareView({
    port,
    service: {
      ensure: () => Promise.resolve(market),
      actorsOf: () => Promise.resolve({ me: ownerHolder(2), house: undefined, houseKey: undefined }),
      placeCap: () => Promise.resolve(undefined),
      holdersOf: () => ({ owners: [], houses: [] }),
    },
    governance: () => undefined,
    now: () => NOW,
  });
  return { view, market, records };
}

describe("증권 거래소 판(shares.hub)", () => {
  it("그 도시 사업장은 모두, 나라 밖·거래소 자신은 빼고 도시 시장 요약을 보인다(나라 정보가 없으면 그 도시만)", async () => {
    const { view, market } = setup();
    market.place({ holder: ownerHolder(1), cityId: CITY, side: "sell", price: 30n, shares: 10n, atMs: NOW });
    const hub = await view.hub("u", EXCHANGE);
    if (hub.status !== "ok") throw new Error(hub.status);
    expect(hub.cityId).toBe(CITY);
    expect(hub.cities).toEqual([
      expect.objectContaining({ cityId: CITY, total: "1000", askShares: "10", asset: "cur_aa" }),
    ]);
    // 나라가 없으면 그 도시만 — 다른 도시(5)·나라 밖(77)·거래소 자신(900)은 빠진다
    expect(hub.businesses.map((row) => row.buildingId)).toEqual([10]);
    expect(hub.nextRoundMs).toBeGreaterThan(NOW);
  });

  it("증권 거래소가 아니면 not_exchange, 짓는 중이면 stopped", async () => {
    const { view, records } = setup();
    expect((await view.hub("u", 10)).status).toBe("not_exchange");
    expect((await view.hub("u", 999)).status).toBe("not_exchange");
    const exchange = records[0];
    if (!exchange) throw new Error("row");
    exchange.level = 0;
    expect((await view.hub("u", EXCHANGE)).status).toBe("stopped");
  });

  it("도시 판: 모르는 도시는 unknown_city, 내 지갑·호가창", async () => {
    const { view, market } = setup();
    expect((await view.city("u", 99)).status).toBe("unknown_city");
    market.place({ holder: ownerHolder(1), cityId: CITY, side: "sell", price: 30n, shares: 10n, atMs: NOW });
    const city = await view.city("u", CITY);
    if (city.status !== "ok") throw new Error(city.status);
    expect(city.book.asks).toEqual([{ price: "30", shares: "10", orders: 1 }]);
    expect(city.me).toEqual({ shares: "0", cash: "0", sellable: "0" });
    expect(city.house).toBeNull();
    expect(city.treasury).toBeNull();
    // 거래세 요율(D-587 2474 다) — 그 도시에 일하는 증권 거래소 요율이 없으면 이용료 null
    expect(city.levy).toEqual({ taxBp: 300, feeBp: null });
    expect(city.cityName).toEqual({ ko: "city4", en: "city4" });
  });
});
