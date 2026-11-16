// 환전 이용료(질문 2086, 줄기 exchange-3 — fxFee.ts·fxFeeHook.ts·fx.ts fee 고리) 시험
import { EXCHANGE_FEE_ITEM, FX_FEE_ITEM } from "@terra/shared/businessBooks";
import { type LedgerBook, START_BUSINESS, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { EMPTY_FX, createFxRegistry } from "./fx.ts";
import { cheapestFxExchange, exchangeFeeOf, fxFeeAmount, fxFeeOf } from "./fxFee.ts";
import { fxFeeHook } from "./fxFeeHook.ts";

const T0 = 1_800_000_000_000;
const CUR = "cur:aur";
const SELLER = 20;
const BUYER = 21;
const LOT = 100n;

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

function endow(book: LedgerBook, owner: number, asset: string, qty: bigint): void {
  book.post({
    kind: "endow",
    atMs: T0,
    entries: [
      { account: book.systemAccount(`source:${asset}`, asset), amount: -qty },
      { account: book.ownerAccount(owner, asset), amount: qty },
    ],
  });
}

describe("물자 거래소 이용료 요율(D-574 질문 2085 — 주인이 정하고 위아래 한도는 설정값)", () => {
  it("정한 값은 아래·위 끝으로 자르고, 정하지 않으면 적정 요율(한도 안). 환전 이용료도 아래 끝이 있다", () => {
    const rules = { ...START_BUSINESS, exchangeFeeBp: 50, exchangeFeeMinBp: 10, exchangeFeeMaxBp: 200 };
    const prices = new Map<string, bigint>([
      [`7|${EXCHANGE_FEE_ITEM}`, 120n],
      [`8|${EXCHANGE_FEE_ITEM}`, 5_000n],
      [`9|${EXCHANGE_FEE_ITEM}`, 0n],
      [`9|${FX_FEE_ITEM}`, 0n],
    ]);
    const priceOf = (id: number, item: string): bigint | undefined => prices.get(`${id}|${item}`);
    expect(exchangeFeeOf(priceOf, rules, 6)).toEqual({
      bp: null,
      charged: 50,
      fairBp: 50,
      minBp: 10,
      maxBp: 200,
    });
    expect(exchangeFeeOf(priceOf, rules, 7)).toMatchObject({ bp: 120, charged: 120 });
    expect(exchangeFeeOf(priceOf, rules, 8)).toMatchObject({ bp: 200, charged: 200 });
    expect(exchangeFeeOf(priceOf, rules, 9)).toMatchObject({ bp: 10, charged: 10 });
    expect(exchangeFeeOf(priceOf, { ...rules, exchangeFeeBp: 500 }, 6).charged).toBe(200);
    expect(fxFeeOf(priceOf, { ...rules, exchangeFxFeeMinBp: 5 }, 9)).toMatchObject({ bp: 5, charged: 5 });
  });
});

describe("환전 이용료(질문 2086)", () => {
  it("요율 = 주인이 정한 값(위 끝까지), 없으면 적정 요율. 받는 곳 = 가장 싼 외환 거래소(같으면 작은 ID)", () => {
    const rules = { ...START_BUSINESS, exchangeFxFeeBp: 50, exchangeFxFeeMaxBp: 300 };
    const prices = new Map<string, bigint>([
      [`7|${FX_FEE_ITEM}`, 20n],
      [`8|${FX_FEE_ITEM}`, 9_999n],
      [`9|${FX_FEE_ITEM}`, 0n],
    ]);
    const priceOf = (id: number, item: string): bigint | undefined => prices.get(`${id}|${item}`);
    expect(fxFeeOf(priceOf, rules, 6)).toEqual({ bp: null, charged: 50, fairBp: 50, minBp: 0, maxBp: 300 });
    expect(fxFeeOf(priceOf, rules, 7)).toMatchObject({ bp: 20, charged: 20 });
    expect(fxFeeOf(priceOf, rules, 8)).toMatchObject({ bp: 300, charged: 300 });
    expect(fxFeeOf(priceOf, rules, 9)).toMatchObject({ bp: 0, charged: 0 });
    const rate = (id: number): number => fxFeeOf(priceOf, rules, id).charged;
    expect(cheapestFxExchange([8, 6, 7], rate)).toEqual({ buildingId: 7, bp: 20 });
    expect(cheapestFxExchange([], rate)).toBeUndefined();
    expect(cheapestFxExchange([12, 11], () => 50)).toEqual({ buildingId: 11, bp: 50 });
    expect(fxFeeAmount(3n, 150n, 50)).toBe(2n);
    expect(fxFeeAmount(0n, 150n, 50)).toBe(0n);
  });

  it("회차 뒤 화폐를 판 쪽이 받은 기준 통화 × 요율을 그 화폐 나라에서 가장 싼 외환 거래소 금고에 낸다", () => {
    const book = ledger();
    endow(book, SELLER, CUR, 10n * LOT);
    endow(book, BUYER, ASSET_CREDIT, 100_000n);
    const received: { buildingId: number; amount: bigint; kind: string }[] = [];
    const fee = fxFeeHook(
      {
        // 도시 3(이 화폐 나라) → 건물 40·도시 4(이 화폐 나라) → 건물 41·도시 5(다른 나라) → 건물 42
        fxExchanges: () =>
          new Map([
            [3, 40],
            [4, 41],
            [5, 42],
          ]),
        fxFeeBp: (id) => (id === 41 ? 100 : id === 42 ? 1 : 200),
        business: {
          receive(input) {
            const amount = input.amount;
            book.post({
              kind: input.kind,
              atMs: input.atMs,
              entries: [
                { account: input.from, amount: -amount },
                { account: book.ownerAccount(99, input.asset, input.buildingId), amount },
              ],
            });
            received.push({ buildingId: input.buildingId, amount, kind: input.kind });
            return true;
          },
        },
      },
      book,
      (cityId) => (cityId === 5 ? "cur:other" : CUR),
    );
    const fx = createFxRegistry({
      ledger: book,
      writer,
      loaded: EMPTY_FX,
      base: ASSET_CREDIT,
      lotSize: LOT,
      isUser: () => true,
      now: () => T0,
      fee,
    });
    const market = fx.ensure(CUR)?.market;
    if (!market) throw new Error("no pair");
    expect(market.place(SELLER, "sell", 1_000n, 4n, T0).ok).toBe(true);
    expect(market.place(BUYER, "buy", 1_000n, 4n, T0).ok).toBe(true);
    market.run(T0 + 1);
    // 판 쪽은 4로트 × 1,000 = 4,000을 받고, 1%(가장 싼 41번 거래소) = 40을 낸다. 산 쪽은 내지 않는다
    expect(received).toEqual([{ buildingId: 41, amount: 40n, kind: "fx_fee" }]);
    expect(book.balanceOf(SELLER, ASSET_CREDIT)).toBe(4_000n - 40n);
    expect(book.balanceOf(BUYER, CUR)).toBe(4n * LOT);
    expect(fx.check()).toEqual([]);
  });
});
