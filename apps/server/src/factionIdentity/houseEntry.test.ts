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
import { houseVaultCode, vaultBalance } from "./houseVault.ts";
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
      systemAccount: (code, asset) => book.systemAccount(code, asset),
      balance: (account) => book.balance(account),
      accounts: () => book.accounts(),
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
    /** 가문 금고에 넣는다(발행 계정에서) */
    fundVault: (houseId: number, amount: bigint) =>
      book.post({
        kind: "issue",
        atMs: 0,
        entries: [
          { account: issue, amount: -amount },
          { account: book.systemAccount(houseVaultCode(houseId, ASSET_CREDIT), ASSET_CREDIT), amount },
        ],
      }),
    vault: (houseId: number) => vaultBalance(book, houseId, ASSET_CREDIT),
  };
}

describe("chargeHouseEntry·entryShortfall — 가문이 한꺼번에(D-573, 질문 2017 다)", () => {
  const charge = { houseId: 7, leaderId: "a", parts: [{ payee: 9, terms: 100n }], members: 3, nowMs: 1000 };
  const withTerms = (terms: bigint) => ({ ...charge, parts: [{ payee: 9, terms }] });
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

  it("가문 금고(국고와 따로 — D-338·질문 2150)가 먼저 내고 모자란 만큼 가문장 지갑, 지원금은 가문 금고가 받는다(국고에 있는 만큼)", async () => {
    // 가문 7의 소유 주체 60(도시를 가진 가문의 국고)은 금고가 아니다 — 쓰지 않는다
    const { p, balance, fundVault, vault } = fakePersistence(
      new Map([
        [60, 999n],
        [50, 150n],
      ]),
      { a: 1 },
      [{ id: 60, factionId: 7 }],
    );
    fundVault(7, 250n);
    expect(entryShortfall(p, charge)).toBe(50n);
    expect(await chargeHouseEntry(p, withTerms(-100n))).toEqual({ paid: 0n, granted: 150n });
    expect(vault(7)).toBe(400n);
    expect(balance(50)).toBe(0n);
    expect(balance(60)).toBe(999n);
    expect(balance(1)).toBe(0n);
  });

  it("가입비: 금고 250 + 가문장 지갑 100 → 금고를 비우고 지갑에서 50", async () => {
    const { p, balance, fundVault, vault } = fakePersistence(new Map([[1, 100n]]), { a: 1 });
    fundVault(7, 250n);
    expect(entryShortfall(p, charge)).toBe(0n);
    expect(await chargeHouseEntry(p, charge)).toEqual({ paid: 300n, granted: 0n });
    expect(vault(7)).toBe(0n);
    expect(balance(1)).toBe(50n);
    expect(balance(50)).toBe(300n);
  });

  it("정책 0·국고(소유 주체) 없는 나라·저장 층 없음은 아무것도 하지 않고 막지도 않는다, 가문장 지갑이 없으면 못 낸다", async () => {
    const { p, posts } = fakePersistence(new Map([[1, 100n]]), { a: 1 });
    const none = { paid: 0n, granted: 0n };
    expect(await chargeHouseEntry(p, withTerms(0n))).toEqual(none);
    expect(await chargeHouseEntry(p, { ...charge, parts: [{ payee: 4, terms: 100n }] })).toEqual(none);
    expect(await chargeHouseEntry(undefined, charge)).toEqual(none);
    expect(entryShortfall(undefined, charge)).toBe(0n);
    expect(entryShortfall(p, { ...charge, parts: [{ payee: 4, terms: 100n }] })).toBe(0n);
    expect(entryShortfall(p, { ...charge, leaderId: null })).toBe(300n);
    expect(posts).toEqual([]);
  });

  it("도시 몫·나라 몫은 별개로 둘 다(D-574 2142): 도시 가입비는 도시 주인 국고로, 나라 지원금은 나라 국고에서 금고로", async () => {
    // 세력 9(국고 50) = 나라, 세력 21(국고 70) = 도시 주인
    const { p, balance, vault } = fakePersistence(
      new Map([
        [1, 500n],
        [50, 1000n],
      ]),
      { a: 1 },
      [{ id: 70, factionId: 21 }],
    );
    const both = {
      ...charge,
      parts: [
        { payee: 21, terms: 40n },
        { payee: 9, terms: -10n },
      ],
    };
    // 못 내는지는 가입비 합(40 × 3 = 120)으로만 본다 — 받을 지원금으로 메우지 않는다
    expect(entryShortfall(p, both)).toBe(0n);
    expect(entryShortfall(p, { ...both, members: 20 })).toBe(300n);
    expect(await chargeHouseEntry(p, both)).toEqual({ paid: 120n, granted: 30n });
    expect(balance(70)).toBe(120n);
    expect(balance(50)).toBe(970n);
    expect(balance(1)).toBe(380n);
    expect(vault(7)).toBe(30n);
  });
});

