// 군단 명령 3단계(기획 D-571) 서버: 작위 = 나라 명성 구간(1961)·정원은 작위로만(1962)·방어 명성·실시간 세계 전투 명령(1969)
import {
  BATTLE_FORMATIONS,
  BATTLE_ORDER_PROTOCOL_VERSION,
  BATTLE_TACTICS,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "@terra/protocol";
import { REPORT_FORMATIONS, REPORT_TACTICS } from "@terra/shared/battleReport";
import {
  type BattleInput,
  type UnitOutcome,
  DEFAULT_RENOWN_COEFFICIENTS,
  FORMATION_SHAPES,
  SIM_VERSION,
  TACTICS,
  TEST_COMBAT_COEFFICIENTS,
  commandCapOf,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type BattleOrderWorld, createBattleOrders, orderInputOf } from "./battleOrders.ts";
import type { BattleOutcome, RunningBattle } from "./battles.ts";
import { createCommandRanks, titleOfUser } from "./commandRanks.ts";
import { defenseRenown } from "./defenseRenown.ts";
import { testEncounter } from "./testSupport.ts";

const { tickMs } = TEST_COMBAT_COEFFICIENTS;

describe("판 번호·목록(D-571 줄기)", () => {
  it("SIM 60 이상·실시간 전투 명령 프로토콜 49(지금 판 이하, 최소 = 지금 판 − 1)·대형·전개 방식 목록이 판정·보고서와 같다", () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(60);
    expect(BATTLE_ORDER_PROTOCOL_VERSION).toBe(49);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(BATTLE_ORDER_PROTOCOL_VERSION);
    expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION - 1);
    expect([...BATTLE_FORMATIONS]).toEqual([...FORMATION_SHAPES]);
    expect([...REPORT_FORMATIONS]).toEqual([...FORMATION_SHAPES]);
    expect([...BATTLE_TACTICS]).toEqual([...TACTICS]);
    expect([...REPORT_TACTICS]).toEqual([...TACTICS]);
  });
});

/** 사용자 → (나라, 명성) 가짜 사이보그 */
function fakeCyborgs(
  rows: Record<string, { faction: number; renown: Record<number, number>; unit: number }>,
) {
  const added: [string, number, number][] = [];
  return {
    added,
    record: (userId: string) => {
      const row = rows[userId];
      return row ? { factionId: row.faction } : undefined;
    },
    renownOf: (userId: string, factionId: number) => rows[userId]?.renown[factionId] ?? 0,
    userOfUnit: (unitId: number) => Object.entries(rows).find(([, row]) => row.unit === unitId)?.[0],
    addRenown: (userId: string, factionId: number, amount: number) => {
      const row = rows[userId];
      if (!row) return undefined;
      row.renown[factionId] = (row.renown[factionId] ?? 0) + amount;
      added.push([userId, factionId, amount]);
      return row.renown[factionId];
    },
  };
}

describe("작위 = 지금 나라 명성 구간(D-326·D-571 답 1961)", () => {
  const cyborgs = fakeCyborgs({
    a: { faction: 7, renown: { 7: 1200, 8: 9000 }, unit: 11 },
    b: { faction: 8, renown: {}, unit: 12 },
  });
  it("속한 나라의 명성만 본다(다른 나라 명성은 그 나라 작위)", () => {
    expect(titleOfUser(cyborgs, DEFAULT_RENOWN_COEFFICIENTS, "a")).toBe(3);
    expect(titleOfUser(cyborgs, DEFAULT_RENOWN_COEFFICIENTS, "b")).toBe(0);
    expect(titleOfUser(cyborgs, DEFAULT_RENOWN_COEFFICIENTS, "nobody")).toBe(0);
  });

  it("지휘 계급의 작위 칸을 채우고, 정원은 작위로만(랭킹 등급은 승계 순서에만 — 답 1962)", async () => {
    const ranks = createCommandRanks({
      pool: undefined,
      cyborgs,
      titleOf: (userId) => titleOfUser(cyborgs, DEFAULT_RENOWN_COEFFICIENTS, userId),
      paths: [],
      tiersPm: () => [10, 50, 200, 500],
      now: () => 0,
    });
    const rank = ranks.rankOf(11);
    expect(rank).toEqual({ title: 3, combatTier: null });
    expect(commandCapOf(rank, 0, TEST_COMBAT_COEFFICIENTS)).toBe(5);
    expect(commandCapOf({ title: 0, combatTier: 0 }, 0, TEST_COMBAT_COEFFICIENTS)).toBe(3);
    expect(ranks.rankOf(999)).toBeUndefined();
  });
});

