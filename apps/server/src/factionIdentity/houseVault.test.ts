// 가문 금고 시험 — D-338·D-213(질문 2150 → 고침, fixes-1116l), houseVault.ts.
import { describe, expect, it } from "vitest";
import { createLedgerBook } from "@terra/sim";
import { ASSET_CREDIT } from "../world/settlement.ts";
import {
  houseVaultCode,
  parseHouseVaultCode,
  rulingVaultOf,
  vaultAccount,
  vaultBalance,
  vaultTake,
} from "./houseVault.ts";

function book() {
  let accountId = 0;
  let txId = 0;
  return createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
}

describe("가문 금고 — 국고와 따로 둔 시스템 계정", () => {
  it("코드는 가문 세력 행 ID·자산으로 하나, 거꾸로 읽는다", () => {
    expect(houseVaultCode(42, ASSET_CREDIT)).toBe(`vault:house:42:${ASSET_CREDIT}`);
    expect(parseHouseVaultCode(houseVaultCode(42, ASSET_CREDIT))).toEqual({
      houseId: 42,
      asset: ASSET_CREDIT,
    });
    expect(parseHouseVaultCode("escrow:labor:3")).toBeUndefined();
  });

  it("읽기는 계정을 만들지 않고(없으면 0), 넣을 때 만든다. 꺼내기는 잔고까지만", () => {
    const b = book();
    expect(vaultBalance(b, 7, ASSET_CREDIT)).toBe(0n);
    expect([...b.accounts()]).toHaveLength(0);
    const issue = b.systemAccount("issue:test", ASSET_CREDIT);
    b.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: issue, amount: -120n },
        { account: vaultAccount(b, 7, ASSET_CREDIT), amount: 120n },
      ],
    });
    expect(vaultBalance(b, 7, ASSET_CREDIT)).toBe(120n);
    expect(vaultBalance(b, 8, ASSET_CREDIT)).toBe(0n);
    expect(vaultTake(b, 7, ASSET_CREDIT, 50n)).toBe(50n);
    expect(vaultTake(b, 7, ASSET_CREDIT, 500n)).toBe(120n);
    expect(vaultTake(b, 8, ASSET_CREDIT, 500n)).toBe(0n);
  });

  it("독재 지배 가문 금고(D-338): 플레이어 가문 나라는 그 가문 금고, NPC 나라·세력 행 없는 주체는 없음(국고에 남는다 — 질문 2223)", () => {
    const b = book();
    const owners = new Map([
      [70, { factionId: 12 }],
      [71, { factionId: null }],
      [5, { factionId: 3 }],
    ]);
    const account = rulingVaultOf(b, owners, { id: 70, player: true }, ASSET_CREDIT);
    expect(account).toBe(vaultAccount(b, 12, ASSET_CREDIT));
    expect(rulingVaultOf(b, owners, { id: 71, player: true }, ASSET_CREDIT)).toBeUndefined();
    expect(rulingVaultOf(b, owners, { id: 5 }, ASSET_CREDIT)).toBeUndefined();
  });
});
