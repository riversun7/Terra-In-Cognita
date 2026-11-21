// 옛 도시 연맹 기금 되돌리기 시험 — 질문 2505 나, leagueRefund.ts. 나누기는 DB 없이, 되돌리기는 TEST_DATABASE_URL이 있을 때만.
import { type LedgerAccount, createLedgerBook } from "@terra/sim";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
import { refundOldLeagueFunds, splitRefund } from "./leagueRefund.ts";

describe("옛 연맹 기금 나누기(질문 2505 나)", () => {
  it("낸 합의 비율로 나누고 나머지는 나머지가 큰 금고부터", () => {
    expect(
      splitRefund(10n, [
        { account: 5, amount: 1n },
        { account: 3, amount: 2n },
      ]),
    ).toEqual([
      { account: 3, amount: 7n },
      { account: 5, amount: 3n },
    ]);
    expect(splitRefund(0n, [{ account: 1, amount: 5n }])).toEqual([]);
    expect(splitRefund(9n, [])).toEqual([]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("옛 연맹 기금 되돌리기 (DB)", () => {
  let test: TestDatabase;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);
  const tx = async (id: number, kind: string, entries: [number, bigint][]) => {
    await sql("insert into ledger_transactions (id, kind, at_ms) values ($1, $2, 0)", [id, kind]);
    for (const [account, amount] of entries)
      await sql("insert into ledger_entries (tx_id, account_id, amount) values ($1, $2, $3)", [
        id,
        account,
        amount,
      ]);
  };

  beforeAll(async () => {
    test = await createTestDatabase();
  });
  afterAll(async () => {
    await test.drop();
  });

  it("기금 잔고를 낸 가문 금고로 되돌리고, 다시 돌려도 아무것도 하지 않는다", async () => {
    // 계정: 1 = 발행, 2·3 = NPC 가문 금고, 4 = 옛 연맹 기금, 5 = 다른 도시 기금(기록 없음)
    const accounts: LedgerAccount[] = [
      { id: 1, ownerId: null, systemCode: "issue:test", asset: "cur_a", location: null, balance: -400n },
      {
        id: 2,
        ownerId: null,
        systemCode: "vault:house:npc:7:cur_a",
        asset: "cur_a",
        location: null,
        balance: 70n,
      },
      {
        id: 3,
        ownerId: null,
        systemCode: "vault:house:npc:8:cur_a",
        asset: "cur_a",
        location: null,
        balance: 30n,
      },
      {
        id: 4,
        ownerId: null,
        systemCode: "league:city:11:cur_a",
        asset: "cur_a",
        location: null,
        balance: 250n,
      },
      {
        id: 5,
        ownerId: null,
        systemCode: "league:city:12:cur_a",
        asset: "cur_a",
        location: null,
        balance: 50n,
      },
    ];
    for (const a of accounts)
      await sql(
        "insert into ledger_accounts (id, owner_id, system_code, asset, location, balance) values ($1, null, $2, $3, null, $4)",
        [a.id, a.systemCode, a.asset, a.balance],
      );
    // 분담금: 가문 7이 200, 가문 8이 100(기금 4로). 그 뒤 기금에서 50이 투자로 나갔다(발행 계정으로 — 기록 흉내)
    await tx(1, "league_dues", [
      [2, -150n],
      [4, 150n],
    ]);
    await tx(2, "league_dues", [
      [3, -100n],
      [4, 100n],
    ]);
    await tx(3, "league_dues", [
      [2, -50n],
      [4, 50n],
    ]);
    await tx(4, "league_invest_production", [
      [4, -50n],
      [1, 50n],
    ]);
    let accountId = 10;
    let txId = 100;
    const book = createLedgerBook({
      accounts,
      nextAccountId: () => ++accountId,
      nextTxId: () => ++txId,
    });
    const report = await refundOldLeagueFunds(test.db.$client, book, 1_000);
    expect(report).toEqual({ funds: 1, amount: 250n, unattributed: 1 });
    // 250을 200 : 100으로 → 166(+1 나머지) : 83
    expect(book.balance(4)).toBe(0n);
    expect(book.balance(2)).toBe(70n + 167n);
    expect(book.balance(3)).toBe(30n + 83n);
    // 기록 없는 기금은 그대로
    expect(book.balance(5)).toBe(50n);
    // 다시 돌려도 바뀌지 않는다
    expect(await refundOldLeagueFunds(test.db.$client, book, 2_000)).toEqual({
      funds: 0,
      amount: 0n,
      unattributed: 1,
    });
    expect(book.balance(2)).toBe(237n);
  });
});
