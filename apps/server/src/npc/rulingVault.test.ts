// NPC 지배 가문 금고 시험 — 기획 대조 2223 고침(D-338·D-555 1509·D-574), rulingVault.ts
import { describe, expect, it } from "vitest";
import { type SimFaction, type SimHooks, createLedgerBook, newFaction } from "@terra/sim";
import { npcHouseVaultCode, withNpcRulingVault } from "./rulingVault.ts";

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
