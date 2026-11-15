// 군단 명령 2단계(D-558) 서버 몫: 보고서 새 명령(집결·따라가기·대형·전개 방식·칸) → 판정 입력, 목록이 판정과 같은지, 실험 유닛 계급 → 정원,
// 지휘 계급 읽기(commandRanks.ts)
import { LAB_TIER_MAX, LAB_TITLE_MAX, newLabUnit } from "@terra/shared/battleLab";
import {
  REPORT_FORMATIONS,
  REPORT_LEGION_ORDER,
  REPORT_TACTICS,
  type ReportLegion,
  reportProblem,
} from "@terra/shared/battleReport";
import {
  COMMAND_TIER_STEPS,
  COMMAND_TITLE_STEPS,
  FORMATION_SHAPES,
  TACTICS,
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type LabRules, buildLabUnit } from "../battleLab/build.ts";
import { createCommandRanks } from "../world/commandRanks.ts";
import { legionInputs } from "./orderInputs.ts";

const rules: LabRules = {
  catalog: TEST_COMBAT_CATALOG,
  coefficients: TEST_COMBAT_COEFFICIENTS,
  growthPm: 100,
  maxLevel: 50,
};
const party = { units: [newLabUnit("human")], retreatHpPct: 0 };
/** 군단 A(분대 둘)에 명령을 넣은 전투장 보고서 입력 */
const setup = (orders: ReportLegion["orders"]) => ({
  variant: null,
  runs: 2,
  seed: 1,
  setup: {
    mode: "arena" as const,
    a: { parties: [party, party], retreatAtSec: 0, orders },
    b: { parties: [party], retreatAtSec: 0 },
    terrain: "flat",
    limitSec: 60,
  },
});

describe("보고서 명령 D-558", () => {
  it("화면 목록(대형·전개 방식·계급 칸 범위)이 판정과 같다", () => {
    expect([...REPORT_FORMATIONS]).toEqual([...FORMATION_SHAPES]);
    expect([...REPORT_TACTICS]).toEqual([...TACTICS]);
    expect(LAB_TITLE_MAX).toBe(COMMAND_TITLE_STEPS - 1);
    expect(LAB_TIER_MAX).toBe(COMMAND_TIER_STEPS - 1);
  });

  it("집결·따라가기·대형·전개 방식·칸 → 판정 입력(칸 = y × 한 변 + x, 따라갈 파티 = 판정 파티 ID)", () => {
    const legion: ReportLegion = {
      parties: [party, party, party],
      retreatAtSec: 0,
      orders: [
        { atSec: 1, party: REPORT_LEGION_ORDER, kind: "formation", shape: "wedge" },
        { atSec: 2, party: 1, kind: "follow", leader: 0 },
        { atSec: 3, party: REPORT_LEGION_ORDER, kind: "rally", cell: { x: 5, y: 7 } },
        { atSec: 4, party: 2, kind: "tactic", tactic: "flank" },
        { atSec: 5, party: 0, kind: "advance", cell: { x: 1, y: 2 } },
        { atSec: 6, party: 0, kind: "rally" },
      ],
    };
    const inputs = legionInputs(legion, { partyId: (p) => 10 + p, side: 1, size: 32 }, 100);
    expect(inputs).toEqual([
      { tick: 10, kind: "legion", side: 1, order: { kind: "formation", shape: "wedge" } },
      { tick: 20, kind: "order", party: 11, order: { kind: "follow", party: 10 } },
      { tick: 30, kind: "legion", side: 1, order: { kind: "rally", cell: 7 * 32 + 5 } },
      { tick: 40, kind: "order", party: 12, order: { kind: "tactic", tactic: "flank" } },
      { tick: 50, kind: "order", party: 10, order: { kind: "advance", cell: 2 * 32 + 1 } },
      { tick: 60, kind: "order", party: 10, order: { kind: "rally" } },
    ]);
    // 한 변을 모르면 칸을 버린다
    expect(legionInputs(legion, { partyId: (p) => p, side: 1 }, 100)[2]).toMatchObject({
      order: { kind: "rally" },
    });
  });

  it("검사: 종류와 칸이 맞아야 한다(따라가기는 같은 군단의 다른 파티, 칸은 전진·집결만)", () => {
    expect(reportProblem(setup([{ atSec: 0, party: 0, kind: "follow", leader: 1 }]))).toBeNull();
    expect(reportProblem(setup([{ atSec: 0, party: 0, kind: "follow", leader: 0 }]))).toBe(
      "invalid_settings",
    );
    expect(reportProblem(setup([{ atSec: 0, party: 0, kind: "follow", leader: 5 }]))).toBe(
      "invalid_settings",
    );
    expect(reportProblem(setup([{ atSec: 0, party: 0, kind: "follow" }]))).toBe("invalid_settings");
    expect(reportProblem(setup([{ atSec: 0, party: 0, kind: "hold", cell: { x: 1, y: 1 } }]))).toBe(
      "invalid_settings",
    );
    expect(reportProblem(setup([{ atSec: 0, party: -1, kind: "rally", cell: { x: 1, y: 1 } }]))).toBeNull();
    expect(reportProblem(setup([{ atSec: 0, party: -1, kind: "tactic", tactic: "delay" }]))).toBeNull();
    expect(reportProblem(setup([{ atSec: 0, party: -1, kind: "formation" }]))).toBe("invalid_settings");
  });
});

describe("지휘관 정원(D-558): 실험 유닛 계급·환생", () => {
  it("계급이 없으면 3, 작위·랭킹 등급 가운데 큰 쪽, 환생 +1", () => {
    const cap = (rank?: { title: number; combatTier: number | null }, rebirths = 0) =>
      buildLabUnit({ ...newLabUnit("human"), rebirths, ...(rank ? { rank } : {}) }, rules).spec.commandCap;
    expect(cap()).toBe(3);
    expect(cap(undefined, 2)).toBe(4);
    expect(cap({ title: 4, combatTier: null })).toBe(7);
    expect(cap({ title: 1, combatTier: 0 }, 1)).toBe(10);
    expect(
      buildLabUnit({ ...newLabUnit("human"), rank: { title: 2, combatTier: 3 } }, rules).spec.commandRank,
    ).toEqual({
      title: 2,
      combatTier: 3,
    });
  });
});

describe("지휘 계급 읽기(commandRanks.ts)", () => {
  it("사이보그 본체만, 전투 계열 경로의 가장 위 등급 → 등급 번호, 작위 0. 표가 오래되면 뒤에서 다시 읽는다", async () => {
    const queries: unknown[][] = [];
    let nowMs = 0;
    const ranks = createCommandRanks({
      pool: {
        query: async (_text, values) => {
          queries.push(values ?? []);
          return { rows: [{ user_id: "u1", tier_pm: 50 }] };
        },
      },
      cyborgs: { userOfUnit: (unitId) => (unitId === 7 ? "u1" : unitId === 8 ? "u2" : undefined) },
      paths: ["conqueror", "mercenary"],
      tiersPm: () => [10, 50, 200, 500],
      now: () => nowMs,
    });
    expect(ranks.rankOf(9)).toBeUndefined();
    await ranks.refresh();
    expect(queries[0]).toEqual([["conqueror", "mercenary"]]);
    expect(ranks.rankOf(7)).toEqual({ title: 0, combatTier: 1 });
    expect(ranks.rankOf(8)).toEqual({ title: 0, combatTier: null });
    const before = queries.length;
    nowMs = 11 * 60_000;
    ranks.rankOf(7);
    expect(queries.length).toBe(before + 1);
  });
});
