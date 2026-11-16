// NPC 사업장(기획 대조 2053·2054·2052) 시험 — 산출은 시설 창고로, 재료비, 실제 운반(보는 2차맵은 화물을 진 휴먼 — 약탈 대상), 닿은 만큼 매출, 하루 끝 정산
import { businessLocation } from "@terra/shared/businessBooks";
import { cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { START_BUSINESS, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { EMPTY_BUSINESS, createBusinessCore } from "../business/core.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { createCarryBoard } from "./npcCarry.ts";
import { createNpcDeliveries, stacksValue } from "./npcDelivery.ts";

const NATION = 9;
const FARM = 40;
const CITY = 3;
const CUR = "cur:aaa";
const GRAIN = "item:grain";
const SEED = "item:seed";

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

function setup(treasury = 1000n) {
  let ids = 1;
  const book = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  const core = createBusinessCore({
    ledger: book,
    writer,
    planetId: "p",
    loaded: EMPTY_BUSINESS,
    place: (buildingId) => (buildingId === FARM ? { ownerId: NATION, cityId: CITY } : undefined),
    businesses: () => [FARM],
    tax: () => ({ treasuryOwner: NATION, bp: 1000 }),
    rules: () => START_BUSINESS,
  });
  const grant = (asset: string, qty: bigint, location: number | null = null): void => {
    book.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`source:${asset}`, asset), amount: -qty },
        { account: book.ownerAccount(NATION, asset, location), amount: qty },
      ],
    });
  };
  if (treasury > 0n) grant(CUR, treasury);
  const board = createCarryBoard(book);
  const scheduled: [number, number][] = [];
  const deliveries = createNpcDeliveries({
    book,
    business: core,
    board,
    // 곡식 묶음(10) 50, 씨앗 묶음(10) 20
    priceOf: (_city, asset) => (asset === GRAIN ? 50n : asset === SEED ? 20n : 0n),
    lotOf: () => 10n,
    schedule: (atMs, id) => scheduled.push([atMs, id]),
  });
  return { book, core, board, deliveries, scheduled, grant };
}

/** 시뮬 생산이 도시 창고에 넣은 산출(곡식 30)과 쓴 재료(씨앗 10) */
const produced = (haulMs: number) => ({
  facilityId: 7,
  buildingId: FARM,
  cityId: CITY,
  owner: NATION,
  currency: CUR,
  outputs: [{ asset: GRAIN, qty: 30n }],
  inputs: [{ asset: SEED, qty: 10n }],
  to: { x: 10, y: 12 },
  haulMs,
  atMs: 1000,
});

describe("NPC 사업장 — 시설 창고·운반·하루 끝 정산(2053·2054)", () => {
  it("묶음 값 × 수량 ÷ 묶음 크기", () => {
    expect(
      stacksValue(
        [{ asset: GRAIN, qty: 25n }],
        () => 40n,
        () => 10n,
      ),
    ).toBe(100n);
  });

  it("산출은 시설 창고로 옮기고 재료비는 주인이 넣은 운영 자금에서, 운반이 닿으면 나라가 사고 금고는 정산 때까지 남는다", () => {
    const { book, core, deliveries, scheduled, grant } = setup();
    grant(GRAIN, 30n, cityLocation(CITY));
    const result = deliveries.produced(produced(60_000));
    expect(result.moved).toEqual([{ asset: GRAIN, qty: 30n }]);
    expect(book.balanceOf(NATION, GRAIN, businessLocation(FARM))).toBe(30n);
    expect(book.balanceOf(NATION, GRAIN, cityLocation(CITY))).toBe(0n);
    // 재료비 20: 빈 금고 → 주인이 국고에서 20을 넣고(business_invest) 국고로 낸다
    expect(result.materials).toBe(20n);
    expect(core.vaultBalance(FARM, NATION, CUR)).toBe(0n);
    expect(book.balanceOf(NATION, CUR, null)).toBe(1000n);
    expect(scheduled).toEqual([[61_000, 1]]);
    // 닿음: 곡식 30 = 150, 국고 → 금고(같은 주머니라 소득세 없음)
    expect(deliveries.arrive(1, 61_000)).toBe(150n);
    expect(book.balanceOf(NATION, GRAIN, cityLocation(CITY))).toBe(30n);
    expect(core.vaultBalance(FARM, NATION, CUR)).toBe(150n);
    expect(book.balanceOf(NATION, CUR, null)).toBe(850n);
    // 하루 끝 자동 정산이 국고로
    core.tick(START_BUSINESS.settlePeriodMs + 1);
    expect(core.vaultBalance(FARM, NATION, CUR)).toBe(0n);
    expect(book.balanceOf(NATION, CUR, null)).toBe(1000n);
  });

  it("보는 2차맵: 운반꾼이 화물을 실제로 지고, 빼앗긴 만큼은 닿지 않고 사지 않는다(2052)", () => {
    const { book, board, deliveries, grant } = setup();
    grant(GRAIN, 30n, cityLocation(CITY));
    deliveries.produced(produced(60_000));
    expect(board.ofWorker(7, 2000)?.key).toBe("f:1");
    expect(board.load("f:1", 501, 2000)).toBe(true);
    expect(book.balanceOf(NATION, GRAIN, cargoLocation(501))).toBe(30n);
    expect(book.balanceOf(NATION, GRAIN, businessLocation(FARM))).toBe(0n);
    // 약탈: 화물 10을 빼앗김
    book.post({
      kind: "loot",
      atMs: 3000,
      entries: [
        { account: book.ownerAccount(NATION, GRAIN, cargoLocation(501)), amount: -10n },
        { account: book.ownerAccount(77, GRAIN, cargoLocation(900)), amount: 10n },
      ],
    });
    expect(deliveries.arrive(1, 61_000)).toBe(100n);
    expect(book.balanceOf(NATION, GRAIN, cityLocation(CITY))).toBe(20n);
    expect(book.balanceOf(NATION, GRAIN, cargoLocation(501))).toBe(0n);
  });

  it("옮김 칸이 없으면 바로 닿고, 켤 때 시설 창고에 남은 NPC 물건은 도시 창고로 보낸다", () => {
    const { book, core, deliveries, scheduled, grant } = setup();
    grant(GRAIN, 30n, cityLocation(CITY));
    deliveries.produced({ ...produced(0), to: undefined });
    expect(scheduled).toEqual([]);
    expect(book.balanceOf(NATION, GRAIN, cityLocation(CITY))).toBe(30n);
    grant(GRAIN, 20n, businessLocation(FARM));
    expect(deliveries.sweep(new Map([[FARM, { cityId: CITY, owner: NATION, currency: CUR }]]), 5000)).toBe(1);
    expect(book.balanceOf(NATION, GRAIN, cityLocation(CITY))).toBe(50n);
    expect(core.vaultBalance(FARM, NATION, CUR)).toBe(250n);
  });
});
