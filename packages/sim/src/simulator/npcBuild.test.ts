// NPC 도시 증축 실행 시험 — 질문 1101 나(D-534), simulator/npcBuild.ts: 재료를 도시 창고에서 빼고, 시간이 지나 다음 판단에 생산에 넣는다
import { describe, expect, it } from "vitest";
import type { EconomyCatalog } from "./catalog.ts";
import { runSimulation } from "./run.ts";
import { parseScenario } from "./scenario.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO_RAW } from "./testEconomy.ts";

const wood = (qty: number) => ({
  mulPm: 1000,
  levels: [{ from: 1, materials: [{ item: "pine_log", qty }] }],
});

/** 시험 목록 + 짓기 재료(통나무) + 숙소 */
const CATALOG: EconomyCatalog = {
  ...TEST_CATALOG,
  items: [
    ...TEST_CATALOG.items,
    { id: "pine_log", tier: 0, category: "raw", startPrice: 1n, weight: 2000, enabled: true },
  ],
  facilities: [
    ...TEST_CATALOG.facilities.map((facility) => ({ ...facility, build: wood(8) })),
    { id: "lodging", stage: "living", slotsPerLevel: 0, build: wood(10) },
  ],
};

/** 도시마다 통나무 넉넉히(재료를 사지 않고 바로 짓는다) */
const SCENARIO = parseScenario({
  ...TEST_ECONOMY_SCENARIO_RAW,
  factions: TEST_ECONOMY_SCENARIO_RAW.factions.map((group) => ({
    ...group,
    stock: [...group.stock, { item: "pine_log", qty: "400" }],
  })),
});

const run = (days: number, tuning?: ReadonlyMap<string, number>) =>
  runSimulation({ scenario: SCENARIO, catalog: CATALOG, seed: 3, days, tuning });

describe("NPC 도시 증축(질문 1101 나)", () => {
  it("재료가 있는 도시는 숙소·생산 시설을 짓고 다음 판단에 생산에 넣는다. 원장 불변 조건 위반이 없다", () => {
    const summary = run(10);
    expect(summary.npc.builds).toBeGreaterThan(8);
    expect(summary.npc.buildsDone).toBeGreaterThan(0);
    expect(summary.npc.buildsDone).toBeLessThanOrEqual(summary.npc.builds);
    expect(summary.invariants).toMatchObject({ violations: 0, first: [] });
  });

  it("같은 시드는 같은 결과다", () => {
    expect(JSON.stringify(run(4))).toBe(JSON.stringify(run(4)));
  });

  it("설정 칸 npc_build_max_buildings = 0이면 짓지 않는다", () => {
    const summary = run(4, new Map([["npc_build_max_buildings", 0]]));
    expect(summary.npc.builds).toBe(0);
  });

  it("도시 건물 수 상한까지만 짓는다(도시 8곳 × 상한 − 처음 시설)", () => {
    const summary = run(20, new Map([["npc_build_max_buildings", 5]]));
    // 처음 시설: 농업 도시 3·공업 도시 4 → 더 지을 수 있는 수 = 4 × 2 + 4 × 1 = 12
    expect(summary.npc.builds).toBeLessThanOrEqual(12);
    expect(summary.npc.builds).toBeGreaterThan(0);
  });
});
