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
  recipes: [
    ...TEST_CATALOG.recipes,
    {
      id: "cut_logs",
      facility: "lumber_camp",
      inputs: [],
      outputs: [{ item: "pine_log", qty: 10n }],
      work: 1000,
      enabled: true,
    },
  ],
  facilities: [
    ...TEST_CATALOG.facilities.map((facility) => ({ ...facility, build: wood(8) })),
    { id: "lodging", stage: "living", slotsPerLevel: 0, build: wood(10) },
  ],
};

/** 레벨 2도 통나무(레벨 올리기를 볼 수 있게 — 팩은 판자·벽돌) */
const LEVELLED: EconomyCatalog = {
  ...CATALOG,
  facilities: CATALOG.facilities.map((facility) =>
    facility.build ? { ...facility, maxLevel: 3, build: wood(4) } : facility,
  ),
};

/** 도시마다 통나무 넉넉히 + 통나무 벌목(세계가 통나무를 낸다 — 모자라면 거래로 산다) */
const SCENARIO = parseScenario({
  ...TEST_ECONOMY_SCENARIO_RAW,
  factions: TEST_ECONOMY_SCENARIO_RAW.factions.map((group) => ({
    ...group,
    cityPlan: [...group.cityPlan, { facility: "lumber_camp", recipe: "cut_logs", level: 1, workers: 1 }],
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
    // 도시 수가 그대로여야 셈이 맞다 — 알박기(빈틈 2243)로 새 도시가 서지 않게 끄고, 마을 세우기 점수도 낮춘다(SIM 140부터 앞선 연구가
    // 도전 굴림에 걸려 붐빈 세력이 마을을 고를 수 있다)
    const summary = run(
      20,
      new Map([
        ["npc_build_max_buildings", 5],
        ["npc_claim_max_active", 0],
        ["npc_found_score", 0],
      ]),
    );
    // 처음 시설: 농업 도시 4·공업 도시 5 → 더 지을 수 있는 수 = 4 × 1 + 4 × 0 = 4
    expect(summary.npc.builds).toBeLessThanOrEqual(4);
    expect(summary.npc.builds).toBeGreaterThan(0);
  });

  it("상한에 닿으면 레벨을 올리고(1146 나), 지은 숙소 침대가 인구 상한에 더해진다(1131 나)", () => {
    const tuning = new Map([
      ["npc_build_max_buildings", 6],
      ...[1, 2, 3, 4, 5, 6].map((grade): [string, number] => [`npc_build_cap_l${grade}`, 6]),
    ]);
    const summary = runSimulation({ scenario: SCENARIO, catalog: LEVELLED, seed: 3, days: 20, tuning });
    expect(summary.npc.upgrades).toBeGreaterThan(0);
    expect(summary.npc.repairs).toBe(0);
    const cities = summary.npc.cities ?? [];
    expect(cities.reduce((sum, grade) => sum + grade.cities, 0)).toBeGreaterThan(0);
    // 레벨 합이 건물 수보다 크다(올린 시설이 있다), 상한(6)을 넘지 않는다
    for (const grade of cities) expect(grade.buildings).toBeLessThanOrEqual(6 * grade.cities);
    expect(cities.reduce((sum, grade) => sum + grade.levels - grade.buildings, 0)).toBeGreaterThan(0);
    expect(summary.invariants).toMatchObject({ violations: 0, first: [] });
  });
});
