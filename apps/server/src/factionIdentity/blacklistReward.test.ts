// 블랙리스트 사냥 보상(현상금·명성·가문 기여도) 단위 시험 — ADR 2026-11-25-house-city-approval-and-blacklist.md.
import { createLedgerBook } from "@terra/sim";
import { describe, expect, it, vi } from "vitest";
import { attachBlacklist } from "./blacklist.ts";
import { blacklistReward } from "./blacklistReward.ts";
import { NO_NATION_MONEY } from "../world/money.ts";

const makeOutcome = (loserOutcome: "returned" | "prisoner" | "retreated") => ({
  result: { winner: 1 },
  units: [
    { unit: 101, side: 1, outcome: "stays" as const },
    { unit: 202, side: 2, outcome: loserOutcome },
  ],
});

describe("블랙리스트 사냥 보상(blacklistReward)", () => {
  const NATION_ROW = 50;
  const TREASURY_OWNER = 10;
  const HUNTER_OWNER = 20;
  const OUTLAW_OWNER = 30;
  const HUNTER_USER = "00000000-0000-4000-8000-000000000001";
  const OUTLAW_USER = "00000000-0000-4000-8000-000000000002";

  it("블랙리스트 유저 격파 시 국고 현상금(있는 만큼)·국가 명성·가문 기여도를 지급한다", async () => {
    let nextAcc = 0;
    let nextTx = 0;
    const ledger = createLedgerBook({
      nextAccountId: () => ++nextAcc,
      nextTxId: () => ++nextTx,
      accounts: [],
    });
    // 국고에 300 채우기(현상금 500보다 작으므로 300만 지급 — 새 화폐를 만들지 않는다)
    ledger.post({
      kind: "seed",
      atMs: 1,
      entries: [
        { account: ledger.systemAccount("mint", NO_NATION_MONEY), amount: -300n },
        { account: ledger.ownerAccount(TREASURY_OWNER, NO_NATION_MONEY), amount: 300n },
      ],
    });
    const owners = new Map([
      [TREASURY_OWNER, { id: TREASURY_OWNER, userId: null, factionId: NATION_ROW }],
      [HUNTER_OWNER, { id: HUNTER_OWNER, userId: HUNTER_USER, factionId: null }],
      [OUTLAW_OWNER, { id: OUTLAW_OWNER, userId: OUTLAW_USER, factionId: null }],
    ]);
    const table = attachBlacklist({
      ledger,
      owners,
      pool: {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: "1",
              nation_id: String(NATION_ROW),
              city_id: "901",
              user_id: OUTLAW_USER,
              reason: "약탈",
              bounty: "500",
              renown_reward: 15,
              created_at_ms: "100",
            },
          ],
        }),
      },
    });
    await table.reload();

    const maps = new Map([
      [
        1,
        {
          unitInfo: (id: number) =>
            id === 101 ? { ownerId: HUNTER_OWNER } : id === 202 ? { ownerId: OUTLAW_OWNER } : undefined,
        },
      ],
    ]);
    const renownCalls: [string, number, number, number][] = [];
    const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
    const step = blacklistReward({
      maps,
      owners,
      ledger,
      cyborgs: {
        addRenown(userId, factionId, amount, atMs) {
          renownCalls.push([userId, factionId, amount, atMs]);
          return amount;
        },
      },
      pool: { query: poolQuery },
    });

    // 퇴각한 패자는 격파가 아니라 보상이 없다
    expect(step({ seed: 123 }, makeOutcome("retreated"), 1_000)).toBe(0);
    expect(ledger.balanceOf(HUNTER_OWNER, NO_NATION_MONEY)).toBe(0n);

    // 귀환(격파) 시 국고 잔고 300 전액 현상금 지급 + 명성 15 + 가문 기여도 DB 갱신
    expect(step({ seed: 123 }, makeOutcome("returned"), 2_000)).toBe(1);
    expect(ledger.balanceOf(TREASURY_OWNER, NO_NATION_MONEY)).toBe(0n);
    expect(ledger.balanceOf(HUNTER_OWNER, NO_NATION_MONEY)).toBe(300n);
    expect(renownCalls).toEqual([[HUNTER_USER, NATION_ROW, 15, 2_000]]);
    expect(poolQuery).toHaveBeenCalledWith(
      "update house_members set contribution = contribution + $1::bigint where user_id = any($2::uuid[])",
      ["15", [HUNTER_USER]],
    );
  });
});
