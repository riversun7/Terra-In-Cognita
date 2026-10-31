import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "../ledger/audit.ts";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import { PROTECTOR_ASSET, type GemRef, enchant, extractGene, gemAsset } from "./gems.ts";

function setup() {
  let account = 0;
  let tx = 0;
  const audit = createLedgerAudit();
  const book = createLedgerBook({
    nextAccountId: () => ++account,
    nextTxId: () => ++tx,
    hooks: audit.hooks,
  });
  return { book, audit };
}

const owner = 7;
const fire: GemRef = { kind: "skill", skill: "fire_bolt", grade: 4 };

describe("보석·유전자 추출(D-435·D-437)", () => {
  it("유전자 추출은 원본에서 스킬을 빼고 같은 등급 스킬 보석을 하나 만든다", () => {
    const { book, audit } = setup();
    const out = extractGene(
      book,
      owner,
      [
        { skill: "fire_bolt", grade: 4 },
        { skill: "war_cry", grade: 1 },
      ],
      "fire_bolt",
      0,
    );
    expect(out?.skills).toEqual([{ skill: "war_cry", grade: 1 }]);
    expect(out?.gem).toEqual(fire);
    expect(book.balanceOf(owner, gemAsset(fire))).toBe(1n);
    expect(extractGene(book, owner, [], "fire_bolt", 0)).toBeUndefined();
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("인챈트: 첫 소켓 60%로 성공하면 끼우고 보석은 원장에서 빠진다", () => {
    const { book } = setup();
    extractGene(book, owner, [{ skill: "fire_bolt", grade: 4 }], "fire_bolt", 0);
    const item = { socketCount: 2, gems: [], maxDurability: 100 };
    const out = enchant(book, owner, item, fire, { chance: 5999, loss: 0 }, false, 1);
    expect(out).toEqual({ result: "success", item: { ...item, gems: [fire] } });
    expect(book.balanceOf(owner, gemAsset(fire))).toBe(0n);
  });

  it("실패하면 내구도가 줄고 보석은 깨진다. 방지 아이템(등급별 수량)을 쓰면 보석은 남는다", () => {
    const { book } = setup();
    extractGene(book, owner, [{ skill: "fire_bolt", grade: 4 }], "fire_bolt", 0);
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`issue:${PROTECTOR_ASSET}`, PROTECTOR_ASSET), amount: -3n },
        { account: book.ownerAccount(owner, PROTECTOR_ASSET), amount: 3n },
      ],
    });
    const item = { socketCount: 1, gems: [], maxDurability: 100 };
    // 등급 4 → 방지 2개, 내구도 5~10 중 자리 9999 → 10
    const kept = enchant(book, owner, item, fire, { chance: 6000, loss: 9999 }, true, 1);
    expect(kept).toEqual({ result: "failed", item: { ...item, maxDurability: 90 }, gemKept: true });
    expect(book.balanceOf(owner, PROTECTOR_ASSET)).toBe(1n);
    expect(book.balanceOf(owner, gemAsset(fire))).toBe(1n);
    // 방지가 모자라면 보석이 깨진다
    const lost = enchant(book, owner, item, fire, { chance: 9999, loss: 0 }, true, 2);
    expect(lost).toEqual({ result: "failed", item: { ...item, maxDurability: 95 }, gemKept: false });
    expect(book.balanceOf(owner, gemAsset(fire))).toBe(0n);
    expect(() => enchant(book, owner, item, fire, { chance: 0, loss: 0 }, false, 3)).toThrow(RangeError);
  });
});
