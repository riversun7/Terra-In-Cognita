import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "./audit.ts";
import { type LedgerAccount, LedgerError, createLedgerBook } from "./ledgerBook.ts";

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

function newBook(hooks?: Parameters<typeof createLedgerBook>[0]["hooks"]) {
  return createLedgerBook({ nextAccountId: counter(), nextTxId: counter(), hooks });
}

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof LedgerError ? error.code : "other";
  }
  return undefined;
};

describe("원장 장부(메모리, 서버·시뮬 공용)", () => {
  it("복식부기 거래를 넣으면 잔고가 바뀐다", () => {
    const book = newBook();
    const issue = book.systemAccount("issue:gold", "gold");
    const wallet = book.ownerAccount(7, "gold");
    book.post({
      kind: "issue",
      atMs: 1,
      entries: [
        { account: issue, amount: -500n },
        { account: wallet, amount: 500n },
      ],
    });
    expect(book.balanceOf(7, "gold")).toBe(500n);
    expect(book.balance(issue)).toBe(-500n);
    // 같은 (주체, 자산)이면 같은 계정
    expect(book.ownerAccount(7, "gold")).toBe(wallet);
    expect(book.balanceOf(8, "gold")).toBe(0n);
  });

  it("자산마다 합이 0이 아니거나, 주체 계정이 0 아래로 가거나, 모르는 계정·빈 거래면 거절하고 아무것도 바꾸지 않는다", () => {
    const posted: number[] = [];
    const book = newBook({ posted: (txId) => posted.push(txId) });
    const issue = book.systemAccount("issue:gold", "gold");
    const ore = book.systemAccount("reserve:ore", "ore");
    const a = book.ownerAccount(1, "gold");
    const b = book.ownerAccount(2, "gold");
    const aOre = book.ownerAccount(1, "ore");
    book.post({
      kind: "issue",
      atMs: 1,
      entries: [
        { account: issue, amount: -10n },
        { account: a, amount: 10n },
      ],
    });
    expect(
      codeOf(() =>
        book.post({
          kind: "x",
          atMs: 2,
          entries: [
            { account: a, amount: -3n },
            { account: b, amount: 2n },
          ],
        }),
      ),
    ).toBe("unbalanced");
    // 자산이 다른 두 항목은 각각 0이 아니다
    expect(
      codeOf(() =>
        book.post({
          kind: "x",
          atMs: 2,
          entries: [
            { account: a, amount: -3n },
            { account: aOre, amount: 3n },
          ],
        }),
      ),
    ).toBe("unbalanced");
    expect(
      codeOf(() =>
        book.post({
          kind: "x",
          atMs: 2,
          entries: [
            { account: a, amount: -11n },
            { account: b, amount: 11n },
          ],
        }),
      ),
    ).toBe("insufficient");
    expect(
      codeOf(() =>
        book.post({
          kind: "x",
          atMs: 2,
          entries: [
            { account: 999, amount: 1n },
            { account: b, amount: -1n },
          ],
        }),
      ),
    ).toBe("unknown_account");
    expect(codeOf(() => book.post({ kind: "x", atMs: 2, entries: [] }))).toBe("empty");
    expect(codeOf(() => book.post({ kind: "x", atMs: 2, entries: [{ account: a, amount: 0n }] }))).toBe(
      "unbalanced",
    );
    expect(book.balance(a)).toBe(10n);
    expect(book.balance(b)).toBe(0n);
    expect(book.balance(ore)).toBe(0n);
    expect(posted).toEqual([1]);
  });

  it("한 거래 안에서 같은 계정이 여러 번 나와도 합으로 판단한다", () => {
    const book = newBook();
    const issue = book.systemAccount("issue:gold", "gold");
    const a = book.ownerAccount(1, "gold");
    const b = book.ownerAccount(2, "gold");
    book.post({
      kind: "issue",
      atMs: 1,
      entries: [
        { account: issue, amount: -5n },
        { account: a, amount: 5n },
      ],
    });
    // a: −8 + 4 = −4 → 1 남음
    book.post({
      kind: "x",
      atMs: 2,
      entries: [
        { account: a, amount: -8n },
        { account: a, amount: 4n },
        { account: b, amount: 4n },
      ],
    });
    expect(book.balance(a)).toBe(1n);
    expect(book.balance(b)).toBe(4n);
  });

  it("계정 생성·거래를 고리로 알린다(서버는 여기서 쓰기 대기열에 넣는다)", () => {
    const created: string[] = [];
    const posted: { txId: number; changed: [number, bigint][] }[] = [];
    const book = newBook({
      accountCreated: (account) =>
        created.push(`${account.id}:${account.ownerId ?? account.systemCode}:${account.asset}`),
      posted: (txId, _tx, changed) =>
        posted.push({ txId, changed: changed.map((acc) => [acc.id, acc.balance]) }),
    });
    const issue = book.systemAccount("issue:gold", "gold");
    const a = book.ownerAccount(3, "gold");
    book.post({
      kind: "issue",
      atMs: 1,
      entries: [
        { account: issue, amount: -2n },
        { account: a, amount: 2n },
      ],
    });
    expect(created).toEqual(["1:issue:gold:gold", "2:3:gold"]);
    expect(posted).toEqual([
      {
        txId: 1,
        changed: [
          [1, -2n],
          [2, 2n],
        ],
      },
    ]);
  });

  it("같은 주체·자산이라도 위치(창고)가 다르면 다른 계정이다", () => {
    const book = newBook();
    const source = book.systemAccount("source:ore", "ore");
    const here = book.ownerAccount(1, "ore", 10);
    const there = book.ownerAccount(1, "ore", 20);
    expect(here).not.toBe(there);
    expect(book.ownerAccount(1, "ore")).not.toBe(here);
    book.post({
      kind: "produce",
      atMs: 1,
      entries: [
        { account: source, amount: -5n },
        { account: here, amount: 5n },
      ],
    });
    expect(book.balanceOf(1, "ore", 10)).toBe(5n);
    expect(book.balanceOf(1, "ore", 20)).toBe(0n);
    expect(book.balanceOf(1, "ore")).toBe(0n);
  });

  it("처음 잔고(부팅 때 읽은 계정)에서 시작할 수 있다", () => {
    const accounts: LedgerAccount[] = [
      { id: 4, ownerId: 9, systemCode: null, asset: "gold", location: null, balance: 12n },
    ];
    const book = createLedgerBook({ accounts, nextAccountId: () => 5, nextTxId: counter() });
    expect(book.balanceOf(9, "gold")).toBe(12n);
    expect([...book.accounts()].map((acc) => acc.id)).toEqual([4]);
  });
});