/** 방어 명성 시험 자료 */
const defenseInit = testEncounter(undefined, [100, 200]);
const defenseOutcome = (
  winner: number,
  units: { unit: number; side: number; outcome: UnitOutcome }[],
): BattleOutcome => ({
  result: { winner, reason: "wipe", endTick: 10 },
  units: units.map((entry) => ({ ...entry, injured: false, hp: 1, armor: 0, shield: 0 })),
});
const defenseParts = () => {
  const cyborgs = fakeCyborgs({
    a: { faction: 5, renown: {}, unit: 21 },
    b: { faction: 5, renown: {}, unit: 22 },
  });
  const owners = new Map([
    [200, { userId: null, factionId: 9 }],
    [301, { userId: "a", factionId: 5 }],
    [302, { userId: "b", factionId: 5 }],
  ]);
  const unitOwner = new Map([
    [21, 301],
    [22, 302],
    [23, 301],
  ]);
  const maps = new Map([
    [1, { unitInfo: (id: number) => (unitOwner.has(id) ? { ownerId: unitOwner.get(id) ?? 0 } : undefined) }],
  ]);
  return {
    cyborgs,
    give: defenseRenown({ maps, owners, cyborgs, rules: () => ({ renown: { defenseRenown: 10 } }) }),
  };
};

describe("방어 명성(D-326 '방어')", () => {
  it("수비 편이 이기면 끝까지 싸운 유닛 주인마다 한 번, 지킨 나라 명성(퇴각한 유닛 주인은 빼고)", () => {
    const { cyborgs, give } = defenseParts();
    const granted = give(
      defenseInit,
      defenseOutcome(2, [
        { unit: 21, side: 2, outcome: "stays" },
        { unit: 23, side: 2, outcome: "stays" },
        { unit: 22, side: 2, outcome: "retreated" },
      ]),
      5,
    );
    expect(granted).toBe(1);
    expect(cyborgs.added).toEqual([["a", 9, 10]]);
  });

  it("공격 편이 이기면 아무도 받지 않는다", () => {
    const { cyborgs, give } = defenseParts();
    expect(give(defenseInit, defenseOutcome(1, [{ unit: 21, side: 2, outcome: "returned" }]), 5)).toBe(0);
    expect(cyborgs.added).toEqual([]);
  });
});

