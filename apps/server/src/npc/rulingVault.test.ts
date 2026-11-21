// NPC 지배 가문 금고 시험 — 기획 대조 2223 고침(D-338·D-555 1509·D-574), rulingVault.ts
import { describe, expect, it } from "vitest";
import { type SimFaction, type SimHooks, createLedgerBook, newFaction } from "@terra/sim";
import { unitPurseLocation } from "@terra/shared/businessBooks";
import { npcHouseVaultCode, withNpcRulingVault } from "./rulingVault.ts";
import { rulingSpendShares, splitDividend, traitScalePm } from "./rulingSpend.ts";

const ASSET = "credit";

function setup(commerce: number) {
  let accountId = 0;
  let txId = 0;
  const book = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
  const base: SimHooks = {
    treasuryAsset: () => ASSET,
    beforeCityTransfer: () => {},
    factionBorn: () => {},
    factionDied: () => {},
    // 플레이어 가문 나라만 답하는 원래 고리
    rulingVaultOf: (faction) => (faction.player ? 999 : undefined),
  };
  const hooks = withNpcRulingVault(base, {
    ledger: book,
    rulingHouseOf: (owner) => (owner === 5 ? 42 : undefined),
    rule: () => ({ traitMin: 0, traitMax: 1000, minPm: 300, maxPm: 900 }),
  });
  const faction = (id: number, player?: true): SimFaction => {
    const made = newFaction(id, "fake_nation", {
      fixed: true,
      tech: 0,
      regime: "dictatorship",
      settledAtMs: 0,
      traits: { aggression: 500, commerce, faith: 500, station: 500 },
    });
    return player ? { ...made, player } : made;
  };
  return { book, hooks, faction };
}

describe("withNpcRulingVault", () => {
  it("독재 NPC 나라 → 지배 가문 금고, 플레이어 가문 나라는 원래 고리, 지배 가문이 없으면 국고(undefined)", () => {
    const { book, hooks, faction } = setup(500);
    const account = hooks.rulingVaultOf?.(faction(5), ASSET);
    expect([...book.accounts()].find((a) => a.id === account)?.systemCode).toBe(npcHouseVaultCode(42, ASSET));
    expect(npcHouseVaultCode(42, ASSET)).toBe("vault:house:npc:42:credit");
    expect(hooks.rulingVaultOf?.(faction(6), ASSET)).toBeUndefined();
    expect(hooks.rulingVaultOf?.(faction(5, true), ASSET)).toBe(999);
  });

  it("배당 차례 뒤 금고 몫을 국고로 돌려보낸다(상업 성향 낮음 = 900‰, 높음 = 300‰)", () => {
    for (const [commerce, back] of [
      [0, 900n],
      [1000, 300n],
      [500, 600n],
    ] as const) {
      const { book, hooks, faction } = setup(commerce);
      const account = hooks.rulingVaultOf?.(faction(5), ASSET) ?? 0;
      const issue = book.systemAccount("issue:test", ASSET);
      book.post({
        kind: "issue",
        atMs: 0,
        entries: [
          { account: issue, amount: -1000n },
          { account, amount: 1000n },
        ],
      });
      hooks.rulingVaultPaid?.(faction(5), ASSET, 10);
      expect(book.balanceOf(5, ASSET)).toBe(back);
      expect(book.balance(account)).toBe(1000n - back);
    }
  });
});

describe("NPC 지배 가문장 꺼내기·쓰기(house-9 — D-576 꺼내기를 NPC에도, D-554 성향, 질문 2255 다안)", () => {
  const spendRule = { traitMin: 0, traitMax: 1000, takePm: 500, dividendPm: 300, investPm: 300 };

  it("성향 배율: 가장 낮음 500‰ ~ 가장 높음 1500‰, 두 몫 합이 1000‰을 넘으면 비율대로 줄인다", () => {
    expect(traitScalePm(0, spendRule)).toBe(500);
    expect(traitScalePm(500, spendRule)).toBe(1000);
    expect(traitScalePm(1000, spendRule)).toBe(1500);
    expect(rulingSpendShares({ faith: 500, commerce: 500 }, spendRule)).toEqual({
      dividendPm: 300,
      investPm: 300,
    });
    expect(rulingSpendShares({ faith: 0, commerce: 1000 }, spendRule)).toEqual({
      dividendPm: 150,
      investPm: 450,
    });
    expect(
      rulingSpendShares({ faith: 1000, commerce: 1000 }, { ...spendRule, dividendPm: 600, investPm: 600 }),
    ).toEqual({ dividendPm: 500, investPm: 500 });
    expect(splitDividend(10n, [3, 4, 5])).toEqual([
      { unit: 3, amount: 3n },
      { unit: 4, amount: 3n },
      { unit: 5, amount: 3n },
    ]);
    expect(splitDividend(2n, [3, 4, 5])).toEqual([]);
  });

  it("돌려보낸 뒤 남은 금고 × 꺼내기 몫 → 가문장 지갑, 거기서 가문원 배당·국고 투자, 나머지는 가문장 지갑", () => {
    let accountId = 0;
    let txId = 0;
    const book = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
    const base: SimHooks = {
      treasuryAsset: () => ASSET,
      beforeCityTransfer: () => {},
      factionBorn: () => {},
      factionDied: () => {},
    };
    const hooks = withNpcRulingVault(base, {
      ledger: book,
      rulingHouseOf: (owner) => (owner === 5 ? 42 : undefined),
      rule: () => ({ traitMin: 0, traitMax: 1000, minPm: 300, maxPm: 900 }),
      headOf: (house, nation) =>
        house === 42
          ? {
              leader: { unit: 70, owner: nation },
              members: [
                { unit: 71, owner: 5 },
                { unit: 72, owner: 5 },
              ],
            }
          : undefined,
      spendRule: () => spendRule,
    });
    const faction = newFaction(5, "fake_nation", {
      fixed: true,
      tech: 0,
      regime: "dictatorship",
      settledAtMs: 0,
      traits: { aggression: 500, commerce: 500, faith: 500, station: 500 },
    });
    const account = hooks.rulingVaultOf?.(faction, ASSET) ?? 0;
    const issue = book.systemAccount("issue:test", ASSET);
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: issue, amount: -2000n },
        { account, amount: 2000n },
      ],
    });
    hooks.rulingVaultPaid?.(faction, ASSET, 10);
    // 국고 돌려보내기 600‰ = 1200 → 남은 800 × 꺼내기 500‰ = 400 → 배당 300‰ = 120(60씩) · 투자 300‰ = 120 · 가문장 160
    expect(book.balance(account)).toBe(400n);
    expect(book.balanceOf(5, ASSET)).toBe(1200n + 120n);
    expect(book.balanceOf(5, ASSET, unitPurseLocation(70))).toBe(160n);
    expect(book.balanceOf(5, ASSET, unitPurseLocation(71))).toBe(60n);
    expect(book.balanceOf(5, ASSET, unitPurseLocation(72))).toBe(60n);
  });
});