describe("원장 감사(메모리 불변 조건 I1·I2·I6)", () => {
  it("규칙대로 쓴 장부는 위반이 없다", () => {
    const audit = createLedgerAudit();
    const book = newBook(audit.hooks);
    const issue = book.systemAccount("issue:gold", "gold");
    const sink = book.systemAccount("sink:gold", "gold");
    const a = book.ownerAccount(1, "gold");
    book.post({
      kind: "issue",
      atMs: 1,
      entries: [
        { account: issue, amount: -9n },
        { account: a, amount: 9n },
      ],
    });
    book.post({
      kind: "upkeep",
      atMs: 2,
      key: "upkeep:1:2",
      entries: [
        { account: a, amount: -4n },
        { account: sink, amount: 4n },
      ],
    });
    expect(audit.check(book.accounts())).toEqual([]);
    expect(audit.transactions).toBe(2);
  });

  it("잔고가 항목 합과 다르거나 주체 계정이 음수거나 자산 합이 0이 아니면 알린다", () => {
    const audit = createLedgerAudit();
    const book = newBook(audit.hooks);
    const issue = book.systemAccount("issue:gold", "gold");
    const a = book.ownerAccount(1, "gold");
    book.post({
      kind: "issue",
      atMs: 1,
      entries: [
        { account: issue, amount: -9n },
        { account: a, amount: 9n },
      ],
    });
    // 장부 밖에서 잔고가 틀어진 경우(버그·잘못 읽은 부팅 값)를 흉내 낸다
    const tampered: LedgerAccount[] = [
      { id: issue, ownerId: null, systemCode: "issue:gold", asset: "gold", location: null, balance: -9n },
      { id: a, ownerId: 1, systemCode: null, asset: "gold", location: null, balance: -1n },
    ];
    expect(audit.check(tampered)).toEqual([
      "I2 accounts whose balance differs from their entries: 1",
      "I2 owner accounts below zero: 1",
    ]);
  });

  it("자산별 합이 0이 아닌 거래가 들어오면 알린다(장부 버그 흉내: 고리에 바로 넣는다)", () => {
    const audit = createLedgerAudit();
    const a: LedgerAccount = {
      id: 1,
      ownerId: 1,
      systemCode: null,
      asset: "gold",
      location: null,
      balance: 3n,
    };
    audit.hooks.posted?.(1, { kind: "bug", atMs: 1, entries: [{ account: 1, amount: 3n }] }, [a]);
    expect(audit.check([a])).toEqual([
      "I1 assets whose entries do not sum to zero: 1",
      "I1 transactions not balanced per asset: 1",
    ]);
  });

  it("같은 중복 방지 키가 두 번 들어오면 알린다(I6)", () => {
    const audit = createLedgerAudit();
    const book = newBook(audit.hooks);
    const issue = book.systemAccount("issue:gold", "gold");
    const a = book.ownerAccount(1, "gold");
    for (let i = 0; i < 2; i++)
      book.post({
        kind: "issue",
        atMs: 1,
        key: "once",
        entries: [
          { account: issue, amount: -1n },
          { account: a, amount: 1n },
        ],
      });
    expect(audit.check(book.accounts())).toEqual(["I6 duplicate idempotency keys: 1"]);
  });
});
