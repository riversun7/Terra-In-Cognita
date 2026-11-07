// 거래소 모음 시험(docs/adr/2026-11-07-play-flow.md WP4) — 처음 쓸 때 만들기·ID 고정, 주문·체결 줄 쓰기(유저는 남기고 NPC는 지움),
// 부팅 복원(같은 차례·에스크로), 없는 도시 닫기, 만료, 나라 화폐로 바꾸기(WP6: 남긴 화폐로 되살린 뒤 돌려주고 바꿈). 원장은 시뮬 장부(메모리),
// 쓰기 대기열은 가짜.
import { type LedgerBook, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { EMPTY_MARKETS, type LoadedMarkets, createMarketRegistry } from "./books.ts";

const T0 = 1_800_000_000_000;
const CITY = 3;
const NPC = 10;
const USER = 20;
const CREDIT = "s3_test_credit";

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

/** 주인에게 물건(도시 창고)·화폐를 준다 */
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
  loaded: LoadedMarkets = EMPTY_MARKETS,
  currency = CREDIT,
) {
  return createMarketRegistry({
    ledger: book,
    writer,
    loaded,
    allowed: (cityId, asset) => cityId === CITY && asset !== "item:iron_sword",
    configOf: () => ({ currency, taxBp: 200, treasuryOwner: NPC, lotSize: 1n }),
    isUser: (ownerId) => ownerId === USER,
    now: () => T0,
  });
}

