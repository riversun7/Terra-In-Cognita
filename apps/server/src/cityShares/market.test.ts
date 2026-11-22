// 도시(정부) 지분 시장 시험 — 기획 D-583(질문 2438 답 "호가창처럼", 동시호가 그대로)·D-130·D-344, docs/adr/2026-11-21-share-market.md
import { cityShareEscrowCode } from "@terra/shared/cityShares";
import { createLedgerBook, houseMoneyCode, houseShareCode, shareAsset } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import {
  type CityShareOrder,
  EMPTY_CITY_SHARES,
  type LoadedCityShares,
  createCityShareMarket,
  houseHolder,
  majorityCaps,
  ownerHolder,
} from "./market.ts";
import type { ShareLevy } from "./levy.ts";

const ROUND = 1_800_000;
const T0 = ROUND * 1_000_000;
const CITY = 12;
const TREASURY = 3;
const SELLER = 5;
const BUYER = 6;
const HOUSE = "40:";
const CUR = "cur_aa";

function setup(
  loaded: LoadedCityShares = EMPTY_CITY_SHARES,
  levy?: ShareLevy,
  onFill?: (order: CityShareOrder, filled: bigint) => void,
) {
  let ids = 1;
  let now = T0 + 10;
  let currency: string | undefined = CUR;
  const ledger = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  const ops: { table: WorldTable; row: Row }[] = [];
  const writer: WorldWriter = {
    upsert: (table, row) => ops.push({ table, row }),
    remove: (table, row) => ops.push({ table, row }),
    append: (table, row) => ops.push({ table, row }),
    durable: () => Promise.resolve(),
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
  const market = createCityShareMarket({
    ledger,
    writer,
    planetId: "p",
    loaded,
    currencyOf: (cityId) => (cityId === CITY ? currency : undefined),
    rules: () => ({ roundMs: ROUND, orderMax: 3 }),
    now: () => now,
    levy: () => levy,
    onFill,
  });
  const grant = (account: number, asset: string, amount: bigint) =>
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account, amount },
        { account: ledger.systemAccount(`issue:${asset}`, asset), amount: -amount },
      ],
    });
  // 도시 지분 1000주: 국고 600·판 사람 300·가문 100, 산 사람 돈 10,000
  const share = shareAsset(CITY);
  grant(ledger.ownerAccount(TREASURY, share), share, 600n);
  grant(ledger.ownerAccount(SELLER, share), share, 300n);
  grant(ledger.systemAccount(houseShareCode(HOUSE, CITY), share), share, 100n);
  grant(ledger.ownerAccount(BUYER, CUR), CUR, 10_000n);
  grant(ledger.systemAccount(houseMoneyCode(HOUSE, CUR), CUR), CUR, 500n);
  return {
    ledger,
    market,
    ops,
    setNow: (ms: number) => {
      now = ms;
    },
    setCurrency: (value: string | undefined) => {
      currency = value;
    },
  };
}

const none = () => new Map<string, bigint>();

