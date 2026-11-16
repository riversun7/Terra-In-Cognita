// 가문 이동 가입비·지원금 시험 — 기획 D-570("해당 국가나 도시의 정책에 따름. 지원금이 있을지 가입비가 있을지 등"), houseEntry.ts.
import { describe, expect, it } from "vitest";
import { createLedgerBook } from "@terra/sim";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { type HouseMovePersistence, chargeHouseEntry } from "./houseEntry.ts";

/** 원장(공용 장부 — 계정 ID는 따로)·정산 흉내. balances = 소유 주체 → 처음 잔고(발행 계정에서) */
function fakePersistence(balances: ReadonlyMap<number, bigint>, users: Readonly<Record<string, number>>) {
  let accountId = 0;
  let txId = 0;
  const posts: string[] = [];
  let durable = 0;
  const book = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
  const issue = book.systemAccount("issue:test", ASSET_CREDIT);
  for (const [owner, amount] of balances)
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: issue, amount: -amount },
        { account: book.ownerAccount(owner, ASSET_CREDIT), amount },
      ],
    });
  const p: HouseMovePersistence = {
    owners: new Map([[50, { id: 50, factionId: 9 }]]),
    settlement: { findOwnerOfUser: (userId) => users[userId], settleOwner: () => undefined },
    ledger: {
      balanceOf: (owner, asset) => book.balanceOf(owner, asset),
      ownerAccount: (owner, asset) => book.ownerAccount(owner, asset),
      post: (tx) => {
        if (tx.key !== undefined) posts.push(tx.key);
        return book.post(tx);
      },
    },
    writer: {
      durable: async () => {
        durable += 1;
      },
    },
  };
  return {
    p,
    posts,
    durable: () => durable,
    balance: (owner: number) => book.balanceOf(owner, ASSET_CREDIT),
  };
}

describe("chargeHouseEntry", () => {
  it("가입비: 가문원마다 → 나라 국고, 잔고가 모자라면 있는 만큼, 소유 주체가 없는 사람은 건너뜀", async () => {
    const balances = new Map<number, bigint>([
      [1, 500n],
      [2, 30n],
    ]);
    const { p, posts, durable, balance } = fakePersistence(balances, { a: 1, b: 2 });
    const result = await chargeHouseEntry(p, {
      houseId: 7,
      nationId: 9,
      terms: 100n,
      userIds: ["a", "b", "nobody"],
      nowMs: 1000,
    });
    expect(result).toEqual({ paid: 130n, granted: 0n });
    expect(balance(50)).toBe(130n);
    expect(balance(2)).toBe(0n);
    expect(posts).toEqual(["house_entry:7:a:1000", "house_entry:7:b:1000"]);
    expect(durable()).toBe(1);
  });

  it("지원금: 나라 국고 → 가문원마다, 국고에 있는 만큼(새 화폐를 만들지 않음)", async () => {
    const balances = new Map<number, bigint>([[50, 150n]]);
    const { p, balance } = fakePersistence(balances, { a: 1, b: 2 });
    const result = await chargeHouseEntry(p, {
      houseId: 7,
      nationId: 9,
      terms: -100n,
      userIds: ["a", "b"],
      nowMs: 1,
    });
    expect(result).toEqual({ paid: 0n, granted: 150n });
    expect(balance(1)).toBe(100n);
    expect(balance(2)).toBe(50n);
    expect(balance(50)).toBe(0n);
  });

  it("정책 0·국고(소유 주체) 없는 나라·저장 층 없음은 아무것도 하지 않는다", async () => {
    const { p, posts } = fakePersistence(new Map([[1, 100n]]), { a: 1 });
    expect(
      await chargeHouseEntry(p, { houseId: 7, nationId: 9, terms: 0n, userIds: ["a"], nowMs: 1 }),
    ).toEqual({
      paid: 0n,
      granted: 0n,
    });
    expect(
      await chargeHouseEntry(p, { houseId: 7, nationId: 4, terms: 10n, userIds: ["a"], nowMs: 1 }),
    ).toEqual({
      paid: 0n,
      granted: 0n,
    });
    expect(
      await chargeHouseEntry(undefined, { houseId: 7, nationId: 9, terms: 10n, userIds: ["a"], nowMs: 1 }),
    ).toEqual({
      paid: 0n,
      granted: 0n,
    });
    expect(posts).toEqual([]);
  });
});
