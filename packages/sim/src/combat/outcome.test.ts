import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "../ledger/audit.ts";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import { runBattle } from "./battle.ts";
import { postLoot, resolveOutcomes } from "./outcome.ts";
import { duel } from "./testBattle.ts";

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

describe("전투 결과 되돌리기", () => {
  it("이긴 편은 남고, 진 편은 안전 도시로(전쟁이면 포로), 사이보그는 늘 귀환, 쓰러졌으면 부상", () => {
    const base = duel(3, 2);
    const init = {
      ...base,
      units: base.units.map((spec) =>
        spec.side === 1
          ? { ...spec, attack: { ...spec.attack, weaponAttack: 200 } }
          : spec.id === 101
            ? { ...spec, cyborg: true }
            : spec,
      ),
    };
    const { state } = runBattle(init, []);
    const peace = resolveOutcomes(state, { war: false });
    const war = resolveOutcomes(state, { war: true });
    expect(peace.filter((r) => r.side === 1).every((r) => r.outcome === "stays")).toBe(true);
    expect(peace.filter((r) => r.side === 2).map((r) => r.outcome)).toEqual([
      "returned",
      "returned",
      "returned",
    ]);
    expect(war.filter((r) => r.side === 2).map((r) => r.outcome)).toEqual([
      "returned",
      "prisoner",
      "prisoner",
    ]);
    expect(war.filter((r) => r.side === 2).every((r) => r.injured)).toBe(true);
  });

  it("탈취는 진 쪽 화물의 몫을 이긴 쪽으로 옮기고, 물건이 생기거나 사라지지 않는다", () => {
    const audit = createLedgerAudit();
    const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter(), hooks: audit.hooks });
    const give = (owner: number, amount: bigint) =>
      book.post({
        kind: "issue",
        atMs: 0,
        entries: [
          { account: book.systemAccount("issue:item:ore", "item:ore"), amount: -amount },
          { account: book.ownerAccount(owner, "item:ore", 9), amount },
        ],
      });
    give(2, 101n);
    give(3, 7n);
    const moved = postLoot(
      book,
      [
        { owner: 2, asset: "item:ore", location: 9 },
        { owner: 3, asset: "item:ore", location: 9 },
      ],
      1,
      5000,
      10,
    );
    // ⌊101 × 50%⌋ = 50, ⌊7 × 50%⌋ = 3
    expect(moved).toBe(53n);
    expect(book.balanceOf(1, "item:ore", 9)).toBe(53n);
    expect(
      book.balanceOf(2, "item:ore", 9) + book.balanceOf(3, "item:ore", 9) + book.balanceOf(1, "item:ore", 9),
    ).toBe(108n);
    expect(audit.check(book.accounts())).toEqual([]);
  });
});
