// 물자 거래소 에스크로 부팅 손질 시험(줄기 escrow-fix, docs/questions/2026-11-22-escrow-fix.md) — 원장은 시뮬 장부(메모리), 쓰기 대기열은 가짜.
// - 묶음 크기가 바뀐 뒤 남은 옛 팔 주문(팩 core@137 광석 1kg·1개 → 10kg 묶음): 되살리지 않고 묶은 양 그대로 돌려준다 → 에스크로 불변식이 맞다.
// - 남은 물건 에스크로 차이: 짝 계정 reconcile:escrow:<자산>과 맞바꾸고, 다시 하면 아무것도 하지 않는다.
// - 체결 알림이 던져도 주문 줄은 원장 거래와 같은 쓰기 묶음에 들어간다.
import { type LedgerBook, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { EMPTY_MARKETS, type LoadedMarkets, type MarketRegistry, createMarketRegistry } from "./books.ts";
import { escrowReconcileCode, logEscrowRepair, reconcileGoodsEscrow } from "./escrowRepair.ts";

const T0 = 1_800_000_000_000;
const CITY = 3;
const NPC = 10;
const USER = 20;
const CREDIT = "s3_test_credit";
const ORE = "item:iron_ore";

function fakeWriter() {
  const ops: { op: "upsert" | "remove" | "append"; table: WorldTable; row: Row }[] = [];
  const writer: WorldWriter = {
    upsert: (table, row) => ops.push({ op: "upsert", table, row }),
    remove: (table, row) => ops.push({ op: "remove", table, row }),
    append: (table, row) => ops.push({ op: "append", table, row }),
    durable: () => Promise.resolve(),
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
  return { writer, ops };
}

function ledger(): LedgerBook {
  let account = 0;
  let tx = 0;
  return createLedgerBook({ nextAccountId: () => ++account, nextTxId: () => ++tx });
}

function endow(book: LedgerBook, owner: number, asset: string, qty: bigint, location: number | null): void {
  book.post({
    kind: "endow",
    atMs: T0,
    entries: [
      { account: book.systemAccount(`source:${asset}`, asset), amount: -qty },
      { account: book.ownerAccount(owner, asset, location), amount: qty },
    ],
  });
}

function registry(
  book: LedgerBook,
  writer: WorldWriter,
  lotSize: bigint,
  loaded: LoadedMarkets = EMPTY_MARKETS,
) {
  return createMarketRegistry({
    ledger: book,
    writer,
    loaded,
    allowed: (cityId) => cityId === CITY,
    configOf: () => ({ currency: CREDIT, taxBp: 0, treasuryOwner: NPC, lotSize }),
    isUser: (ownerId) => ownerId === USER,
    now: () => T0,
  });
}

/** 지금 메모리 거래소를 부팅 때 읽은 모양으로(줄의 locked = 그때 묶음 크기 × 남은 묶음 — books.ts writeOpen과 같다) */
function snapshotOf(markets: MarketRegistry, lot: bigint): LoadedMarkets {
  const books = [...markets.books()];
  return {
    books: books.map((entry) => ({
      id: entry.id,
      cityId: entry.cityId,
      item: entry.item,
      currency: CREDIT,
      createdAtMs: T0,
    })),
    open: books.flatMap((entry) =>
      entry.market.orders().map((order) => ({
        marketId: entry.id,
        qty: order.remaining,
        placedAtMs: T0,
        locked: order.side === "sell" ? order.remaining * lot : order.price * order.remaining,
        order: { ...order },
      })),
    ),
    done: [],
    trades: [],
    maxOrderId: 50,
    maxTradeId: 0,
    maxBookId: books.length,
  };
}

describe("거래소 에스크로 부팅 손질", () => {
  it("묶음 크기가 바뀐 뒤 남은 옛 팔 주문은 되살리지 않고 묶은 양 그대로 돌려준다(에스크로 불변식이 맞다)", () => {
    const book = ledger();
    endow(book, USER, ORE, 5_000n, CITY);
    endow(book, NPC, ORE, 4_000n, CITY);
    endow(book, USER, CREDIT, 1_000n, null);
    // 옛 판: 철광석 묶음 1kg(1,000g)
    const before = registry(book, fakeWriter().writer, 1_000n);
    const ore = before.book(CITY, ORE);
    if (!ore) throw new Error("market");
    const ask = ore.market.place(USER, "sell", 9n, 3n, T0, T0 + 10_000);
    const npcAsk = ore.market.place(NPC, "sell", 8n, 4n, T0, T0 + 10_000);
    const bid = ore.market.place(USER, "buy", 2n, 5n, T0, T0 + 10_000);
    if (!ask.ok || !npcAsk.ok || !bid.ok) throw new Error("orders");
    expect(book.balanceOf(USER, ORE, CITY)).toBe(2_000n);
    const loaded = snapshotOf(before, 1_000n);

    // 새 판: 묶음 10kg(10,000g). 옛 판처럼 지금 묶음 크기로 되살리면 에스크로(7,000g) ≠ 남은 7묶음 × 10,000g
    const { writer, ops } = fakeWriter();
    const after = registry(book, writer, 10_000n, loaded);
    const restored = after.existing(CITY, ORE);
    expect(restored?.market.orders().map((order) => order.id)).toEqual([bid.orderId]);
    expect(after.check()).toEqual([]);
    // 묶은 양 그대로 돌려받는다(유저 3kg, NPC 4kg — 물건이 생기거나 사라지지 않는다)
    expect(book.balanceOf(USER, ORE, CITY)).toBe(5_000n);
    expect(book.balanceOf(NPC, ORE, CITY)).toBe(4_000n);
    expect(after.relotted().map((row) => [row.orderId, row.locked, row.lot])).toEqual([
      [ask.orderId, 3_000n, 10_000n],
      [npcAsk.orderId, 4_000n, 10_000n],
    ]);
    // 유저 주문은 취소로 남고(locked 0), NPC 주문 줄은 지운다
    const userRow = ops.filter((op) => op.table === "marketOrders" && op.row.id === ask.orderId).at(-1);
    expect(userRow?.row).toMatchObject({ state: "cancelled", remaining: 3n, locked: 0n });
    expect(ops.some((op) => op.op === "remove" && op.row.id === npcAsk.orderId)).toBe(true);
    expect(after.doneOf(USER).map((row) => row.state)).toEqual(["cancelled"]);
    // 맞출 차이는 없다
    expect(reconcileGoodsEscrow(after, book, T0).adjusted).toEqual([]);
  });

  it("묶음 크기가 그대로면 아무것도 돌려주지 않는다", () => {
    const book = ledger();
    endow(book, USER, ORE, 30_000n, CITY);
    const before = registry(book, fakeWriter().writer, 10_000n);
    const placed = before.book(CITY, ORE)?.market.place(USER, "sell", 9n, 2n, T0, T0 + 10_000);
    if (!placed?.ok) throw new Error("ask");
    const after = registry(book, fakeWriter().writer, 10_000n, snapshotOf(before, 10_000n));
    expect(after.existing(CITY, ORE)?.market.orders()).toHaveLength(1);
    expect(after.relotted()).toEqual([]);
    expect(after.check()).toEqual([]);
    expect(reconcileGoodsEscrow(after, book, T0)).toEqual({ relotted: [], adjusted: [] });
  });

  it("남은 물건 에스크로 차이를 짝 계정으로 맞추고(되살리지 않은 거래소 포함), 다시 하면 아무것도 하지 않는다", () => {
    const book = ledger();
    endow(book, USER, ORE, 30_000n, CITY);
    const first = registry(book, fakeWriter().writer, 10_000n);
    const ore = first.book(CITY, ORE);
    if (!ore) throw new Error("market");
    const placed = ore.market.place(USER, "sell", 9n, 2n, T0, T0 + 10_000);
    if (!placed.ok) throw new Error("ask");
    // 망가진 옛 세계: 거래소 1 에스크로가 7,000g 모자라고(옛 묶음으로 돌려준 흔적), 주문 없는 거래소 9에 300g이 남았다
    const escrowOf = (id: number) => book.systemAccount(`escrow:goods:${String(id)}`, ORE, CITY);
    book.post({
      kind: "test_damage",
      atMs: T0,
      entries: [
        { account: escrowOf(ore.id), amount: -7_000n },
        { account: escrowOf(9), amount: 300n },
        { account: book.systemAccount(`source:${ORE}`, ORE), amount: 6_700n },
      ],
    });
    const again = registry(book, fakeWriter().writer, 10_000n, snapshotOf(first, 10_000n));
    expect(again.check()).toEqual([`escrow goods mismatch in market ${String(ore.id)}`]);
    const warnings: string[] = [];
    const repair = reconcileGoodsEscrow(again, book, T0 + 1);
    expect(logEscrowRepair({ warn: (_obj, message) => warnings.push(message) }, repair)).toBe(true);
    expect(warnings).toEqual(["market escrow repaired after restore"]);
    expect(repair.adjusted).toEqual([
      { marketId: ore.id, asset: ORE, escrow: 13_000n, expected: 20_000n, diff: -7_000n },
      { marketId: 9, asset: ORE, escrow: 300n, expected: 0n, diff: 300n },
    ]);
    expect(again.check()).toEqual([]);
    expect(book.balance(escrowOf(9))).toBe(0n);
    // 짝 계정 = 맞춘 차이의 합(남는 300 − 채운 7,000)
    expect(book.balance(book.systemAccount(escrowReconcileCode(ORE), ORE))).toBe(-6_700n);
    // 유저 물건은 그대로(누구에게도 주거나 빼지 않는다)
    expect(book.balanceOf(USER, ORE, CITY)).toBe(10_000n);
    // 한 번 더: 맞출 것이 없다
    expect(reconcileGoodsEscrow(again, book, T0 + 2).adjusted).toEqual([]);
    expect(logEscrowRepair({ warn: () => warnings.push("again") }, { relotted: [], adjusted: [] })).toBe(
      false,
    );
    expect(warnings).toHaveLength(1);
  });

  it("체결 알림이 던져도 주문 줄(걸어 둔 나머지·다 찬 걸린 주문)을 원장 거래와 함께 쓴다", () => {
    const book = ledger();
    endow(book, NPC, ORE, 40_000n, CITY);
    endow(book, USER, CREDIT, 1_000n, null);
    const { writer, ops } = fakeWriter();
    const markets = registry(book, writer, 10_000n);
    const ore = markets.book(CITY, ORE);
    if (!ore) throw new Error("market");
    const ask = ore.market.place(NPC, "sell", 5n, 2n, T0, T0 + 10_000);
    if (!ask.ok) throw new Error("ask");
    markets.onFill(() => {
      throw new Error("listener failed");
    });
    // 유저가 3묶음을 산다: 2묶음 체결(알림이 던진다), 1묶음은 걸어 둔다
    expect(() => ore.market.place(USER, "buy", 5n, 3n, T0 + 1, T0 + 10_000)).toThrow("listener failed");
    expect(book.balanceOf(USER, ORE, CITY)).toBe(20_000n);
    // 다 찬 NPC 주문 줄은 지우고, 유저 주문은 남은 1묶음으로 걸린 줄(locked = 값 × 남은 묶음)
    expect(ops.some((op) => op.op === "remove" && op.row.id === ask.orderId)).toBe(true);
    const bid = ore.market.orders().find((order) => order.owner === USER);
    const row = ops.filter((op) => op.table === "marketOrders" && op.row.id === bid?.id).at(-1);
    expect(row?.row).toMatchObject({ state: "open", remaining: 1n, locked: 5n });
    expect(markets.check()).toEqual([]);
  });
});
