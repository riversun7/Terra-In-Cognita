import { TEST_ASSET_CREDIT, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { retireCommonMoney } from "./currency.ts";

describe("옛 공용 시험 화폐 없애기(retireCommonMoney)", () => {
  it("지갑·금고의 옛 공용 화폐를 소각하고 나라 화폐·에스크로는 그대로 둔다(다시 켜면 아무것도 안 한다)", () => {
    let account = 0;
    let tx = 0;
    const book = createLedgerBook({ nextAccountId: () => (account += 1), nextTxId: () => (tx += 1) });
    const give = (to: number, asset: string, amount: bigint): void => {
      book.post({
        kind: "issue",
        atMs: 0,
        entries: [
          { account: book.systemAccount(`issue:${asset}`, asset), amount: -amount },
          { account: to, amount },
        ],
      });
    };
    const nation = book.ownerAccount(1, TEST_ASSET_CREDIT);
    const user = book.ownerAccount(2, TEST_ASSET_CREDIT);
    const own = book.ownerAccount(1, "cur:ukau");
    const escrow = book.systemAccount("escrow:labor:3", TEST_ASSET_CREDIT);
    const vault = book.systemAccount("vault:9", TEST_ASSET_CREDIT);
    give(nation, TEST_ASSET_CREDIT, 599_931_862n);
    give(user, TEST_ASSET_CREDIT, 50n);
    give(own, "cur:ukau", 600n);
    give(escrow, TEST_ASSET_CREDIT, 7n);
    give(vault, TEST_ASSET_CREDIT, 30n);
    const lines: object[] = [];
    const log = { info: (obj: object) => void lines.push(obj) };

    expect(retireCommonMoney(book, 1, log)).toBe(3);
    expect(book.balance(vault)).toBe(0n);
    expect(book.balance(nation)).toBe(0n);
    expect(book.balance(user)).toBe(0n);
    expect(book.balance(own)).toBe(600n);
    expect(book.balance(escrow)).toBe(7n);
    expect(book.balance(book.systemAccount(`sink:${TEST_ASSET_CREDIT}`, TEST_ASSET_CREDIT))).toBe(
      599_931_942n,
    );
    expect(lines).toEqual([{ commonMoneyRetired: 3, amount: "599931942" }]);
    expect(retireCommonMoney(book, 2, log)).toBe(0);
    expect(lines).toHaveLength(1);
  });
});
