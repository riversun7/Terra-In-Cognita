// 거래소 건물 2(기획 D-571, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)") 시험 — 이용료(1948), NPC 거래소 건물·운반 시간(1945),
// 개인 창고 쓰는 무게(1943). 원장은 시뮬 장부(메모리), 쓰기 대기열은 가짜.
import { buildingLocation, cargoLocation } from "@terra/shared/goodsPlaces";
import { type LedgerBook, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { WorldWriter } from "../world/persist/writer.ts";
import { EMPTY_MARKETS, type MarketRegistryOptions, createMarketRegistry } from "./books.ts";
import { createLockers, lockerUsedG } from "./lockers.ts";
import { createCarryBoard } from "../npc/npcCarry.ts";

const T0 = 1_800_000_000_000;
const CITY = 3;
const EXCHANGE = 77;
const NPC = 10;
const USER = 20;
const CREDIT = "s3_test_credit";
const HAUL_MS = 60_000;

const writer: WorldWriter = {
  upsert: () => {},
  remove: () => {},
  append: () => {},
  durable: () => Promise.resolve(),
  drain: () => Promise.resolve(),
  pendingCount: 0,
  takeMetrics: () => ({}),
  crash: () => Promise.resolve(),
};

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

function registry(book: LedgerBook, extra: Partial<MarketRegistryOptions>) {
  return createMarketRegistry({
    ledger: book,
    writer,
    loaded: EMPTY_MARKETS,
    allowed: (cityId) => cityId === CITY,
    configOf: () => ({ currency: CREDIT, taxBp: 200, treasuryOwner: NPC, lotSize: 1n }),
    isUser: (ownerId) => ownerId === USER,
    now: () => T0,
    ...extra,
  });
}

describe("거래소 건물 2", () => {
  it("이용료: 체결마다 판 쪽이 총액 × 만분율을 그 거래소 건물에 낸다(거래세와 따로, 1948)", () => {
    const book = ledger();
    const charged: { seller: number; amount: bigint; buildingId: number }[] = [];
    const markets = registry(book, {
      exchangeOf: () => EXCHANGE,
      fee: {
        of: () => ({ buildingId: EXCHANGE, bp: 100 }),
        charge: ({ seller, amount, buildingId }) => charged.push({ seller, amount, buildingId }),
      },
    });
    endow(book, USER, "item:grain", 10n, buildingLocation(EXCHANGE));
    endow(book, 30, CREDIT, 10_000n, null);
    const grain = markets.book(CITY, "item:grain");
    expect(grain?.market.place(USER, "sell", 500n, 4n, T0, T0 + 1000).ok).toBe(true);
    // 다른 유저가 아니라 NPC가 아닌 주체 30(유저 아님 — NPC 고리 없음)이 산다
    expect(grain?.market.place(30, "buy", 500n, 4n, T0, T0 + 1000).ok).toBe(true);
    // 총액 2000 × 100 ÷ 10000 = 20, 판 쪽(USER)
    expect(charged).toEqual([{ seller: USER, amount: 20n, buildingId: EXCHANGE }]);
  });

  it("NPC: 거래소 건물이 없으면 주문을 받지 않는다(1945)", () => {
    const book = ledger();
    const markets = registry(book, { exchangeOf: () => undefined, npcHaul: { haulMs: () => HAUL_MS } });
    endow(book, NPC, CREDIT, 1_000n, null);
    const grain = markets.book(CITY, "item:grain");
    expect(grain?.market.place(NPC, "buy", 5n, 2n, T0, T0 + 1000).ok).toBe(false);
  });

  it("NPC 팔기: 거래소 건물 창고에 있는 만큼 바로 걸고, 나머지는 운반 시간 뒤에 도시 창고에서 옮겨 건다(1945)", () => {
    const book = ledger();
    const markets = registry(book, { exchangeOf: () => EXCHANGE, npcHaul: { haulMs: () => HAUL_MS } });
    endow(book, NPC, "item:grain", 3n, buildingLocation(EXCHANGE));
    endow(book, NPC, "item:grain", 10n, CITY);
    const grain = markets.book(CITY, "item:grain");
    expect(grain?.market.place(NPC, "sell", 5n, 8n, T0, T0 + 3_600_000).ok).toBe(true);
    expect(grain?.market.orders().map((order) => order.remaining)).toEqual([3n]);
    expect(markets.npcHaulPending()).toBe(1);
    // 아직 닿지 않음
    markets.expire(T0 + HAUL_MS - 1);
    expect(grain?.market.orders().length).toBe(1);
    expect(book.balanceOf(NPC, "item:grain", CITY)).toBe(10n);
    // 닿음: 도시 창고 5 → 거래소 건물 창고 → 걸린 팔기
    markets.expire(T0 + HAUL_MS);
    expect(book.balanceOf(NPC, "item:grain", CITY)).toBe(5n);
    expect(
      grain?.market
        .orders()
        .map((order) => order.remaining)
        .toSorted((a, b) => Number(a - b)),
    ).toEqual([3n, 5n]);
    expect(markets.check()).toEqual([]);
  });

  it("보이는 NPC 운반꾼(기획 대조 2088): 보는 2차맵은 일 없는 휴먼이 화물을 지고 가고, 닿은 만큼만 건다(빼앗긴 것은 오르지 않는다)", () => {
    const book = ledger();
    const board = createCarryBoard(book);
    const markets = registry(book, {
      exchangeOf: () => EXCHANGE,
      npcHaul: { haulMs: () => HAUL_MS, carry: { board, centerOf: () => ({ x: 40, y: 50 }) } },
    });
    endow(book, NPC, "item:grain", 10n, CITY);
    const grain = markets.book(CITY, "item:grain");
    expect(grain?.market.place(NPC, "sell", 5n, 6n, T0, T0 + 3_600_000).ok).toBe(true);
    const trip = board.idle(CITY, T0)[0];
    expect(trip).toMatchObject({ key: "x:1", x: 40, y: 50, untilMs: T0 + HAUL_MS });
    // 운반꾼 501이 진다(humanPlaces.ts가 알린다) → 도시 창고에서 화물로
    expect(board.load("x:1", 501, T0 + 1)).toBe(true);
    expect(book.balanceOf(NPC, "item:grain", cargoLocation(501))).toBe(6n);
    expect(book.balanceOf(NPC, "item:grain", CITY)).toBe(4n);
    // 약탈로 2를 잃음
    book.post({
      kind: "loot",
      atMs: T0 + 2,
      entries: [
        { account: book.ownerAccount(NPC, "item:grain", cargoLocation(501)), amount: -2n },
        { account: book.ownerAccount(USER, "item:grain", cargoLocation(900)), amount: 2n },
      ],
    });
    markets.expire(T0 + HAUL_MS);
    expect(grain?.market.orders().map((order) => order.remaining)).toEqual([4n]);
    expect(book.balanceOf(NPC, "item:grain", cargoLocation(501))).toBe(0n);
    expect(markets.check()).toEqual([]);
  });

  it("NPC: 거둔 팔 물건은 거래소 건물 창고에서 운반 시간 뒤 도시 창고로 돌아간다(1945)", () => {
    const book = ledger();
    const markets = registry(book, { exchangeOf: () => EXCHANGE, npcHaul: { haulMs: () => HAUL_MS } });
    endow(book, NPC, "item:grain", 4n, buildingLocation(EXCHANGE));
    const grain = markets.book(CITY, "item:grain");
    grain?.market.place(NPC, "sell", 5n, 4n, T0, T0 + 3_600_000);
    grain?.market.cancelOwner(NPC, T0);
    expect(book.balanceOf(NPC, "item:grain", buildingLocation(EXCHANGE))).toBe(4n);
    markets.expire(T0 + 1);
    expect(book.balanceOf(NPC, "item:grain", buildingLocation(EXCHANGE))).toBe(4n);
    markets.expire(T0 + 1 + HAUL_MS);
    expect(book.balanceOf(NPC, "item:grain", buildingLocation(EXCHANGE))).toBe(0n);
    expect(book.balanceOf(NPC, "item:grain", CITY)).toBe(4n);
  });

  it("돌려보내기도 보이는 운반꾼(2157), 일 없는 휴먼이 없으면 운반은 기다리고 짐은 남는다(2155)", () => {
    const book = ledger();
    let idle = 0;
    const board = createCarryBoard(book, { peopleOf: () => idle });
    const markets = registry(book, {
      exchangeOf: () => EXCHANGE,
      npcHaul: {
        haulMs: () => HAUL_MS,
        carry: { board, centerOf: () => ({ x: 40, y: 50 }), dropOf: () => ({ x: 7, y: 8 }) },
      },
    });
    endow(book, NPC, "item:grain", 4n, buildingLocation(EXCHANGE));
    const grain = markets.book(CITY, "item:grain");
    grain?.market.place(NPC, "sell", 5n, 4n, T0, T0 + 3_600_000);
    grain?.market.cancelOwner(NPC, T0);
    // 운반꾼이 될 휴먼이 없다: 돌려보내기는 기다린다(시간 셈으로 떠나지 않는다)
    markets.expire(T0 + 1);
    expect(board.stateOf("r:1")).toBe("waiting");
    markets.expire(T0 + 10 * HAUL_MS);
    expect(book.balanceOf(NPC, "item:grain", buildingLocation(EXCHANGE))).toBe(4n);
    // 휴먼이 생기면 그때 떠나 운반 시간 뒤에 도시 칸으로 내려놓는다
    idle = 1;
    const leave = T0 + 10 * HAUL_MS + 1;
    markets.expire(leave);
    expect(board.idle(CITY, leave)[0]).toMatchObject({ key: "r:1", x: 7, y: 8, untilMs: leave + HAUL_MS });
    expect(board.load("r:1", 601, leave)).toBe(true);
    expect(book.balanceOf(NPC, "item:grain", cargoLocation(601))).toBe(4n);
    markets.expire(leave + HAUL_MS);
    expect(book.balanceOf(NPC, "item:grain", CITY)).toBe(4n);
    expect(book.balanceOf(NPC, "item:grain", cargoLocation(601))).toBe(0n);
    expect(markets.npcHaulPending()).toBe(0);
  });

  it("개인 창고 쓰는 무게 = 거래소 건물 창고 물건 + 그 도시 걸린 내 주문 남은 양(1943)", () => {
    const book = ledger();
    const markets = registry(book, { exchangeOf: () => EXCHANGE });
    endow(book, USER, "item:grain", 10n, buildingLocation(EXCHANGE));
    endow(book, USER, CREDIT, 1_000n, null);
    const grain = markets.book(CITY, "item:grain");
    grain?.market.place(USER, "sell", 50n, 4n, T0, T0 + 1000);
    grain?.market.place(USER, "buy", 10n, 3n, T0, T0 + 1000);
    const used = lockerUsedG({
      ledger: book,
      registry: markets,
      weightOf: () => 2n,
      ownerId: USER,
      cityId: CITY,
      exchangeBuildingId: EXCHANGE,
    });
    // 창고 6 + 팔기 4 + 사기 3 = 13개 × 2g
    expect(used).toBe(26n);
    const lockers = createLockers([{ cityId: CITY, ownerId: USER, steps: 2, updatedAtMs: T0 }], undefined);
    expect(lockers.steps(CITY, USER)).toBe(2);
    lockers.setSteps(CITY, USER, 3, T0);
    expect(lockers.steps(CITY, USER)).toBe(3);
    expect(lockers.steps(CITY, NPC)).toBe(0);
  });
});
