// 경제 화면 자료 시험 — 팩 목록, 호가·봉 모양, 시안 시장(sim 거래소)·환전·생산, 실제 원장 잔고 나누기
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { economyCatalogFromPack } from "./catalog.ts";
import { bookLevels, candles, changeBp, recentTrades, tradeStats } from "./marketShape.ts";
import { previewFxPairs } from "./previewExchange.ts";
import {
  PREVIEW_BUCKET_MS,
  PREVIEW_MY_PLANS,
  PREVIEW_WINDOW_BUCKETS,
  simulatePreviewMarket,
} from "./previewMarket.ts";
import { previewProduction } from "./previewProduction.ts";
import { lotSizeOfItem, previewGoods, previewPlaces } from "./previewWorld.ts";
import { createEconomyServices, holdingsFromAccounts } from "./services.ts";

const NOW = Date.UTC(2026, 9, 31, 9, 3, 0);

function packCatalog() {
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
  return economyCatalogFromPack(loaded.pack, loaded.content);
}

describe("economyCatalogFromPack", () => {
  it("켜진 항목만 팩 차례로, 참조는 ID 글자, 금액은 10진 글자", () => {
    const catalog = packCatalog();
    expect(catalog.items.map((item) => item.id)).not.toContain("dev_placeholder");
    expect(catalog.items[0]).toMatchObject({ id: "grain", category: "raw", tier: 0, startPrice: "4" });
    expect(catalog.items[0]?.name).toEqual({ ko: "곡물", en: "Grain" });
    const smelt = catalog.recipes.find((recipe) => recipe.id === "smelt_iron");
    expect(smelt).toMatchObject({
      facility: "smelter",
      inputs: [{ item: "iron_ore", qty: "10" }],
      outputs: [{ item: "iron_ingot", qty: "7" }],
      tier: 1,
      // 작업량 1000 ÷ 기준 일꾼 1000 = 1시간
      baseDurationMs: 3_600_000,
    });
    expect(catalog.baseCurrency).toBe(catalog.currencies[0]?.code);
    expect(catalog.currencies[0]).toMatchObject({ tradeTaxBp: 200 });
    expect(catalog.necessities.map((entry) => entry.item)).toEqual(["ration", "household_goods"]);
    expect(catalog.contentVersion).toMatch(/^core@\d+$/);
  });

  it("묶음 크기·무게와 채집 티어 추첨(302·D-506): 철광석 1g·1kg 묶음, 광산 레시피는 추첨, 원목 베기는 아님", () => {
    const catalog = packCatalog();
    expect(catalog.items.find((item) => item.id === "iron_ore")).toMatchObject({
      tier: 3,
      lotSize: "1000",
      weight: 1,
    });
    expect(catalog.items.find((item) => item.id === "grain")?.lotSize).toBe("1");
    expect(catalog.recipes.find((recipe) => recipe.id === "mine_iron_ore")?.gather).toEqual({
      primary: "str",
      secondary: "vit",
      subcategory: "ore",
      mode: "roll",
    });
    // 원목(timber)은 목재 사다리(wood) 밖이라 산출 그대로, 통나무 베기(소나무 T0~)는 목재 사다리 추첨
    expect(catalog.recipes.find((recipe) => recipe.id === "cut_timber")?.gather).toBeUndefined();
    expect(catalog.recipes.find((recipe) => recipe.id === "cut_logs")?.gather?.subcategory).toBe("wood");
  });

  it("일꾼 스탯 효과(D-507): 광산 = 새 유닛 10 → 속도 ×1·한 번에 2개, 한 번 T0 30분·T3 2시간. 원목 베기는 시간표 없음", () => {
    const catalog = packCatalog();
    expect(catalog.recipes.find((recipe) => recipe.id === "mine_iron_ore")?.worker).toEqual({
      primary: "str",
      secondary: "vit",
      progressDivisor: 20,
      yieldBase: 1,
      yieldPerStatPm: 100,
      yieldCap: 10,
      unitStat: 10,
      unitProgress: 1,
      unitYield: 2,
      tierHarvestMs: [30, 60, 90, 120, 150, 180, 210, 240, 270, 300].map((progress) => progress * 60_000),
      unitTier: null,
    });
    const timber = catalog.recipes.find((recipe) => recipe.id === "cut_timber")?.worker;
    expect(timber).toMatchObject({ primary: "dex", secondary: "str", unitYield: 2, tierHarvestMs: null });
    // 농장(VIT·INT 0.08·상한 8): 곡물은 작물 사다리 밖 → 한 번에 1개, 레시피 작업량 시간
    expect(catalog.recipes.find((recipe) => recipe.id === "farm_grain")?.worker).toMatchObject({
      primary: "vit",
      secondary: "int",
      yieldPerStatPm: 80,
      yieldCap: 8,
      unitYield: 1,
      tierHarvestMs: null,
      unitTier: null,
    });
    // 스탯 짝이 없는 시설(제련소)은 없음
    expect(catalog.recipes.find((recipe) => recipe.id === "smelt_iron")?.worker).toBeUndefined();
  });

  it("시안 창고: 철광석은 기본 단위(g)로 들고, 용량은 묶음 수로 센다", () => {
    const catalog = packCatalog();
    const nova = previewPlaces(catalog, NOW).find((place) => place.id === "101");
    expect(nova?.lines.find((line) => line.item === "iron_ore")).toMatchObject({
      qty: "310000",
      locked: "40000",
    });
    // 곡물 1,240 + 철광석 310묶음 + 철 주괴 96 + 원목 220 + 생활용품 14 + 시험 칼 1
    expect(nova?.capacity?.used).toBe(String(1240 + 310 + 96 + 220 + 14 + 1));
    expect(
      previewGoods("101", "iron_ore") / lotSizeOfItem(catalog.items.find((item) => item.id === "iron_ore")),
    ).toBe(310n);
  });
});

