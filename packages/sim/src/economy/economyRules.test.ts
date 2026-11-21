import { describe, expect, it } from "vitest";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import { TEST_CENTRAL_BANK_RULE, centralBankStep, initialMint, manualBankStep } from "./centralBank.ts";
import { HOUR_MS, batchDurationMs, maxTierForLevel, runRecipe } from "./production.ts";
import { dueNecessities, payNecessities } from "./upkeep.ts";

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

function newBook() {
  const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter() });
  const accounts = {
    consume: (asset: string) => book.systemAccount(`sink:${asset}`, asset),
    source: (asset: string) => book.systemAccount(`source:${asset}`, asset),
  };
  return { book, accounts };
}

describe("생산(레시피 = 장부 거래 하나)", () => {
  const smelt = {
    id: "smelt",
    facility: "smelter",
    inputs: [{ asset: "item:ore", qty: 10n }],
    outputs: [{ asset: "item:ingot", qty: 7n }],
    work: 1000,
    tier: 1,
  };

  it("재료를 소멸 계정으로 보내고 산출을 생산원에서 그 도시 창고로 넣는다. 모자라면 하지 않는다", () => {
    const { book, accounts } = newBook();
    expect(runRecipe(book, 1, 5, smelt, accounts, 0)).toBe(false);
    book.post({
      kind: "produce",
      atMs: 0,
      entries: [
        { account: accounts.source("item:ore"), amount: -25n },
        { account: book.ownerAccount(1, "item:ore", 5), amount: 25n },
      ],
    });
    expect(runRecipe(book, 1, 5, smelt, accounts, 1)).toBe(true);
    expect(runRecipe(book, 1, 5, smelt, accounts, 2)).toBe(true);
    expect(runRecipe(book, 1, 5, smelt, accounts, 3)).toBe(false);
    expect(book.balanceOf(1, "item:ore", 5)).toBe(5n);
    expect(book.balanceOf(1, "item:ingot", 5)).toBe(14n);
    expect(book.balance(accounts.consume("item:ore"))).toBe(20n);
  });

  it("시설 레벨이 다루는 최고 티어(D-5001)와 한 번에 드는 시간", () => {
    expect([1, 2, 3, 4, 5].map(maxTierForLevel)).toEqual([1, 3, 5, 7, 9]);
    // 효율 합 2500(기준 일꾼 2.5명)이 작업량 1000을 하는 데 24분
    expect(batchDurationMs(1000, 2500)).toBe(24 * 60_000);
    expect(batchDurationMs(1000, 3000)).toBe(1_200_000);
    expect(batchDurationMs(1000, 0)).toBeUndefined();
  });
});

describe("유지비 = 생필품(나눠 주기)", () => {
  const food = { asset: "item:ration", perUnit: 1n, periodHours: 1 };
  const goods = { asset: "item:goods", perUnit: 1n, periodHours: 24 };

  it("정시마다 주기가 맞는 생필품만 낸다", () => {
    expect(dueNecessities([food, goods], 5 * HOUR_MS)).toEqual([food]);
    expect(dueNecessities([food, goods], 48 * HOUR_MS)).toEqual([food, goods]);
    expect(dueNecessities([food, goods], 5 * HOUR_MS + 1)).toEqual([]);
  });

  it("가진 만큼 유닛 몫을 채우고 못 받은 유닛 몫을 센다", () => {
    const { book, accounts } = newBook();
    book.post({
      kind: "produce",
      atMs: 0,
      entries: [
        { account: accounts.source("item:ration"), amount: -7n },
        { account: book.ownerAccount(3, "item:ration", 9), amount: 7n },
      ],
    });
    const paid = payNecessities(book, 3, 9, 10, [food, goods], accounts.consume, HOUR_MS * 24);
    expect(paid).toEqual({ servedUnits: 7, shortUnits: 13 });
    expect(book.balanceOf(3, "item:ration", 9)).toBe(0n);
    expect(book.balance(accounts.consume("item:ration"))).toBe(7n);
  });
});

describe("NPC 중앙은행 공식", () => {
  it("물가가 목표보다 낮으면 늘리고(상한 안), 높으면 국고에서 줄인다. 이자가 먼저 소각된다", () => {
    // 발행 잔액 1,050,000 중 국고 50,000 → 시중 1,000,000
    const low = centralBankStep(
      { outstanding: 1_050_000n, indexMilli: 900, treasury: 50_000n, interestOwed: 0n },
      TEST_CENTRAL_BANK_RULE,
    );
    // 이자 = 발행 잔액 × 0.01% = 105, 조절 = 시중 1,000,000 × 20% × 10% = 20,000 → 상한(시중 3%) 30,000 안
    expect(low).toEqual({ interestBurn: 105n, interestOwed: 0n, issue: 20_000n, burn: 0n });
    const high = centralBankStep(
      { outstanding: 1_010_000n, indexMilli: 1500, treasury: 10_000n, interestOwed: 0n },
      TEST_CENTRAL_BANK_RULE,
    );
    // 조절 −100,000 → 상한 30,000 → 국고(10,000 − 이자 101)까지만
    expect(high).toEqual({ interestBurn: 101n, interestOwed: 0n, issue: 0n, burn: 9_899n });
    const none = centralBankStep(
      { outstanding: 1_000_000n, indexMilli: undefined, treasury: 0n, interestOwed: 50n },
      TEST_CENTRAL_BANK_RULE,
    );
    expect(none).toEqual({ interestBurn: 0n, interestOwed: 150n, issue: 0n, burn: 0n });
  });

  it("발행한 돈이 국고에만 쌓여 있으면(시중에 없으면) 더 찍지 않는다", () => {
    const idle = centralBankStep(
      { outstanding: 500_000n, indexMilli: 500, treasury: 500_000n, interestOwed: 0n },
      TEST_CENTRAL_BANK_RULE,
    );
    expect(idle.issue).toBe(0n);
  });

  it("처음 발행량 = 인구 × 1인당 하루 거래액 × 7(E6)", () => {
    expect(initialMint(40, 100n)).toBe(28_000n);
  });
});

describe("지도자 손 조절(서버만 — 줄기 governance-5, 질문 2453)", () => {
  it("조절량 = 시중 × 만분율(하루 상한 안), 소각은 국고까지, 이자 소각은 공식과 같다", () => {
    const input = { outstanding: 1_000_000n, indexMilli: 1000, treasury: 100_000n, interestOwed: 0n };
    // 시중 900,000 × 1% = 9,000 → 상한 3%(27,000) 안
    expect(manualBankStep(input, TEST_CENTRAL_BANK_RULE, 100)).toMatchObject({ issue: 9000n, burn: 0n });
    // 상한으로 자름(시중 × 3%)
    expect(manualBankStep(input, TEST_CENTRAL_BANK_RULE, 9000).issue).toBe(27_000n);
    // 소각은 국고(이자 소각 뒤)까지만
    const poor = { ...input, treasury: 5_000n };
    const step = manualBankStep(poor, TEST_CENTRAL_BANK_RULE, -300);
    expect(step.burn).toBe(5_000n - step.interestBurn);
    expect(step.interestBurn).toBe(centralBankStep(poor, TEST_CENTRAL_BANK_RULE).interestBurn);
    expect(manualBankStep(input, TEST_CENTRAL_BANK_RULE, 0)).toMatchObject({ issue: 0n, burn: 0n });
  });
});
