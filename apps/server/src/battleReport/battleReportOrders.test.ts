// 전투 보고서 파티·군단 명령(D-549)·공격 변(1465)·군단 전체 한 판(1469) 시험
import { type LabParty, type LabUnit, newLabUnit } from "@terra/shared/battleLab";
import {
  type ReportOrder,
  type ReportSetup,
  REPORT_LEGION_ORDER,
  reportProblem,
  reportRunEdge,
} from "@terra/shared/battleReport";
import { TEST_COMBAT_CATALOG, TEST_COMBAT_COEFFICIENTS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { arenaJobInit, arenaUnitId, flatArena, runArenaBattle } from "../battleLab/arena.ts";
import { type LabRules, buildLabUnit } from "../battleLab/build.ts";
import { runReport } from "./batch.ts";
import { legionInputs } from "./orderInputs.ts";
import { playSetupOf } from "./setup.ts";

const rules: LabRules = {
  catalog: TEST_COMBAT_CATALOG,
  coefficients: TEST_COMBAT_COEFFICIENTS,
  growthPm: 100,
  maxLevel: 50,
};
const fighter = (level: number): LabUnit => ({
  ...newLabUnit("human"),
  level,
  weapon: { kind: "item", id: "test_sword", pm: 500 },
});
const party = (...units: LabUnit[]): LabParty => ({ units, retreatHpPct: 0 });
const ctx = { rules, society: TEST_SOCIETY_COEFFICIENTS, arenaMap: flatArena() };
const clock = (): number => 0;
const base = { variant: null, runs: 2, seed: 1 } as const;

const arenaWithOrders = (): ReportSetup => ({
  mode: "arena",
  a: {
    parties: [party(fighter(10), fighter(10)), party(fighter(10))],
    retreatAtSec: 0,
    orders: [
      { atSec: 0, party: 0, kind: "hold" },
      { atSec: 2, party: REPORT_LEGION_ORDER, kind: "advance" },
      { atSec: 3, party: 1, kind: "attack", target: { party: 0, index: 1 } },
    ],
  },
  b: { parties: [party(fighter(10), fighter(10))], retreatAtSec: 0 },
  terrain: "flat",
  limitSec: 60,
});

describe("파티·군단 명령(D-549)", () => {
  it("보고서 명령 → 판정 입력: 파티 명령은 판정 파티 ID, 군단 명령은 편, 목표는 상대 유닛 ID(편 바꾼 판은 편만 바뀐다)", async () => {
    const setup = arenaWithOrders();
    expect(reportProblem({ ...base, setup })).toBeNull();
    const { play } = await playSetupOf(setup, ctx);
    expect(play.inputs).toEqual([
      { tick: 0, kind: "order", party: 1, order: { kind: "hold" } },
      { tick: 20, kind: "legion", side: 1, order: { kind: "advance" } },
      { tick: 30, kind: "order", party: 3, order: { kind: "attack", target: arenaUnitId("b", 0, 1) } },
    ]);
    expect(play.swappedInputs?.[1]).toEqual({
      tick: 20,
      kind: "legion",
      side: 2,
      order: { kind: "advance" },
    });
    const [first] = runReport({ setups: [play], runs: 4, seed: 7 }, clock);
    const [again] = runReport({ setups: [play], runs: 4, seed: 7 }, clock);
    expect(first?.orders?.given).toBe(12);
    expect(again).toEqual(first);
  });

  it("명령 검사: 파티 번호·목표 자리·목표가 없는 목표 공격·상대가 실험실 군단이 아닌 목표 공격·명령 수", () => {
    const setup = arenaWithOrders();
    if (setup.mode !== "arena") throw new Error("arena");
    const withOrders = (orders: ReportOrder[]) => ({
      ...setup,
      a: { parties: [party(fighter(1)), party(fighter(1))], retreatAtSec: 0, orders },
    });
    const bad = (orders: Parameters<typeof withOrders>[0]) =>
      reportProblem({ ...base, setup: withOrders(orders) });
    expect(bad([{ atSec: 0, party: 2, kind: "hold" }])).toBe("invalid_settings");
    expect(bad([{ atSec: 0, party: 0, kind: "attack", target: { party: 0, index: 2 } }])).toBe(
      "invalid_settings",
    );
    expect(bad([{ atSec: 0, party: 0, kind: "attack" }])).toBe("invalid_settings");
    expect(bad([{ atSec: 61, party: 0, kind: "hold" }])).toBe("invalid_settings");
    expect(bad([{ atSec: 0, party: 0, kind: "hold", target: { party: 0, index: 0 } }])).toBe(
      "invalid_settings",
    );
    expect(bad(Array.from({ length: 41 }, () => ({ atSec: 0, party: 0, kind: "hold" as const })))).toBe(
      "invalid_settings",
    );
    // 웨이브 팀 수비의 상대는 크리쳐라 목표 공격을 넣을 수 없다
    const wave: ReportSetup = {
      mode: "wave",
      strength: 2,
      physical: 1,
      creatureTech: 1,
      defenders: 2,
      defenderTech: 1,
      city: { layout: "open", housing: 0, adminLevel: 1 },
      nexusDurability: 100,
      limitSec: 300,
      defense: "party",
      b: {
        parties: [party(fighter(1))],
        retreatAtSec: 0,
        orders: [{ atSec: 0, party: 0, kind: "attack", target: { party: 0, index: 0 } }],
      },
    };
    expect(reportProblem({ ...base, setup: wave })).toBe("invalid_settings");
  });

  it("상대가 실험실 군단이 아니면 목표를 풀 수 없어 목표 공격을 넣지 않는다", () => {
    const inputs = legionInputs(
      {
        parties: [party(fighter(1))],
        retreatAtSec: 5,
        orders: [{ atSec: 1, party: 0, kind: "attack", target: { party: 0, index: 0 } }],
      },
      { partyId: (p) => 101 + p, side: 2 },
      100,
    );
    // 옛 군단 퇴각 시각은 군단 퇴각 명령 하나
    expect(inputs).toEqual([{ tick: 50, kind: "legion", side: 2, order: { kind: "retreat" } }]);
  });
});

describe("공격 변(1465 — 판마다 설정, 여러 판이면 판 시드로 무작위)", () => {
  const siege = (edge: 0 | 1 | 2 | 3 | "random"): ReportSetup => ({
    mode: "siege",
    a: { parties: [party(fighter(20), fighter(20))], retreatAtSec: 0 },
    b: { parties: [party(fighter(5))], retreatAtSec: 0 },
    city: { layout: "open", housing: 0, adminLevel: 1 },
    nexusDurability: 300,
    limitSec: 60,
    edge,
  });

  it("고른 변이면 그 변에서 들어오고, random이면 네 변 재료를 두고 판 시드로 고른다(같은 시드 = 같은 변)", async () => {
    const north = await playSetupOf(siege(0), ctx);
    expect(north.play.edges).toBeUndefined();
    expect(north.play.normal.sides.find((side) => side.id === 1)?.edge).toBe(0);
    const random = await playSetupOf(siege("random"), ctx);
    expect(random.play.edges?.map((init) => init.sides.find((side) => side.id === 1)?.edge)).toEqual([
      0, 1, 2, 3,
    ]);
    const [result] = runReport({ setups: [random.play], runs: 6, seed: 3 }, clock);
    expect(result?.edges?.reduce((sum, n) => sum + n, 0)).toBe(6);
    expect([0, 1, 2, 3].map((edge) => reportRunEdge(edge * 7919))).toEqual(
      [0, 1, 2, 3].map((edge) => reportRunEdge(edge * 7919)),
    );
    expect(runReport({ setups: [random.play], runs: 6, seed: 3 }, clock)[0]).toEqual(result);
    expect(reportProblem({ ...base, setup: siege("random") })).toBeNull();
  }, 60_000);

  it("판 시드 → 변은 네 변에 고루 퍼진다", () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 0; seed < 4000; seed++)
      counts[reportRunEdge(seed)] = (counts[reportRunEdge(seed)] ?? 0) + 1;
    for (const count of counts) expect(count).toBeGreaterThan(800);
  });
});

