// 블랙리스트 사냥 보상(현상금·명성·가문 기여도) 단위 시험 — ADR 2026-11-25-house-city-approval-and-blacklist.md,
// 현상금 제한(도시 국고·한 번만·건 사람 제외·상한) — ADR 2026-11-25-blacklist-bounty-limits.md.
import { createLedgerBook } from "@terra/sim";
import { describe, expect, it, vi } from "vitest";
import { NO_NATION_MONEY } from "../world/money.ts";
import { attachBlacklist } from "./blacklist.ts";
import { blacklistReward } from "./blacklistReward.ts";

const NATION_ROW = 50;
/** 등록한 도시(901)를 가진 가문(나라의 봉신) — 현상금은 이 세력의 국고에서 나간다 */
const CITY_HOUSE_ROW = 60;
const NATION_TREASURY = 10;
const CITY_TREASURY = 11;
const HUNTER_OWNER = 20;
const OUTLAW_OWNER = 30;
const MAYOR_OWNER = 40;
const HUNTER_USER = "00000000-0000-4000-8000-000000000001";
const OUTLAW_USER = "00000000-0000-4000-8000-000000000002";
const MAYOR_USER = "00000000-0000-4000-8000-000000000003";
const HUNTER_UNIT = 101;
const OUTLAW_UNIT = 202;
const MAYOR_UNIT = 303;

const outcomeOf = (winners: readonly number[], loserOutcome: "returned" | "prisoner" | "retreated") => ({
  result: { winner: 1 },
  units: [
    ...winners.map((unit) => ({ unit, side: 1, outcome: "stays" as const })),
    { unit: OUTLAW_UNIT, side: 2, outcome: loserOutcome },
  ],
});

/** 국고 둘(나라 1,000·도시 가문 cityFunds)과 블랙리스트 한 줄(row로 덮어쓴다)을 가진 세계 */
async function setup(o: {
  readonly cityFunds: bigint;
  readonly row?: Record<string, unknown>;
  readonly bountyMax?: bigint;
}) {
  let nextAcc = 0;
  let nextTx = 0;
  const ledger = createLedgerBook({
    nextAccountId: () => ++nextAcc,
    nextTxId: () => ++nextTx,
    accounts: [],
  });
  const seed = (owner: number, amount: bigint): void => {
    if (amount === 0n) return;
    ledger.post({
      kind: "seed",
      atMs: 1,
      entries: [
        { account: ledger.systemAccount("mint", NO_NATION_MONEY), amount: -amount },
        { account: ledger.ownerAccount(owner, NO_NATION_MONEY), amount },
      ],
    });
  };
  seed(NATION_TREASURY, 1_000n);
  seed(CITY_TREASURY, o.cityFunds);
  const owners = new Map([
    [NATION_TREASURY, { id: NATION_TREASURY, userId: null, factionId: NATION_ROW }],
    [CITY_TREASURY, { id: CITY_TREASURY, userId: null, factionId: CITY_HOUSE_ROW }],
    [HUNTER_OWNER, { id: HUNTER_OWNER, userId: HUNTER_USER, factionId: null }],
    [OUTLAW_OWNER, { id: OUTLAW_OWNER, userId: OUTLAW_USER, factionId: null }],
    [MAYOR_OWNER, { id: MAYOR_OWNER, userId: MAYOR_USER, factionId: null }],
  ]);
  const row = {
    id: "1",
    nation_id: String(NATION_ROW),
    city_id: "901",
    city_faction_id: String(CITY_HOUSE_ROW),
    user_id: OUTLAW_USER,
    created_by: MAYOR_USER,
    reason: "약탈",
    bounty: "500",
    renown_reward: 15,
    created_at_ms: "100",
    bounty_agenda_id: null,
    ...o.row,
  };
  const tableQuery = vi.fn().mockResolvedValue({ rows: [row] });
  const table = attachBlacklist({ ledger, owners, pool: { query: tableQuery } });
  await table.reload();
  const unitOwners = new Map([
    [HUNTER_UNIT, HUNTER_OWNER],
    [OUTLAW_UNIT, OUTLAW_OWNER],
    [MAYOR_UNIT, MAYOR_OWNER],
  ]);
  const maps = new Map([
    [
      1,
      {
        unitInfo: (id: number) => {
          const ownerId = unitOwners.get(id);
          return ownerId === undefined ? undefined : { ownerId };
        },
      },
    ],
  ]);
  const renownCalls: [string, number, number, number][] = [];
  const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
  const { bountyMax } = o;
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
    ...(bountyMax === undefined ? {} : { bountyMax: () => bountyMax }),
  });
  const balance = (owner: number): bigint => ledger.balanceOf(owner, NO_NATION_MONEY);
  return { table, tableQuery, step, balance, renownCalls, poolQuery };
}

