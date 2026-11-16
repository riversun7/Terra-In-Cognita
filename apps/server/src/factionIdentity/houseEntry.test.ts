// 가문 이동 가입비·지원금 시험 — 기획 D-570("해당 국가나 도시의 정책에 따름. 지원금이 있을지 가입비가 있을지 등"), houseEntry.ts.
import { describe, expect, it } from "vitest";
import { createLedgerBook } from "@terra/sim";
import { ASSET_CREDIT } from "../world/settlement.ts";
import {
  type EntryQueryable,
  type HouseMovePersistence,
  chargeHouseEntry,
  entryShortfall,
  houseEntryTermsOf,
  npcEntryTerms,
} from "./houseEntry.ts";
import { TEST_HOUSE_RULES } from "./rules.ts";

/** 원장(공용 장부 — 계정 ID는 따로)·정산 흉내. balances = 소유 주체 → 처음 잔고(발행 계정에서), extraOwners = 국고 50(세력 9) 밖의 소유 주체 */
function fakePersistence(
  balances: ReadonlyMap<number, bigint>,
  users: Readonly<Record<string, number>>,
  extraOwners: readonly { id: number; factionId: number }[] = [],
) {
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
    owners: new Map([
      [50, { id: 50, factionId: 9 }],
      ...extraOwners.map((owner) => [owner.id, owner] as const),
    ]),
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

describe("chargeHouseEntry·entryShortfall — 가문이 한꺼번에(D-573, 질문 2017 다)", () => {
  const charge = { houseId: 7, leaderId: "a", payee: 9, terms: 100n, members: 3, nowMs: 1000 };
  it("가입비: 가문원마다 값 × 가문원 수를 가문장 지갑에서 국고로 한 번에, 모자라면 모자란 만큼을 알린다", async () => {
    const { p, posts, durable, balance } = fakePersistence(new Map([[1, 500n]]), { a: 1 });
    expect(entryShortfall(p, charge)).toBe(0n);
    expect(entryShortfall(p, { ...charge, members: 6 })).toBe(100n);
    expect(await chargeHouseEntry(p, charge)).toEqual({ paid: 300n, granted: 0n });
    expect(balance(50)).toBe(300n);
    expect(balance(1)).toBe(200n);
    expect(posts).toEqual(["house_entry:7:1000"]);
    expect(durable()).toBe(1);
  });

  it("가문 금고(가문 소유 주체)가 있으면 그것이 내고, 지원금도 가문 금고가 받는다(국고에 있는 만큼)", async () => {
    const { p, balance } = fakePersistence(
      new Map([
        [60, 250n],
        [50, 150n],
      ]),
      { a: 1 },
      [{ id: 60, factionId: 7 }],
    );
    expect(entryShortfall(p, charge)).toBe(50n);
    expect(await chargeHouseEntry(p, { ...charge, terms: -100n })).toEqual({ paid: 0n, granted: 150n });
    expect(balance(60)).toBe(400n);
    expect(balance(50)).toBe(0n);
    expect(balance(1)).toBe(0n);
  });

  it("정책 0·국고(소유 주체) 없는 나라·저장 층 없음은 아무것도 하지 않고 막지도 않는다, 가문장 지갑이 없으면 못 낸다", async () => {
    const { p, posts } = fakePersistence(new Map([[1, 100n]]), { a: 1 });
    const none = { paid: 0n, granted: 0n };
    expect(await chargeHouseEntry(p, { ...charge, terms: 0n })).toEqual(none);
    expect(await chargeHouseEntry(p, { ...charge, payee: 4 })).toEqual(none);
    expect(await chargeHouseEntry(undefined, charge)).toEqual(none);
    expect(entryShortfall(undefined, charge)).toBe(0n);
    expect(entryShortfall(p, { ...charge, payee: 4 })).toBe(0n);
    expect(entryShortfall(p, { ...charge, leaderId: null })).toBe(300n);
    expect(posts).toEqual([]);
  });
});

/** 도시 정책 줄·나라 줄만 답하는 가짜 질의(houseEntryTermsOf가 묻는 두 SQL) */
function fakePolicies(
  cityFee: { fee: string; owner: number } | null,
  nation: { fee: string | null; kind: string; traits: unknown } | null,
): EntryQueryable {
  return {
    query: async (text: string) => {
      if (text.includes("from city_policies"))
        return { rows: cityFee ? [{ house_entry_fee: cityFee.fee, faction_id: String(cityFee.owner) }] : [] };
      return {
        rows: nation ? [{ house_entry_fee: nation.fee, kind: nation.kind, traits: nation.traits }] : [],
      };
    },
  };
}

describe("houseEntryTermsOf — 도시·나라 정책(질문 2018 답)", () => {
  const npc = TEST_HOUSE_RULES.npcEntry;
  const base = { cityId: 3, nationId: 9, nationChanged: true, npc };
  it("도시 정책이 있으면 나라가 같아도 그것, 받는 쪽은 도시 주인", async () => {
    const q = fakePolicies({ fee: "40", owner: 21 }, { fee: "7", kind: "player", traits: null });
    expect(await houseEntryTermsOf(q, { ...base, nationChanged: false })).toEqual({
      terms: 40n,
      payee: 21,
      source: "city",
    });
  });
  it("도시 정책이 없으면 나라가 바뀔 때만 나라 정책", async () => {
    const q = fakePolicies(null, { fee: "-15", kind: "player", traits: null });
    expect(await houseEntryTermsOf(q, base)).toEqual({ terms: -15n, payee: 9, source: "nation" });
    expect(await houseEntryTermsOf(q, { ...base, nationChanged: false })).toEqual({
      terms: 0n,
      payee: null,
      source: "none",
    });
  });
  it("정하지 않은 NPC 나라는 성향 규칙식, 플레이어 나라는 0", async () => {
    const merchant = fakePolicies(null, { fee: null, kind: "npc", traits: [500, 1000, 500, 500] });
    expect(await houseEntryTermsOf(merchant, base)).toEqual({
      terms: BigInt(npc.feeMax),
      payee: 9,
      source: "npc",
    });
    const player = fakePolicies(null, { fee: null, kind: "player", traits: null });
    expect((await houseEntryTermsOf(player, base)).terms).toBe(0n);
    expect((await houseEntryTermsOf(merchant, { ...base, npc: undefined })).terms).toBe(0n);
  });
  it("npcEntryTerms: 상업 성향 낮음 = 지원금, 성향 없음 = 0", () => {
    expect(npcEntryTerms([500, 0, 500, 500], npc)).toBe(-BigInt(npc.grantMax));
    expect(npcEntryTerms(null, npc)).toBe(0n);
  });
});
