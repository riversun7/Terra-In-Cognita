// 생산시설 지분 시장 시험 — 기획 44 §6(100% 매각 가능·배당은 지분만큼)·D-125(동시호가)·D-555(정산 = 지분 수대로, 대주주),
// docs/adr/2026-11-15-building-screen.md
import { businessLocation, businessShareAsset } from "@terra/shared/businessBooks";
import { START_BUSINESS, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { EMPTY_BUSINESS, createBusinessCore } from "./core.ts";
import { EMPTY_SHARES, createShareMarkets } from "./shares.ts";

const ROUND = START_BUSINESS.shareRoundMs;
const T0 = ROUND * 1_000_000;
const OWNER = 5;
const BUYER = 6;
const OTHER = 7;
const SHOP = 70;
const ASSET = "credit";

function setup() {
  let ids = 1;
  let now = T0 + 10;
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
  const shares = createShareMarkets({
    ledger,
    writer,
    planetId: "p",
    loaded: EMPTY_SHARES,
    asset: ASSET,
    owner: (buildingId) => (buildingId === SHOP ? OWNER : undefined),
    isBusiness: (buildingId) => buildingId === SHOP,
    rules: () => START_BUSINESS,
    now: () => now,
  });
  const core = createBusinessCore({
    ledger,
    writer,
    planetId: "p",
    loaded: EMPTY_BUSINESS,
    place: (buildingId) => (buildingId === SHOP ? { ownerId: OWNER, cityId: null } : undefined),
    businesses: () => [SHOP],
    tax: () => undefined,
    rules: () => START_BUSINESS,
    holders: (buildingId) => shares.holders(buildingId),
  });
  const grant = (ownerId: number, amount: bigint, location: number | null = null) =>
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: ledger.systemAccount("issue:credit", ASSET), amount: -amount },
        { account: ledger.ownerAccount(ownerId, ASSET, location), amount },
      ],
    });
  return {
    ledger,
    shares,
    core,
    ops,
    grant,
    advance: (ms: number) => {
      now += ms;
      return now;
    },
  };
}