describe("거래소 모음", () => {
  it("처음 쓸 때 만들고 ID를 남긴다. 둘 수 없는 도시·물건은 만들지 않는다", () => {
    const { writer, ops } = fakeWriter();
    const markets = registry(ledger(), writer);
    expect(markets.existing(CITY, "item:grain")).toBeUndefined();
    // 시뮬 NPC 규칙처럼 도시 표의 get으로 찾으면 만든다
    markets.ensureCity(CITY);
    const viaMap = markets.markets.get(CITY)?.get("item:grain");
    expect(viaMap).toBeDefined();
    expect(markets.existing(CITY, "item:grain")?.id).toBe(1);
    expect(markets.book(CITY, "item:grain")?.id).toBe(1);
    expect(markets.book(CITY, "item:iron_sword")).toBeUndefined();
    expect(markets.book(99, "item:grain")).toBeUndefined();
    expect(ops.filter((op) => op.table === "marketBooks").map((op) => op.row)).toEqual([
      { id: 1, city_id: CITY, item: "grain", created_at_ms: T0, currency: CREDIT },
    ]);
  });

  it("체결: 체결 줄을 더하고, NPC 주문 줄은 끝나면 지우며, 유저 주문은 끝난 상태로 남는다", () => {
    const book = ledger();
    const { writer, ops } = fakeWriter();
    const markets = registry(book, writer);
    endow(book, NPC, "item:grain", 10n, CITY);
    endow(book, USER, CREDIT, 1_000n, null);
    const grain = markets.book(CITY, "item:grain");
    if (!grain) throw new Error("market");
    const ask = grain.market.place(NPC, "sell", 5n, 4n, T0, T0 + 1_000);
    if (!ask.ok) throw new Error("ask");
    const fills: bigint[] = [];
    markets.onFill((notice) => fills.push(notice.makerRemaining));
    // 유저가 6개를 7에 산다: 4개 체결(5에), 2개는 걸어 둔다(묶은 값 차이는 돌려받음)
    const bid = grain.market.place(USER, "buy", 7n, 6n, T0 + 10, T0 + 2_000);
    if (!bid.ok) throw new Error("bid");
    expect(book.balanceOf(USER, "item:grain", CITY)).toBe(4n);
    expect(book.balanceOf(USER, CREDIT)).toBe(1_000n - 20n - 14n);
    expect(fills).toEqual([0n]);
    const trades = ops.filter((op) => op.table === "marketTrades");
    expect(trades).toHaveLength(1);
    expect(trades[0]?.row).toMatchObject({
      price: 5n,
      qty: 4n,
      taker_side: "buy",
      maker_order_id: ask.orderId,
      currency: CREDIT,
    });
    // NPC 주문(다 참)은 지우고, 유저 주문은 걸어 둔 줄(남은 2, locked 14)
    expect(ops.some((op) => op.op === "remove" && op.row.id === ask.orderId)).toBe(true);
    const open = ops.filter((op) => op.table === "marketOrders" && op.row.id === bid.orderId).at(-1);
    expect(open?.row).toMatchObject({ state: "open", qty: 6n, remaining: 2n, locked: 14n });
    // 취소: 끝난 상태로 남고 메모리 끝난 주문에 든다
    grain.market.cancel(bid.orderId, T0 + 20);
    const done = ops.filter((op) => op.table === "marketOrders" && op.row.id === bid.orderId).at(-1);
    expect(done?.row).toMatchObject({ state: "cancelled", remaining: 2n, locked: 0n, done_at_ms: T0 + 20 });
    expect(markets.doneOf(USER)[0]).toMatchObject({ id: bid.orderId, state: "cancelled", filled: 4n });
    expect(book.balanceOf(USER, CREDIT)).toBe(1_000n - 20n);
    expect(markets.check()).toEqual([]);
  });

  it("다 찬 들어온 주문도 유저면 끝난 줄(체결)로 남는다. 만료는 거두고 돌려준다", () => {
    const book = ledger();
    const { writer, ops } = fakeWriter();
    const markets = registry(book, writer);
    endow(book, NPC, "item:grain", 10n, CITY);
    endow(book, USER, CREDIT, 100n, null);
    const grain = markets.book(CITY, "item:grain");
    if (!grain) throw new Error("market");
    grain.market.place(NPC, "sell", 5n, 10n, T0, T0 + 50);
    const taker = grain.market.place(USER, "buy", 5n, 3n, T0, T0 + 500);
    if (!taker.ok) throw new Error("taker");
    const row = ops.filter((op) => op.table === "marketOrders" && op.row.id === taker.orderId).at(-1);
    expect(row?.row).toMatchObject({ state: "filled", qty: 3n, remaining: 0n });
    // NPC 남은 7개는 만료 시각에 돌려받는다(줄은 지움)
    expect(markets.expire(T0 + 50)).toBe(1);
    expect(book.balanceOf(NPC, "item:grain", CITY)).toBe(7n);
    expect(grain.market.orders()).toEqual([]);
    expect(markets.check()).toEqual([]);
  });

  it("부팅 복원: 걸린 주문을 같은 차례로 놓고 끝난 주문·체결을 채운다. 없는 도시의 주문은 돌려준다", () => {
    const book = ledger();
    endow(book, USER, "item:grain", 5n, CITY);
    endow(book, USER, "item:grain", 2n, 7);
    const { writer } = fakeWriter();
    const first = registry(book, writer);
    const grain = first.book(CITY, "item:grain");
    if (!grain) throw new Error("market");
    const a = grain.market.place(USER, "sell", 9n, 2n, T0, T0 + 10_000);
    const b = grain.market.place(USER, "sell", 9n, 3n, T0 + 1, T0 + 10_000);
    if (!a.ok || !b.ok) throw new Error("asks");
    const loaded: LoadedMarkets = {
      books: [
        { id: grain.id, cityId: CITY, item: "grain", currency: CREDIT, createdAtMs: T0 },
        { id: 2, cityId: 7, item: "grain", currency: null, createdAtMs: T0 },
      ],
      open: grain.market
        .orders()
        .map((order) => ({ marketId: grain.id, qty: order.remaining, placedAtMs: T0, order: { ...order } })),
      done: [],
      trades: [
        {
          id: 1,
          marketId: grain.id,
          at: T0 - 5,
          price: 8n,
          qty: 1n,
          side: "buy",
          makerOrderId: 1,
          takerOrderId: 2,
          makerOwner: NPC,
          takerOwner: USER,
          currency: CREDIT,
        },
      ],
      maxOrderId: 2,
      maxTradeId: 1,
      maxBookId: 2,
    };
    // 도시 7(폐허)에 유저 주문 하나가 걸려 있었다(에스크로 2)
    book.post({
      kind: "order_escrow",
      atMs: T0,
      entries: [
        { account: book.ownerAccount(USER, "item:grain", 7), amount: -2n },
        { account: book.systemAccount("escrow:goods:2", "item:grain", 7), amount: 2n },
      ],
    });
    const again = registry(book, fakeWriter().writer, {
      ...loaded,
      open: [
        ...loaded.open,
        {
          marketId: 2,
          qty: 2n,
          placedAtMs: T0,
          order: {
            id: 99,
            owner: USER,
            side: "sell",
            price: 4n,
            expiresAtMs: T0 + 9_000,
            seq: 1,
            remaining: 2n,
          },
        },
      ],
      maxOrderId: 99,
    });
    const restored = again.existing(CITY, "item:grain");
    expect(restored?.market.orders().map((order) => order.id)).toEqual([a.orderId, b.orderId]);
    expect(restored?.trades.map((trade) => trade.price)).toEqual([8n]);
    expect(again.openOf(USER)).toHaveLength(3);
    expect(again.check()).toEqual([]);
    expect(again.dropCity(7, T0 + 5)).toBe(1);
    expect(book.balanceOf(USER, "item:grain", 7)).toBe(2n);
    expect(again.markets.has(7)).toBe(false);
    // 새 주문 ID는 읽은 상한 다음
    endow(book, USER, CREDIT, 100n, null);
    const next = again.book(CITY, "item:grain")?.market.place(USER, "buy", 1n, 1n, T0 + 6, T0 + 100);
    expect(next?.ok && next.orderId).toBe(100);
  });

  it("나라 화폐: 남긴 화폐(빈 칸 = 시험 화폐)로 걸린 주문을 되살린 뒤 돌려주고 도시 화폐로 바꾼다. 옛 체결은 차트에서 뺀다", () => {
    const NATION = "cur:placeholder_cur_16";
    const book = ledger();
    endow(book, USER, CREDIT, 100n, null);
    endow(book, USER, "item:grain", 4n, CITY);
    const first = registry(book, fakeWriter().writer);
    const grain = first.book(CITY, "item:grain");
    if (!grain) throw new Error("market");
    const bid = grain.market.place(USER, "buy", 6n, 5n, T0, T0 + 10_000);
    const ask = grain.market.place(USER, "sell", 9n, 4n, T0, T0 + 10_000);
    if (!bid.ok || !ask.ok) throw new Error("orders");
    expect(book.balanceOf(USER, CREDIT)).toBe(70n);
    const { writer, ops } = fakeWriter();
    const again = registry(
      book,
      writer,
      {
        // WP4 판 앱이 쓴 줄: 화폐 칸이 비었다
        books: [
          { id: grain.id, cityId: CITY, item: "grain", currency: null, createdAtMs: T0 - 1 },
          { id: 2, cityId: CITY, item: "timber", currency: null, createdAtMs: T0 - 1 },
        ],
        open: grain.market.orders().map((order) => ({
          marketId: grain.id,
          qty: order.remaining,
          placedAtMs: T0,
          order: { ...order },
        })),
        done: [],
        trades: [
          {
            id: 1,
            marketId: grain.id,
            at: T0 - 5,
            price: 8n,
            qty: 1n,
            side: "buy",
            makerOrderId: 1,
            takerOrderId: 2,
            makerOwner: NPC,
            takerOwner: USER,
            currency: CREDIT,
          },
        ],
        maxOrderId: 2,
        maxTradeId: 1,
        maxBookId: 2,
      },
      NATION,
    );
    const restored = again.existing(CITY, "item:grain");
    // 걸린 주문은 시험 화폐 에스크로에서 돌려받고(취소로 끝남), 거래소는 나라 화폐가 된다
    expect(restored?.market.config.currency).toBe(NATION);
    expect(restored?.market.orders()).toEqual([]);
    expect(restored?.trades).toEqual([]);
    expect(book.balanceOf(USER, CREDIT)).toBe(100n);
    expect(book.balanceOf(USER, "item:grain", CITY)).toBe(4n);
    expect(again.doneOf(USER).map((row) => row.state)).toEqual(["cancelled", "cancelled"]);
    expect(again.check()).toEqual([]);
    const rows = ops.filter((op) => op.table === "marketBooks").map((op) => op.row);
    expect(rows).toEqual([
      { id: grain.id, city_id: CITY, item: "grain", created_at_ms: T0 - 1, currency: NATION },
    ]);
    // 쓰지 않던 옛 거래소도 처음 쓸 때 줄의 화폐를 고친다
    expect(again.book(CITY, "item:timber")?.market.config.currency).toBe(NATION);
    expect(ops.filter((op) => op.table === "marketBooks").at(-1)?.row).toMatchObject({
      id: 2,
      currency: NATION,
    });
  });
});