/** 걸린 주문 한 건(시험용) */
const order = (id: number, owner: number, side: "buy" | "sell", price: bigint, remaining: bigint) => ({
  id,
  owner,
  side,
  price,
  remaining,
  expiresAtMs: 0,
  seq: id,
});

describe("marketShape", () => {
  it("호가 단계: 같은 값끼리 합치고 매도는 낮은 값, 매수는 높은 값 차례. 내 양을 따로 센다", () => {
    const levels = bookLevels(
      [
        order(1, 1, "sell", 105n, 10n),
        order(2, 99, "sell", 103n, 4n),
        order(3, 2, "sell", 103n, 6n),
        order(4, 1, "buy", 100n, 7n),
        order(5, 2, "buy", 101n, 3n),
      ],
      99,
    );
    expect(levels.asks).toEqual([
      { price: "103", qty: "10", orders: 2, mine: "4" },
      { price: "105", qty: "10", orders: 1, mine: "0" },
    ]);
    expect(levels.bids.map((level) => level.price)).toEqual(["101", "100"]);
    expect(bookLevels([order(1, 1, "sell", 1n, 1n), order(2, 1, "sell", 2n, 1n)], 0, 1).asks).toHaveLength(1);
  });

  it("봉: 빈 칸은 앞 종가로 채우고, 첫 체결 앞은 첫 체결가다", () => {
    const trades = [
      { at: 1_500, price: 10n, qty: 2n, side: "buy" as const },
      { at: 1_700, price: 12n, qty: 1n, side: "sell" as const },
      { at: 3_100, price: 9n, qty: 5n, side: "sell" as const },
    ];
    const list = candles(trades, 0, 4_000, 1_000);
    expect(list).toHaveLength(4);
    expect(list[0]).toEqual({ at: 0, open: "10", high: "10", low: "10", close: "10", volume: "0" });
    expect(list[1]).toEqual({ at: 1_000, open: "10", high: "12", low: "10", close: "12", volume: "3" });
    expect(list[2]).toMatchObject({ open: "12", close: "12", volume: "0" });
    expect(list[3]).toMatchObject({ open: "9", low: "9", close: "9", volume: "5" });
    expect(candles([], 0, 4_000, 1_000)).toEqual([]);
    expect(recentTrades(trades, 2).map((trade) => trade.price)).toEqual(["9", "12"]);
    expect(tradeStats(trades)).toEqual({ last: 9n, first: 10n, high: 12n, low: 9n, volume: 8n });
  });

  it("바뀐 정도는 만분율(0 쪽으로 버림), 기준이 없으면 null", () => {
    expect(changeBp(110n, 100n)).toBe(1000);
    expect(changeBp(99n, 300n)).toBe(-6700);
    expect(changeBp(undefined, 100n)).toBeNull();
    expect(changeBp(1n, 0n)).toBeNull();
  });
});