describe("블랙리스트 사냥 보상(blacklistReward)", () => {
  it("격파하면 등록한 도시의 국고에서 현상금(있는 만큼)·국가 명성·가문 기여도를 준다 — 나라 국고는 그대로", async () => {
    // 도시 국고 300 < 현상금 500 → 300만 준다(새 화폐를 만들지 않는다)
    const w = await setup({ cityFunds: 300n });

    // 퇴각한 패자는 격파가 아니라 보상이 없다
    expect(w.step({ seed: 123 }, outcomeOf([HUNTER_UNIT], "retreated"), 1_000)).toBe(0);
    expect(w.balance(HUNTER_OWNER)).toBe(0n);

    expect(w.step({ seed: 123 }, outcomeOf([HUNTER_UNIT], "returned"), 2_000)).toBe(1);
    expect(w.balance(CITY_TREASURY)).toBe(0n);
    expect(w.balance(HUNTER_OWNER)).toBe(300n);
    expect(w.balance(NATION_TREASURY)).toBe(1_000n);
    expect(w.renownCalls).toEqual([[HUNTER_USER, NATION_ROW, 15, 2_000]]);
    expect(w.poolQuery).toHaveBeenCalledWith(
      "update house_members set contribution = contribution + $1::bigint where user_id = any($2::uuid[])",
      ["15", [HUNTER_USER]],
    );
  });

  it("현상금은 한 번만 준다: 다시 격파해도, 표를 다시 읽어도 국고에서 더 나가지 않는다", async () => {
    const w = await setup({ cityFunds: 2_000n });
    expect(w.step({ seed: 1 }, outcomeOf([HUNTER_UNIT], "returned"), 2_000)).toBe(1);
    expect(w.balance(HUNTER_OWNER)).toBe(500n);
    expect(w.table.entriesForUser(OUTLAW_USER)[0]?.bounty).toBe(0n);
    // 준 항목은 DB에서도 0으로(같은 등록일 때만)
    expect(w.tableQuery).toHaveBeenCalledWith(
      "update nation_blacklist set bounty = 0 where id = $1 and created_at_ms = $2",
      [1, 100],
    );

    // 다시 격파: 명성은 받지만 현상금은 없다
    expect(w.step({ seed: 2 }, outcomeOf([HUNTER_UNIT], "prisoner"), 3_000)).toBe(1);
    expect(w.balance(HUNTER_OWNER)).toBe(500n);
    expect(w.balance(CITY_TREASURY)).toBe(1_500n);

    // DB 갱신이 닿기 전에 표를 다시 읽어도(줄에 아직 500) 같은 등록이면 다시 주지 않는다
    await w.table.reload();
    expect(w.table.entriesForUser(OUTLAW_USER)[0]?.bounty).toBe(0n);
    expect(w.step({ seed: 3 }, outcomeOf([HUNTER_UNIT], "returned"), 4_000)).toBe(1);
    expect(w.balance(CITY_TREASURY)).toBe(1_500n);
  });

  it("국고가 모자라 덜 줬어도 남은 몫을 뒤에 주지 않는다", async () => {
    const w = await setup({ cityFunds: 100n });
    expect(w.step({ seed: 1 }, outcomeOf([HUNTER_UNIT], "returned"), 2_000)).toBe(1);
    expect(w.balance(HUNTER_OWNER)).toBe(100n);
    expect(w.table.entriesForUser(OUTLAW_USER)[0]?.bounty).toBe(0n);
  });

  it("현상금을 건 사람은 받지 못한다(같이 이기면 다른 승자만, 혼자 이기면 현상금이 남는다)", async () => {
    const alone = await setup({ cityFunds: 2_000n });
    expect(alone.step({ seed: 1 }, outcomeOf([MAYOR_UNIT], "returned"), 2_000)).toBe(1);
    expect(alone.balance(MAYOR_OWNER)).toBe(0n);
    expect(alone.balance(CITY_TREASURY)).toBe(2_000n);
    expect(alone.table.entriesForUser(OUTLAW_USER)[0]?.bounty).toBe(500n);

    const together = await setup({ cityFunds: 2_000n });
    expect(together.step({ seed: 1 }, outcomeOf([HUNTER_UNIT, MAYOR_UNIT], "returned"), 2_000)).toBe(1);
    expect(together.balance(MAYOR_OWNER)).toBe(0n);
    expect(together.balance(HUNTER_OWNER)).toBe(500n);
  });

  it("옛 규칙으로 적힌 큰 현상금은 줄 때 상한으로 자르고, 도시가 없는 줄은 현상금이 없다", async () => {
    const capped = await setup({ cityFunds: 2_000n, row: { bounty: "1000000000000000" }, bountyMax: 700n });
    expect(capped.step({ seed: 1 }, outcomeOf([HUNTER_UNIT], "returned"), 2_000)).toBe(1);
    expect(capped.balance(HUNTER_OWNER)).toBe(700n);
    expect(capped.balance(CITY_TREASURY)).toBe(1_300n);

    // 나라 의결로 승인된 현상금은 그 금액 그대로(상한은 투표 없이 건 현상금에만 — ADR 2026-11-25-blacklist-bounty-vote.md)
    const voted = await setup({
      cityFunds: 30_000n,
      row: { bounty: "20000", bounty_agenda_id: "7" },
      bountyMax: 700n,
    });
    expect(voted.step({ seed: 1 }, outcomeOf([HUNTER_UNIT], "returned"), 2_000)).toBe(1);
    expect(voted.balance(HUNTER_OWNER)).toBe(20_000n);
    expect(voted.balance(CITY_TREASURY)).toBe(10_000n);

    const noCity = await setup({ cityFunds: 2_000n, row: { city_id: null, city_faction_id: null } });
    expect(noCity.step({ seed: 1 }, outcomeOf([HUNTER_UNIT], "returned"), 2_000)).toBe(1);
    expect(noCity.balance(HUNTER_OWNER)).toBe(0n);
    expect(noCity.balance(NATION_TREASURY)).toBe(1_000n);
    expect(noCity.balance(CITY_TREASURY)).toBe(2_000n);
  });
});