describe("군단 전체 한 판(1469)", () => {
  it("실험실 일에 군단이 있으면 모든 파티와 명령으로 돈다", () => {
    const spec = (level: number) => ({
      spec: buildLabUnit(fighter(level), rules).spec,
      row: "front" as const,
    });
    const partyOf = (...levels: number[]) => ({ units: levels.map(spec), retreatHpPct: 0 });
    const job = {
      a: partyOf(10),
      b: partyOf(10),
      map: flatArena(),
      coefficients: TEST_COMBAT_COEFFICIENTS,
      limitMs: 60_000,
      seed: 4,
      legion: {
        a: [partyOf(10, 10), partyOf(10)],
        b: [partyOf(10), partyOf(10, 10)],
        inputs: [{ tick: 0, kind: "legion" as const, side: 1, order: { kind: "hold" as const } }],
      },
    };
    const init = arenaJobInit(job, 4, false);
    expect(init.units).toHaveLength(6);
    expect(init.parties.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    const result = runArenaBattle(job);
    expect(result.units).toHaveLength(6);
    expect(runArenaBattle(job)).toEqual(result);
  });

  it("팀 A 17번 파티부터는 유닛 ID가 팀 B와 겹치지 않는다(20파티)", () => {
    const ids = new Set<number>();
    for (const team of ["a", "b"] as const)
      for (let p = 0; p < 20; p++) for (let i = 0; i < 6; i++) ids.add(arenaUnitId(team, p, i));
    expect(ids.size).toBe(240);
  });
});