describe("도시 지분 시장(동시호가 + 남는 주문)", () => {
  it("거래세·이용료(D-587 2474 다): 판 쪽이 받은 돈에서 거래세는 국고로, 이용료는 거래소 금고로", () => {
    const paid: { from: number; buildingId: number; amount: bigint }[] = [];
    const levy: ShareLevy = {
      rateOf: (cityId) =>
        cityId === CITY
          ? { treasuryOwner: TREASURY, taxBp: 500, fee: { buildingId: 77, bp: 100 } }
          : undefined,
      pay: (input) => paid.push({ from: input.from, buildingId: input.buildingId, amount: input.amount }),
    };
    const { ledger, market } = setup(EMPTY_CITY_SHARES, levy);
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 20n,
      shares: 50n,
      atMs: T0,
    });
    market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 20n,
      shares: 50n,
      atMs: T0,
    });
    // 국고 팔기는 거래세가 없다(제 국고로 내지 않는다) — 이용료만
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 20n,
      shares: 10n,
      atMs: T0,
    });
    market.place({
      holder: ownerHolder(TREASURY),
      cityId: CITY,
      side: "sell",
      price: 20n,
      shares: 10n,
      atMs: T0,
    });
    expect(market.run(T0 + ROUND, none)).toBe(1);
    // 판 사람: 50주 × 20 = 1000, 거래세 5% = 50 → 950(이용료 1% = 10은 pay 고리가 금고로 옮긴다)
    expect(ledger.balanceOf(SELLER, CUR)).toBe(950n);
    // 국고: 거래세 50 + 제 10주 판 돈 200
    expect(ledger.balanceOf(TREASURY, CUR)).toBe(250n);
    expect(paid.map((row) => [row.buildingId, row.amount])).toEqual([
      [77, 10n],
      [77, 2n],
    ]);
    expect(paid[0]?.from).toBe(ledger.ownerAccount(SELLER, CUR));
    expect(market.check()).toEqual([]);
  });

  it("이용료는 주문을 낸 증권 거래소가 그 요율로 받고, 없거나 맞지 않으면 그 도시 거래소(D-591 2523)", () => {
    const paid: { buildingId: number; amount: bigint }[] = [];
    const filled: [number, bigint][] = [];
    const levy: ShareLevy = {
      rateOf: (cityId) =>
        cityId === CITY ? { treasuryOwner: TREASURY, taxBp: 0, fee: { buildingId: 77, bp: 100 } } : undefined,
      // 88 = 같은 나라 다른 도시의 일하는 증권 거래소(요율 2%), 그 밖은 맞지 않음
      feeAt: (buildingId, cityId) =>
        buildingId === 88 && cityId === CITY ? { buildingId: 88, bp: 200 } : undefined,
      pay: (input) => paid.push({ buildingId: input.buildingId, amount: input.amount }),
    };
    const { market } = setup(EMPTY_CITY_SHARES, levy, (order, shares) => filled.push([order.id, shares]));
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 10n,
      shares: 300n,
      atMs: T0,
    });
    const at88 = market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 10n,
      shares: 100n,
      atMs: T0,
      exchangeId: 88,
    });
    market.place({
      holder: houseHolder(HOUSE),
      cityId: CITY,
      side: "sell",
      price: 10n,
      shares: 100n,
      atMs: T0,
      exchangeId: 99,
    });
    market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 10n,
      shares: 50n,
      atMs: T0,
    });
    expect(market.run(T0 + ROUND, none)).toBe(1);
    // 88: 1000 × 2% = 20, 99(맞지 않음)·거래소 없음 → 77: 1000 × 1% = 10, 500 × 1% = 5(같은 판 쪽 돈 계정끼리 모은다)
    expect(paid.toSorted((a, b) => a.buildingId - b.buildingId || Number(a.amount - b.amount))).toEqual([
      { buildingId: 77, amount: 5n },
      { buildingId: 77, amount: 10n },
      { buildingId: 88, amount: 20n },
    ]);
    // 체결 고리는 주문마다 체결 주를 알린다(국고 집행 셈 — treasuryRuns.ts)
    expect(filled.find(([id]) => at88.ok && id === at88.orderId)?.[1]).toBe(100n);
    expect(market.check()).toEqual([]);
  });

  it("사기는 돈을 묶고, 팔기는 지분을 묶지 않는다(의결권·배당이 계정 잔고로 센다)", () => {
    const { ledger, market } = setup();
    const buy = market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 20n,
      shares: 50n,
      atMs: T0,
    });
    expect(buy.ok).toBe(true);
    expect(ledger.balanceOf(BUYER, CUR)).toBe(9_000n);
    const sell = market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 15n,
      shares: 200n,
      atMs: T0,
    });
    expect(sell.ok).toBe(true);
    expect(ledger.balanceOf(SELLER, shareAsset(CITY))).toBe(300n);
    // 이미 건 팔 주문 몫을 빼면 100주만 더 팔 수 있다
    expect(market.sellable(ownerHolder(SELLER), CITY)).toBe(100n);
    expect(
      market.place({
        holder: ownerHolder(SELLER),
        cityId: CITY,
        side: "sell",
        price: 15n,
        shares: 101n,
        atMs: T0,
      }),
    ).toEqual({ ok: false, code: "insufficient_shares" });
    expect(
      market.place({
        holder: ownerHolder(BUYER),
        cityId: CITY,
        side: "buy",
        price: 1000n,
        shares: 10n,
        atMs: T0,
      }),
    ).toEqual({ ok: false, code: "insufficient_funds" });
    expect(
      market.place({ holder: ownerHolder(BUYER), cityId: 99, side: "buy", price: 1n, shares: 1n, atMs: T0 }),
    ).toEqual({
      ok: false,
      code: "unknown_city",
    });
    expect(market.check()).toEqual([]);
  });

  it("호가창: 값마다 모으고 지금 닫으면 날 값을 미리 보인다", () => {
    const { market } = setup();
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 20n,
      shares: 30n,
      atMs: T0,
    });
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 20n,
      shares: 20n,
      atMs: T0,
    });
    market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 18n,
      shares: 40n,
      atMs: T0,
    });
    const view = market.view(CITY, T0);
    expect(view.book.bids).toEqual([{ price: "20", shares: "50", orders: 2 }]);
    expect(view.book.asks).toEqual([{ price: "18", shares: "40", orders: 1 }]);
    expect(view.expected?.shares).toBe(40n);
    expect(view.nextRoundMs).toBe(T0 + ROUND);
  });

  it("회차: 한 값으로 체결, 남은 몫은 다음 회차에 그대로 걸린다(묶음 차이는 돌려준다)", () => {
    const { ledger, market, ops } = setup();
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 20n,
      shares: 100n,
      atMs: T0,
    });
    market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 20n,
      shares: 60n,
      atMs: T0,
    });
    expect(market.due(T0 + 5)).toBeUndefined();
    const boundary = market.due(T0 + ROUND + 5);
    expect(boundary).toBe(T0 + ROUND);
    expect(market.run(boundary ?? 0, none)).toBe(1);
    expect(ledger.balanceOf(BUYER, shareAsset(CITY))).toBe(60n);
    expect(ledger.balanceOf(SELLER, shareAsset(CITY))).toBe(240n);
    expect(ledger.balanceOf(SELLER, CUR)).toBe(1_200n);
    // 남은 사기 40주 × 20 = 800이 묶여 있다
    expect(ledger.balanceOf(BUYER, CUR)).toBe(10_000n - 2_000n);
    expect(market.orders(CITY).map((order) => [order.side, order.shares, order.filled])).toEqual([
      ["buy", 40n, 60n],
    ]);
    expect(market.lastPriceOf(CITY)).toBe(20n);
    expect(market.check()).toEqual([]);
    expect(ops.some((op) => op.table === "cityShareRounds")).toBe(true);
    // 같은 경계는 두 번 돌지 않는다
    expect(market.run(boundary ?? 0, none)).toBe(0);
  });

  it("회차 때 가진 주가 모자라면 팔 주문을 줄이고, 0이면 거둔다", () => {
    const { ledger, market } = setup();
    market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 5n,
      shares: 300n,
      atMs: T0,
    });
    // 회차 전에 지분이 빠져나갔다(다른 거래)
    ledger.post({
      kind: "transfer",
      atMs: T0,
      entries: [
        { account: ledger.ownerAccount(SELLER, shareAsset(CITY)), amount: -250n },
        { account: ledger.ownerAccount(TREASURY, shareAsset(CITY)), amount: 250n },
      ],
    });
    market.run(T0 + ROUND, none);
    expect(market.orders(CITY).map((order) => order.shares)).toEqual([50n]);
    ledger.post({
      kind: "transfer",
      atMs: T0,
      entries: [
        { account: ledger.ownerAccount(SELLER, shareAsset(CITY)), amount: -50n },
        { account: ledger.ownerAccount(TREASURY, shareAsset(CITY)), amount: 50n },
      ],
    });
    market.run(T0 + 2 * ROUND, none);
    expect(market.orders(CITY)).toEqual([]);
  });

  it("가문 이름으로: 가문 지분 계정에서 팔고 가문 금고 돈으로 산다", () => {
    const { ledger, market } = setup();
    market.place({
      holder: houseHolder(HOUSE),
      cityId: CITY,
      side: "sell",
      price: 10n,
      shares: 100n,
      atMs: T0,
    });
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 10n,
      shares: 100n,
      atMs: T0,
    });
    market.run(T0 + ROUND, none);
    expect(market.shareBalance(houseHolder(HOUSE), CITY)).toBe(0n);
    expect(market.cashBalance(houseHolder(HOUSE), CUR)).toBe(500n + 1_000n);
    expect(ledger.balanceOf(BUYER, shareAsset(CITY))).toBe(100n);
    // 거둘 수 있는 쪽만 거둔다
    const placed = market.place({
      holder: houseHolder(HOUSE),
      cityId: CITY,
      side: "buy",
      price: 5n,
      shares: 10n,
      atMs: T0,
    });
    if (!placed.ok) throw new Error("place failed");
    expect(market.cancel([ownerHolder(BUYER)], placed.orderId, T0)).toEqual({ ok: false, code: "forbidden" });
    expect(market.cancel([houseHolder(HOUSE)], placed.orderId, T0)).toEqual({ ok: true });
    expect(market.cashBalance(houseHolder(HOUSE), CUR)).toBe(1_500n);
    expect(market.cancel([houseHolder(HOUSE)], placed.orderId, T0)).toEqual({
      ok: false,
      code: "unknown_order",
    });
  });

  it("과반 끝(caps)은 회차의 팔 주 수를 줄이고, 주문 수 한도는 국고 승인 주문을 세지 않는다", () => {
    const { ledger, market } = setup();
    market.place({
      holder: houseHolder(HOUSE),
      cityId: CITY,
      side: "sell",
      price: 10n,
      shares: 100n,
      atMs: T0,
    });
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 10n,
      shares: 100n,
      atMs: T0,
    });
    market.run(T0 + ROUND, () => new Map([[houseHolder(HOUSE), 30n]]));
    expect(ledger.balanceOf(BUYER, shareAsset(CITY))).toBe(30n);
    for (let i = 0; i < 2; i++)
      expect(
        market.place({
          holder: ownerHolder(BUYER),
          cityId: CITY,
          side: "buy",
          price: 1n,
          shares: 1n,
          atMs: T0,
        }).ok,
      ).toBe(true);
    expect(
      market.place({
        holder: ownerHolder(BUYER),
        cityId: CITY,
        side: "buy",
        price: 1n,
        shares: 1n,
        atMs: T0,
      }),
    ).toEqual({
      ok: false,
      code: "order_limit",
    });
    expect(
      market.place({
        holder: ownerHolder(TREASURY),
        cityId: CITY,
        side: "sell",
        price: 9n,
        shares: 10n,
        atMs: T0,
        agendaId: 4,
      }).ok,
    ).toBe(true);
    expect(
      market.place({
        holder: houseHolder(HOUSE),
        cityId: CITY,
        side: "sell",
        price: 9n,
        shares: 50n,
        atMs: T0,
        cap: 20n,
      }),
    ).toEqual({ ok: false, code: "dictatorship_majority" });
  });

  it("도시 화폐가 바뀌거나 도시가 사라지면 회차 때 옛 주문을 거두고 돈을 돌려준다", () => {
    const { ledger, market, setCurrency } = setup();
    market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 10n,
      shares: 10n,
      atMs: T0,
    });
    setCurrency("cur_bb");
    market.run(T0 + ROUND, none);
    expect(market.orders(CITY)).toEqual([]);
    expect(ledger.balanceOf(BUYER, CUR)).toBe(10_000n);
    expect(ledger.balance(ledger.systemAccount(cityShareEscrowCode(CITY, CUR), CUR))).toBe(0n);
    expect(market.check()).toEqual([]);
  });

  it("부팅 복원: 걸린 주문·차례·지난 체결가로 이어 간다", () => {
    const first = setup();
    first.market.place({
      holder: ownerHolder(BUYER),
      cityId: CITY,
      side: "buy",
      price: 7n,
      shares: 5n,
      atMs: T0,
    });
    const open = first.market.orders(CITY).map((order) => ({ ...order }));
    const again = setup({
      open,
      rounds: [],
      lastPrice: new Map([[CITY, 9n]]),
      maxOrderId: 10,
      maxRoundId: 2,
    });
    expect(again.market.orders(CITY)).toHaveLength(1);
    expect(again.market.lastPriceOf(CITY)).toBe(9n);
    const next = again.market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 7n,
      shares: 5n,
      atMs: T0,
    });
    expect(next).toEqual({ ok: true, orderId: 11 });
  });
});