describe("실시간 세계 전투 명령(D-571 답 1969)", () => {
  const START = 1_000_000;
  const battle: RunningBattle = {
    id: 4,
    kind: "normal",
    startedAtMs: START,
    endsAtMs: START + 60_000,
    mapSize: 32,
    sides: [
      { id: 1, faction: 301, defender: false, edge: 3 },
      { id: 2, faction: 9, defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 2, side: 1, retreatHpPct: 0 },
      { id: 11, side: 2, retreatHpPct: 0 },
    ],
    units: [
      { id: 21, side: 1, party: 1 },
      { id: 22, side: 1, party: 1 },
      { id: 31, side: 1, party: 2 },
      { id: 41, side: 2, party: 11 },
    ],
  };
  function world(opts: {
    commander: number;
    rejected?: boolean;
    uncommanded?: number[];
    parties?: { id: number; order?: { legion: boolean } }[];
  }) {
    const owner = new Map([
      [21, 301],
      [22, 301],
      [31, 302],
      [41, 9],
    ]);
    const added: BattleInput[] = [];
    const probed: BattleInput[] = [];
    const w: BattleOrderWorld = {
      battles: {
        running: async () => [battle],
        probe: async (_id, input) => {
          probed.push(input);
          return {
            state: {
              sides: [{ id: 1, commander: opts.commander, uncommanded: opts.uncommanded ?? [] }],
              parties: opts.parties ?? [],
            },
            rejected: opts.rejected === true,
          };
        },
        addInput: async (_id, input) => {
          added.push(input);
        },
        get: async () => ({ endsAtMs: START + 50_000 }),
      },
      maps: new Map([
        [1, { unitInfo: (id: number) => (owner.has(id) ? { ownerId: owner.get(id) ?? 0 } : undefined) }],
      ]),
      owners: new Map([
        [301, { userId: "me" }],
        [302, { userId: "other" }],
        [9, { userId: null }],
      ]),
      hasCyborg: (userId) => userId !== "ghost",
    };
    return { w, added, probed };
  }
  const now = START + 10 * tickMs + 50;

  it("목록: 내 편 파티(모두 내 유닛인 파티만 mine)·지휘관인지·적 유닛", async () => {
    const { w } = world({ commander: 21 });
    const result = await createBattleOrders(w, () => now).list("me");
    expect(result).toEqual({
      ok: true,
      battles: [
        {
          battle: 4,
          kind: "normal",
          startedAtMs: START,
          endsAtMs: START + 60_000,
          side: 1,
          mapSize: 32,
          commander: true,
          parties: [
            { id: 1, units: [21, 22], mine: true, squad: true, owned: false },
            { id: 2, units: [31], mine: false, squad: true, owned: false },
          ],
          enemies: [41],
        },
      ],
    });
    expect(await createBattleOrders(w, () => now).list("stranger")).toEqual({ ok: true, battles: [] });
    expect(await createBattleOrders(w, () => now).list("ghost")).toEqual({ ok: false, code: "no_cyborg" });
  });

  it("파티 명령: 다음 틱 경계(지금 틱 + 1)에 입력으로 넣는다. 남의 파티는 not_your_party", async () => {
    const { w, added } = world({ commander: 31 });
    const orders = createBattleOrders(w, () => now);
    expect(
      await orders.order("me", { battle: 4, party: 1, order: { kind: "tactic", tactic: "flank" } }),
    ).toEqual({
      ok: true,
      battle: 4,
      tick: 11,
      endsAtMs: START + 50_000,
    });
    expect(added).toEqual([
      { tick: 11, kind: "order", party: 1, order: { kind: "tactic", tactic: "flank" } },
    ]);
    expect(await orders.order("me", { battle: 4, party: 2, order: { kind: "hold" } })).toEqual({
      ok: false,
      code: "not_your_party",
    });
    expect(await orders.order("me", { battle: 99, party: 1, order: { kind: "hold" } })).toEqual({
      ok: false,
      code: "unknown_battle",
    });
    expect(await orders.order("stranger", { battle: 4, party: null, order: { kind: "hold" } })).toEqual({
      ok: false,
      code: "not_participant",
    });
  });

  it("군단 명령: 그 틱을 돈 뒤 지휘관이 내 유닛이어야 한다. 판정이 거절하면 넣지 않는다", async () => {
    const notMine = world({ commander: 31 });
    expect(
      await createBattleOrders(notMine.w, () => now).order("me", {
        battle: 4,
        party: null,
        order: { kind: "free" },
      }),
    ).toEqual({ ok: false, code: "not_commander" });
    expect(notMine.added).toEqual([]);
    const mine = world({ commander: 22 });
    expect(
      await createBattleOrders(mine.w, () => now).order("me", {
        battle: 4,
        party: null,
        order: { kind: "rally", cell: 70 },
      }),
    ).toMatchObject({ ok: true, tick: 11 });
    expect(mine.added).toEqual([{ tick: 11, kind: "legion", side: 1, order: { kind: "rally", cell: 70 } }]);
    const refused = world({ commander: 22, rejected: true });
    expect(
      await createBattleOrders(refused.w, () => now).order("me", {
        battle: 4,
        party: 1,
        order: { kind: "hold" },
      }),
    ).toEqual({ ok: false, code: "rejected" });
    expect(refused.added).toEqual([]);
  });

  it("군단장 분대 명령(D-574 2순위 — 질문 2265 나): 남의 분대 하나에 군단 입력(party), 지휘관이 아니면 not_commander, 판정 거절은 rejected", async () => {
    const mine = world({ commander: 21 });
    expect(
      await createBattleOrders(mine.w, () => now).order("me", {
        battle: 4,
        party: 2,
        legion: true,
        order: { kind: "hold" },
      }),
    ).toMatchObject({ ok: true, tick: 11 });
    expect(mine.added).toEqual([{ tick: 11, kind: "legion", side: 1, party: 2, order: { kind: "hold" } }]);
    const notMine = world({ commander: 31 });
    expect(
      await createBattleOrders(notMine.w, () => now).order("me", {
        battle: 4,
        party: 2,
        legion: true,
        order: { kind: "hold" },
      }),
    ).toEqual({ ok: false, code: "not_commander" });
    // 다른 편 분대는 고를 수 없다
    expect(
      await createBattleOrders(mine.w, () => now).order("me", {
        battle: 4,
        party: 11,
        legion: true,
        order: { kind: "hold" },
      }),
    ).toEqual({ ok: false, code: "not_your_party" });
    // 소유주 명령이 서 있는 분대 = 판정 거절(2순위)
    const owned = world({ commander: 21, rejected: true, parties: [{ id: 2, order: { legion: false } }] });
    expect(
      await createBattleOrders(owned.w, () => now).order("me", {
        battle: 4,
        party: 2,
        legion: true,
        order: { kind: "hold" },
      }),
    ).toEqual({ ok: false, code: "rejected" });
    expect(owned.added).toEqual([]);
    // 목록: 정원 밖 분대는 squad false, 소유주 명령이 서 있으면 owned
    const list = await createBattleOrders(
      world({ commander: 21, uncommanded: [2], parties: [{ id: 1, order: { legion: false } }] }).w,
      () => now,
    ).list("me");
    expect(list.ok && list.battles[0]?.parties).toEqual([
      { id: 1, units: [21, 22], mine: true, squad: true, owned: true },
      { id: 2, units: [31], mine: false, squad: false, owned: false },
    ]);
  });

  it("끝난 전투(끝 시각이 지남)는 unknown_battle", async () => {
    const { w } = world({ commander: 21 });
    expect(
      await createBattleOrders(w, () => START + 70_000).order("me", {
        battle: 4,
        party: 1,
        order: { kind: "hold" },
      }),
    ).toEqual({ ok: false, code: "unknown_battle" });
  });

  it("프로토콜 명령 → 판정 명령(칸·목표·따라갈 파티·대형·전개 방식 그대로)", () => {
    expect(orderInputOf({ kind: "advance" })).toEqual({ kind: "advance" });
    expect(orderInputOf({ kind: "advance", cell: 5 })).toEqual({ kind: "advance", cell: 5 });
    expect(orderInputOf({ kind: "attack", target: 41 })).toEqual({ kind: "attack", target: 41 });
    expect(orderInputOf({ kind: "follow", party: 2 })).toEqual({ kind: "follow", party: 2 });
    expect(orderInputOf({ kind: "formation", shape: "custom" })).toEqual({
      kind: "formation",
      shape: "custom",
    });
    expect(orderInputOf({ kind: "retreat" })).toEqual({ kind: "retreat" });
  });
});