/** 도시 정책 줄·나라 줄만 답하는 가짜 질의(houseEntryTermsOf가 묻는 두 SQL) */
function fakePolicies(
  cityFee: { fee: string; owner: number } | null,
  nation: { fee: string | null; kind: string; traits: unknown; fixed?: boolean } | null,
): EntryQueryable {
  return {
    query: async (text: string) => {
      if (text.includes("from city_policies"))
        return { rows: cityFee ? [{ house_entry_fee: cityFee.fee, faction_id: String(cityFee.owner) }] : [] };
      return {
        rows: nation
          ? [
              {
                house_entry_fee: nation.fee,
                kind: nation.kind,
                traits: nation.traits,
                fixed: nation.fixed ?? false,
              },
            ]
          : [],
      };
    },
  };
}

describe("houseEntryTermsOf — 도시·나라 정책(질문 2018 답)", () => {
  const npc = TEST_HOUSE_RULES.npcEntry;
  const base = { cityId: 3, nationId: 9, nationChanged: true, npc };
  it("도시 정책은 나라가 같아도 매기고 받는 쪽은 도시 주인, 나라가 바뀌면 나라 정책도 별개로(D-574 2142)", async () => {
    const q = fakePolicies({ fee: "40", owner: 21 }, { fee: "7", kind: "player", traits: null });
    expect(await houseEntryTermsOf(q, { ...base, nationChanged: false })).toEqual({
      terms: 40n,
      parts: [{ terms: 40n, payee: 21, source: "city" }],
    });
    expect(await houseEntryTermsOf(q, base)).toEqual({
      terms: 47n,
      parts: [
        { terms: 40n, payee: 21, source: "city" },
        { terms: 7n, payee: 9, source: "nation" },
      ],
    });
  });
  it("도시 정책이 없으면 나라가 바뀔 때만 나라 정책", async () => {
    const q = fakePolicies(null, { fee: "-15", kind: "player", traits: null });
    expect(await houseEntryTermsOf(q, base)).toEqual({
      terms: -15n,
      parts: [{ terms: -15n, payee: 9, source: "nation" }],
    });
    expect(await houseEntryTermsOf(q, { ...base, nationChanged: false })).toEqual({ terms: 0n, parts: [] });
  });
  it("정하지 않은 NPC 나라는 성향 규칙식, 플레이어 나라는 0", async () => {
    const merchant = fakePolicies(null, { fee: null, kind: "npc", traits: [500, 1000, 500, 500] });
    expect(await houseEntryTermsOf(merchant, base)).toEqual({
      terms: BigInt(npc.feeMax),
      parts: [{ terms: BigInt(npc.feeMax), payee: 9, source: "npc" }],
    });
    const player = fakePolicies(null, { fee: null, kind: "player", traits: null });
    expect((await houseEntryTermsOf(player, base)).terms).toBe(0n);
    expect((await houseEntryTermsOf(merchant, { ...base, npc: undefined })).terms).toBe(0n);
  });
  it("고정 NPC 나라(시작 나라)의 규칙식은 가입비를 내지 않는다: 가입비면 0, 지원금은 그대로, 지도자가 정한 가입비는 그대로", async () => {
    const merchant = fakePolicies(null, {
      fee: null,
      kind: "npc",
      traits: [500, 1000, 500, 500],
      fixed: true,
    });
    expect(await houseEntryTermsOf(merchant, base)).toEqual({ terms: 0n, parts: [] });
    const giver = fakePolicies(null, { fee: null, kind: "npc", traits: [500, 0, 500, 500], fixed: true });
    expect((await houseEntryTermsOf(giver, base)).terms).toBe(-BigInt(npc.grantMax));
    const set = fakePolicies(null, { fee: "40", kind: "npc", traits: [500, 0, 500, 500], fixed: true });
    expect((await houseEntryTermsOf(set, base)).terms).toBe(40n);
  });

  it("npcEntryTerms: 상업 성향 낮음 = 지원금, 성향 없음 = 0", () => {
    expect(npcEntryTerms([500, 0, 500, 500], npc)).toBe(-BigInt(npc.grantMax));
    expect(npcEntryTerms(null, npc)).toBe(0n);
  });
});