describe("독재 과반 끝(D-344)", () => {
  it("지배 쪽은 (가진 − 판) × 1000 ≥ 501 × (합 − 국고)까지, 국고는 다른 주주 몫이 늘어도 과반이 남는 데까지", () => {
    // 합 1000, 국고 400, 지배 가문 350, 다른 250 → others = 600, 지배 몫 583‰
    const caps = majorityCaps({
      total: 1000n,
      own: 350n,
      others: 600n,
      pendingRuling: 0n,
      pendingTreasury: 0n,
    });
    // 지배 쪽: 350 − s ≥ ⌈501 × 600 ÷ 1000⌉ = 301 → s ≤ 49
    expect(caps?.ruling).toBe(49n);
    // 국고: 600 + t ≤ ⌊350 000 ÷ 501⌋ = 698 → t ≤ 98
    expect(caps?.treasury).toBe(98n);
    // 걸린 팔 주문을 먼저 뺀다
    expect(
      majorityCaps({ total: 1000n, own: 350n, others: 600n, pendingRuling: 49n, pendingTreasury: 98n }),
    ).toEqual({ ruling: 0n, treasury: 0n });
    expect(
      majorityCaps({ total: 0n, own: 0n, others: 0n, pendingRuling: 0n, pendingTreasury: 0n }),
    ).toBeUndefined();
  });
});