describe("생산시설 지분 시장", () => {
  it("발행 전에는 주인이 발행 수를 모두 가진 것으로 보고 주인이 관리한다", () => {
    const { shares, core } = setup();
    expect(shares.issued(SHOP)).toBe(0n);
    expect(shares.holders(SHOP)).toEqual([{ ownerId: OWNER, shares: 1000n }]);
    expect(core.mayManage(SHOP, OWNER)).toBe(true);
    expect(core.mayManage(SHOP, BUYER)).toBe(false);
  });

  it("주문이 들어오면 주인에게 한 번 발행하고, 회차에 한 값으로 체결해 남은 몫은 다음 회차에 걸어 둔다(D-587 2472 나)", () => {
    const { shares, ledger, grant, advance, ops } = setup();
    grant(BUYER, 10_000n);
    const sell = shares.place(OWNER, SHOP, "sell", 5n, 400n, T0 + 10);
    expect(sell.ok).toBe(true);
    expect(shares.issued(SHOP)).toBe(1000n);
    expect(ledger.balanceOf(OWNER, businessShareAsset(SHOP))).toBe(600n);
    // 걸어 둔 팔 주문의 주도 주인 몫이다(배당·대주주)
    expect(shares.sharesOf(SHOP, OWNER)).toBe(1000n);
    const buy = shares.place(BUYER, SHOP, "buy", 6n, 300n, T0 + 20);
    expect(buy.ok).toBe(true);
    expect(ledger.balanceOf(BUYER, ASSET)).toBe(10_000n - 1800n);
    // 호가창(D-583 "호가창처럼"): 값마다 걸린 주, 지금 닫으면 날 값
    const before = shares.view(SHOP, BUYER, T0 + 25);
    expect(before.book).toEqual({
      bids: [{ price: "6", shares: "300", orders: 1 }],
      asks: [{ price: "5", shares: "400", orders: 1 }],
    });
    expect(before.expected).toEqual({ price: "5", shares: "300" });
    // 회차 경계 전에는 체결하지 않는다
    expect(shares.tick(T0 + 30)).toBe(0);
    expect(shares.tick(advance(ROUND))).toBe(1);
    // 체결가 = 체결량이 같으면 남는 양이 작은 값 → 같으면 낮은 값(5)
    expect(ledger.balanceOf(BUYER, businessShareAsset(SHOP))).toBe(300n);
    expect(ledger.balanceOf(BUYER, ASSET)).toBe(10_000n - 1500n);
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(1500n);
    // 팔리지 않은 100주는 묶인 채 걸려 있다(주인 몫으로 센다)
    expect(ledger.balanceOf(OWNER, businessShareAsset(SHOP))).toBe(600n);
    expect(shares.view(SHOP, OWNER, T0 + ROUND + 20).myOrders).toEqual([
      { id: sell.ok ? sell.orderId : 0, side: "sell", price: "5", shares: "100" },
    ]);
    expect(shares.holders(SHOP)).toEqual([
      { ownerId: OWNER, shares: 700n },
      { ownerId: BUYER, shares: 300n },
    ]);
    expect(shares.check()).toEqual([]);
    const view = shares.view(SHOP, BUYER, T0 + ROUND + 20);
    expect(view.lastPrice).toBe("5");
    expect(view.myShares).toBe("300");
    expect(view.rounds).toEqual([{ atMs: T0 + ROUND, price: "5", shares: "300" }]);
    expect(ops.some((op) => op.table === "businessShareRounds")).toBe(true);
    expect(ops.filter((op) => op.table === "businessShareOrders" && op.row.state === "done")).toHaveLength(1);
    const open = ops.filter((op) => op.table === "businessShareOrders" && op.row.state === "open").at(-1);
    expect(open?.row).toEqual(expect.objectContaining({ shares: 100n, filled: 300n, locked: 100n }));
  });

  it("다시 켜도 남은 주문을 되살리고, 판 쪽은 거래세(국고)·이용료(거래소 금고)를 낸다(D-587 2474 다)", () => {
    let ids = 1;
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
    const paid: bigint[] = [];
    const make = (loaded = EMPTY_SHARES) =>
      createShareMarkets({
        ledger,
        writer,
        planetId: "p",
        loaded,
        asset: ASSET,
        owner: (buildingId) => (buildingId === SHOP ? OWNER : undefined),
        isBusiness: (buildingId) => buildingId === SHOP,
        rules: () => START_BUSINESS,
        now: () => T0,
        cityOf: () => 3,
        levy: () => ({
          rateOf: () => ({ treasuryOwner: 99, taxBp: 1000, fee: { buildingId: 500, bp: 200 } }),
          pay: ({ amount }) => paid.push(amount),
        }),
      });
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: ledger.systemAccount("issue:credit", ASSET), amount: -10_000n },
        { account: ledger.ownerAccount(BUYER, ASSET), amount: 10_000n },
      ],
    });
    const first = make();
    const sell = first.place(OWNER, SHOP, "sell", 10n, 50n, T0);
    if (!sell.ok) throw new Error("sell");
    // 다시 켬: 걸린 줄(지금까지 체결 0)에서 시장을 되살린다
    const row = ops.findLast((op) => op.table === "businessShareOrders")?.row;
    const second = make({
      ...EMPTY_SHARES,
      open: [
        {
          buildingId: SHOP,
          placedAtMs: T0,
          filled: 0n,
          order: {
            id: sell.orderId,
            owner: OWNER,
            side: "sell",
            price: 10n,
            lots: BigInt(String(row?.shares)),
            seq: 1,
          },
        },
      ],
      maxOrderId: sell.orderId,
    });
    expect(second.place(BUYER, SHOP, "buy", 10n, 20n, T0).ok).toBe(true);
    expect(second.tick(T0 + ROUND)).toBe(1);
    // 20주 × 10 = 200: 거래세 10% = 20 → 국고 99, 이용료 2% = 4 → 거래소(pay 고리)
    expect(ledger.balanceOf(99, ASSET)).toBe(20n);
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(180n);
    expect(paid).toEqual([4n]);
    expect(ledger.balanceOf(BUYER, businessShareAsset(SHOP))).toBe(20n);
    expect(second.check()).toEqual([]);
  });

  it("정산은 지분 수대로 나누고, 100% 가까이 사면 경영권(관리)이 넘어간다", () => {
    const { shares, core, ledger, grant, advance } = setup();
    grant(BUYER, 100_000n);
    shares.place(OWNER, SHOP, "sell", 10n, 600n, T0 + 10);
    shares.place(BUYER, SHOP, "buy", 10n, 600n, T0 + 20);
    shares.tick(advance(ROUND));
    expect(core.mayManage(SHOP, BUYER)).toBe(true);
    expect(core.mayManage(SHOP, OWNER)).toBe(false);
    grant(OWNER, 1000n, businessLocation(SHOP));
    const paid = core.settle(SHOP, T0 + ROUND + 30);
    expect(paid.get(ASSET)).toBe(1000n);
    expect(ledger.balanceOf(BUYER, ASSET)).toBe(100_000n - 6000n + 600n);
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(6000n + 400n);
  });

  it("지갑·지분이 모자라거나 회차당 주문 수를 넘으면 거절하고, 거두면 묶은 것을 돌려준다", () => {
    const { shares, ledger, grant } = setup();
    expect(shares.place(BUYER, SHOP, "buy", 5n, 10n, T0)).toEqual({ ok: false, code: "insufficient_funds" });
    expect(shares.place(OTHER, SHOP, "sell", 5n, 1n, T0)).toEqual({ ok: false, code: "insufficient_shares" });
    expect(shares.place(BUYER, 999, "buy", 5n, 1n, T0)).toEqual({ ok: false, code: "unknown_building" });
    grant(BUYER, 1_000n);
    const ids: number[] = [];
    for (let i = 0; i < START_BUSINESS.shareOrderMax; i++) {
      const placed = shares.place(BUYER, SHOP, "buy", 1n, 1n, T0);
      if (placed.ok) ids.push(placed.orderId);
    }
    expect(ids).toHaveLength(START_BUSINESS.shareOrderMax);
    expect(shares.place(BUYER, SHOP, "buy", 1n, 1n, T0)).toEqual({ ok: false, code: "order_limit" });
    expect(ledger.balanceOf(BUYER, ASSET)).toBe(1_000n - BigInt(START_BUSINESS.shareOrderMax));
    expect(shares.cancel(OTHER, ids[0] ?? 0, T0)).toEqual({ ok: false, code: "forbidden" });
    expect(shares.cancel(BUYER, ids[0] ?? 0, T0)).toEqual({ ok: true });
    expect(shares.cancel(BUYER, 123_456, T0)).toEqual({ ok: false, code: "unknown_order" });
    // 사라진 건물: 남은 주문을 모두 돌려준다
    shares.forget(SHOP, T0);
    expect(ledger.balanceOf(BUYER, ASSET)).toBe(1_000n);
    expect(shares.check()).toEqual([]);
  });
});