describe("시안 시장(sim 물자 거래소)", () => {
  const spec = {
    seed: 12345,
    location: 101,
    item: "iron_ore",
    currency: "placeholder_cur_01",
    startPrice: 800n,
    taxBp: 200,
    mine: PREVIEW_MY_PLANS["101|iron_ore"] ?? [],
  };

  it("같은 시각이면 같은 결과, 호가가 엇갈리지 않는다(최우선 매수 < 최우선 매도)", () => {
    const a = simulatePreviewMarket(spec, NOW);
    const b = simulatePreviewMarket(spec, NOW);
    expect(a).toEqual(b);
    expect(a.trades.length).toBeGreaterThan(50);
    const levels = bookLevels(a.orders, 99);
    const bestBid = BigInt(levels.bids[0]?.price ?? "0");
    const bestAsk = BigInt(levels.asks[0]?.price ?? "0");
    expect(bestBid).toBeGreaterThan(0n);
    expect(bestBid).toBeLessThan(bestAsk);
    // 체결은 창 안(지난 24시간)이다
    const windowStart =
      (Math.floor(NOW / PREVIEW_BUCKET_MS) - PREVIEW_WINDOW_BUCKETS + 1) * PREVIEW_BUCKET_MS;
    expect(a.trades.every((trade) => trade.at >= windowStart && trade.at <= NOW + PREVIEW_BUCKET_MS)).toBe(
      true,
    );
    // 값은 기준 값 근처(±20%)
    expect(a.trades.every((trade) => trade.price > 600n && trade.price < 1000n)).toBe(true);
  });

  it("내 주문 계획이 걸린 것·체결·만료로 남는다", () => {
    const sell = simulatePreviewMarket(spec, NOW).mine;
    expect(sell).toHaveLength(1);
    expect(sell[0]?.side).toBe("sell");
    const expired = simulatePreviewMarket(
      { ...spec, item: "ration", mine: PREVIEW_MY_PLANS["102|ration"] ?? [] },
      NOW,
    ).mine;
    expect(expired[0]?.status).toBe("expired");
    const filled = simulatePreviewMarket(
      { ...spec, item: "iron_ingot", mine: PREVIEW_MY_PLANS["103|iron_ingot"] ?? [] },
      NOW,
    ).mine;
    expect(filled[0]?.remaining).toBeLessThan(filled[0]?.qty ?? 0n);
  });
});

