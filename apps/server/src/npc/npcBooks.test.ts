// NPC 사업장 장부(기획 D-570 1887) 시험 — 산출 = 그 도시(나라)에 판 매출, 재료 = 재료비, 바로 국고로 정산
import { businessLocation } from "@terra/shared/businessBooks";
import { START_BUSINESS, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { EMPTY_BUSINESS, createBusinessCore } from "../business/core.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { recordNpcSale, stacksValue } from "./npcBooks.ts";

const NATION = 9;
const FARM = 40;
const CITY = 3;
const CUR = "cur:aaa";

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

function setup() {
  let ids = 1;
  const kinds: string[] = [];
  const book = createLedgerBook({
    nextAccountId: () => ids++,
    nextTxId: () => ids++,
    hooks: { posted: (_id, tx) => kinds.push(tx.kind) },
  });
  const core = createBusinessCore({
    ledger: book,
    writer,
    planetId: "p",
    loaded: EMPTY_BUSINESS,
    place: (buildingId) => (buildingId === FARM ? { ownerId: NATION, cityId: CITY } : undefined),
    businesses: () => [FARM],
    // 도시 주인 = 건물 주인(같은 주머니) → 소득세 없음
    tax: () => ({ treasuryOwner: NATION, bp: 1000 }),
    rules: () => START_BUSINESS,
  });
  book.post({
    kind: "grant",
    atMs: 0,
    entries: [
      { account: book.systemAccount("issue:cur:aaa", CUR), amount: -1000n },
      { account: book.ownerAccount(NATION, CUR), amount: 1000n },
    ],
  });
  return { book, core, kinds };
}

describe("NPC 사업장 장부(D-570 1887)", () => {
  it("묶음 값 × 수량 ÷ 묶음 크기", () => {
    expect(
      stacksValue(
        [
          { asset: "item:ore", qty: 2500n },
          { asset: "item:bread", qty: 3n },
        ],
        (asset) => (asset === "item:ore" ? 40n : 7n),
        (asset) => (asset === "item:ore" ? 1000n : 1n),
      ),
    ).toBe(100n + 21n);
  });

  it("매출(국고 → 시설 금고)·재료비(금고 → 국고)를 적고 바로 국고로 정산한다 — 국고 합은 그대로", () => {
    const { book, core, kinds } = setup();
    const result = recordNpcSale({
      business: core,
      book,
      owner: NATION,
      currency: CUR,
      buildingId: FARM,
      outputs: [{ asset: "item:bread", qty: 10n }],
      inputs: [{ asset: "item:grain", qty: 4n }],
      priceOf: (asset) => (asset === "item:bread" ? 12n : 5n),
      lotOf: () => 1n,
      atMs: 1_000,
    });
    expect(result).toEqual({ sale: 120n, materials: 20n });
    expect(book.balanceOf(NATION, CUR, businessLocation(FARM))).toBe(0n);
    expect(book.balanceOf(NATION, CUR)).toBe(1000n);
    expect(kinds).toEqual(expect.arrayContaining(["business_sale", "business_input", "business_settle"]));
  });

  it("국고가 모자라면 있는 만큼만 판다", () => {
    const { book, core } = setup();
    const result = recordNpcSale({
      business: core,
      book,
      owner: NATION,
      currency: CUR,
      buildingId: FARM,
      outputs: [{ asset: "item:bread", qty: 1000n }],
      inputs: [],
      priceOf: () => 12n,
      lotOf: () => 1n,
      atMs: 1_000,
    });
    expect(result.sale).toBe(1000n);
    expect(book.balanceOf(NATION, CUR)).toBe(1000n);
  });
});