describe("시안 환전·생산", () => {
  it("기준 통화를 뺀 화폐마다 짝 하나, 예상 체결가는 양쪽 호가 사이", () => {
    const catalog = packCatalog();
    const pairs = previewFxPairs(catalog, NOW);
    expect(pairs.map((pair) => pair.currency)).toEqual(catalog.currencies.slice(1, 4).map((c) => c.code));
    for (const pair of pairs) {
      expect(pair.history).toHaveLength(24);
      expect(pair.indicative).not.toBeNull();
      expect(BigInt(pair.indicativeLots)).toBeGreaterThan(0n);
      const top = BigInt(pair.buys[0]?.price ?? "0");
      expect(BigInt(pair.indicative ?? "0")).toBeLessThanOrEqual(top);
    }
  });

  it("생산: 팩 시설만, 걸리는 시간은 sim 규칙(작업량 × 1시간 ÷ 일꾼 효율 합)", () => {
    const catalog = packCatalog();
    const { facilities, repeats, wages } = previewProduction(catalog, NOW);
    const farm = facilities.find((facility) => facility.facility === "farm");
    expect(farm).toMatchObject({ level: 2, workers: 18, slots: 20, status: "running" });
    // 농장 작업량 1000, 일꾼 18명 → ⌈3,600,000 ÷ 18⌉ = 200,000ms
    expect((farm?.current?.endsAt ?? 0) - (farm?.current?.startedAt ?? 0)).toBe(200_000);
    expect(facilities.find((facility) => facility.status === "idle")?.current).toBeNull();
    expect(repeats.map((repeat) => repeat.condition.kind)).toEqual(["below", "every", "below"]);
    expect(wages.every((wage) => wage.workers > 0)).toBe(true);
  });
});

describe("holdingsFromAccounts", () => {
  it("화폐·시험 화폐는 지갑, 위치 없음·화물·창고는 곳별로. 잔고 0은 뺀다", () => {
    const { wallet, places } = holdingsFromAccounts([
      { asset: "s3_test_credit", location: null, balance: 24n },
      { asset: "s3_test_ore", location: null, balance: 7n },
      { asset: "cur:placeholder_cur_01", location: null, balance: 5n },
      { asset: "item:iron_ore", location: -12, balance: 3n },
      { asset: "item:grain", location: 101, balance: 40n },
      { asset: "item:timber", location: 101, balance: 0n },
    ]);
    expect(wallet.map((line) => line.asset)).toEqual(["s3_test_credit", "cur:placeholder_cur_01"]);
    expect(wallet[1]?.currency).toBe("placeholder_cur_01");
    expect(places.map((place) => [place.id, place.kind, place.lines.length])).toEqual([
      ["ledger", "ledger", 1],
      ["cargo_12", "cargo", 1],
      ["101", "warehouse", 1],
    ]);
    expect(places[2]?.lines[0]).toMatchObject({ item: "grain", qty: "40", locked: "0" });
    expect(places.map((place) => place.name)).toEqual([null, null, null]);
  });

  it('도시 창고 곳의 이름 = 도시 이름(이름 없는 도시는 null — 화면이 "창고 #ID")', () => {
    const { places } = holdingsFromAccounts(
      [
        { asset: "item:grain", location: 101, balance: 40n },
        { asset: "item:grain", location: 102, balance: 1n },
        { asset: "item:iron_ore", location: -12, balance: 3n },
      ],
      (cityId) => (cityId === 101 ? "Verdane" : undefined),
    );
    expect(places.map((place) => [place.id, place.name])).toEqual([
      ["101", "Verdane"],
      ["102", null],
      ["cargo_12", null],
    ]);
  });
});

describe("economy.cityNames (기획 답 621 나)", () => {
  const viewer = { id: "u1", loginId: "u1", roles: [] };
  const names = [
    { id: 101, name: "Verdane" },
    { id: 102, name: "Osric" },
  ];
  const services = (known: (() => Promise<ReadonlySet<number> | undefined>) | undefined) =>
    createEconomyServices({
      catalog: packCatalog(),
      world: { ownerOf: () => undefined, accountsOf: () => [], cityNames: () => names, knownCityIds: known },
    });

  it("이름 있는 도시 가운데 아는 도시만 보낸다", async () => {
    const result = await services(async () => new Set([102])).cityNames(viewer);
    expect(result.cities).toEqual([{ id: 102, name: "Osric" }]);
  });

  it("아는 도시를 셀 수 없으면(지도 조회 없음) 이름을 보내지 않는다", async () => {
    expect((await services(async () => undefined).cityNames(viewer)).cities).toEqual([]);
    expect((await services(undefined).cityNames(viewer)).cities).toEqual([]);
  });
});
