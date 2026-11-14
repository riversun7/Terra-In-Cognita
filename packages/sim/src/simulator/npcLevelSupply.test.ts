// 레벨 재료 가공 시설 시험 — 질문 1186 나(기획 D-540), simulator/npcBuild.ts levelSupplyFacilities·withLevelSupply: 상한에 닿기 전 나라 목표에
// 레벨 2 짓기 재료(판자·벽돌)를 내는 시설(제재소·가마)을 더하고, 지은 가마가 일꾼을 받아 벽돌을 내며 상한 뒤 레벨 올리기에 쓰인다
import { describe, expect, it } from "vitest";
import { type EconomyCatalog, prepareCatalog } from "./catalog.ts";
import { levelSupplyFacilities, withLevelSupply } from "./npcBuild.ts";
import { runSimulation } from "./run.ts";
import { parseScenario } from "./scenario.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO_RAW } from "./testEconomy.ts";

/** 레벨 1 = 통나무, 레벨 2 = 판자·벽돌(팩과 같은 꼴) */
const tiered = (log: number) => ({
  mulPm: 1000,
  levels: [
    { from: 1, materials: [{ item: "pine_log", qty: log }] },
    {
      from: 2,
      materials: [
        { item: "plank", qty: 2 },
        { item: "brick", qty: 2 },
      ],
    },
  ],
});

/** 시험 목록 + 통나무·잡석·판자·벽돌 + 벌목·잡석 캐기·제재소·가마 */
const CATALOG: EconomyCatalog = {
  ...TEST_CATALOG,
  items: [
    ...TEST_CATALOG.items,
    { id: "pine_log", tier: 0, category: "raw", startPrice: 1n, weight: 2000, enabled: true },
    { id: "rubble", tier: 0, category: "raw", startPrice: 1n, weight: 1000, enabled: true },
    { id: "plank", tier: 0, category: "processed", startPrice: 3n, weight: 1000, enabled: true },
    { id: "brick", tier: 0, category: "construction", startPrice: 3n, weight: 1500, enabled: true },
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
    {
      id: "dig_rubble",
      facility: "quarry",
      inputs: [],
      outputs: [{ item: "rubble", qty: 10n }],
      work: 1000,
      enabled: true,
    },
    {
      id: "saw_planks",
      facility: "sawmill",
      inputs: [{ item: "pine_log", qty: 3n }],
      outputs: [{ item: "plank", qty: 2n }],
      work: 500,
      enabled: true,
    },
    {
      id: "fire_bricks",
      facility: "kiln",
      inputs: [{ item: "rubble", qty: 3n }],
      outputs: [{ item: "brick", qty: 2n }],
      work: 500,
      enabled: true,
    },
  ],
  facilities: [
    ...TEST_CATALOG.facilities.map((facility) => ({ ...facility, maxLevel: 3, build: tiered(6) })),
    { id: "quarry", stage: "process", slotsPerLevel: 10 },
    { id: "sawmill", stage: "process", slotsPerLevel: 10, build: tiered(8) },
    { id: "kiln", stage: "process", slotsPerLevel: 10, build: tiered(8) },
  ],
};

/** 도시마다 통나무 넉넉히 + 벌목·잡석 캐기(세계가 입력을 낸다) */
const SCENARIO = parseScenario({
  ...TEST_ECONOMY_SCENARIO_RAW,
  factions: TEST_ECONOMY_SCENARIO_RAW.factions.map((group) => ({
    ...group,
    cityPlan: [
      ...group.cityPlan,
      { facility: "lumber_camp", recipe: "cut_logs", level: 1, workers: 1 },
      { facility: "quarry", recipe: "dig_rubble", level: 1, workers: 1 },
    ],
    stock: [...group.stock, { item: "pine_log", qty: "600" }],
  })),
});

/** 건물 수 상한(등급 표를 모두 같은 값으로) */
const cap = (n: number) =>
  new Map([
    ["npc_build_max_buildings", n],
    ...[1, 2, 3, 4, 5, 6].map((grade): [string, number] => [`npc_build_cap_l${grade}`, n]),
  ]);

const run = (tuning: ReadonlyMap<string, number>) =>
  runSimulation({ scenario: SCENARIO, catalog: CATALOG, seed: 5, days: 20, tuning });

describe("레벨 재료 가공 시설(질문 1186 나)", () => {
  it("레벨 2 재료를 첫 레시피로 내는 짓는 시설만 고른다(채집·짓기 재료 없는 시설 빼고)", () => {
    const supply = levelSupplyFacilities(prepareCatalog(CATALOG));
    expect([...supply.keys()]).toEqual(["sawmill", "kiln"]);
    expect(supply.get("kiln")?.id).toBe("fire_bricks");
  });

  it("목표는 적어도 supply, 입력을 구할 길이 없는 시설은 더하지 않는다. 0이면 나라 목표 그대로", () => {
    const supply = levelSupplyFacilities(prepareCatalog(CATALOG));
    const nation = new Map([
      ["farm", 2],
      ["sawmill", 2],
    ]);
    expect(withLevelSupply(nation, 1, supply, () => true)).toEqual(
      new Map([
        ["farm", 2],
        ["sawmill", 2],
        ["kiln", 1],
      ]),
    );
    expect(withLevelSupply(undefined, 1, supply, (asset) => asset !== "item:rubble")).toEqual(
      new Map([["sawmill", 1]]),
    );
    expect(withLevelSupply(nation, 0, supply, () => true)).toBe(nation);
  });

  it("가마·제재소를 지어 일꾼을 받고 판자·벽돌을 내며, 상한 뒤 레벨 올리기에 쓴다. 끄면 레벨 올리기가 없다", () => {
    const on = run(new Map([...cap(9), ["npc_build_level_supply", 1]]));
    const off = run(new Map([...cap(9), ["npc_build_level_supply", 0]]));
    expect(on.invariants).toMatchObject({ violations: 0, first: [] });
    expect(BigInt(on.economy?.produced["item:brick"] ?? "0")).toBeGreaterThan(0n);
    expect(BigInt(on.economy?.produced["item:plank"] ?? "0")).toBeGreaterThan(0n);
    expect(on.npc.upgrades).toBeGreaterThan(0);
    const leveled = (summary: typeof on) => (summary.npc.cities ?? []).reduce((n, g) => n + g.leveled, 0);
    expect(leveled(on)).toBeGreaterThan(0);
    expect(off.economy?.produced["item:brick"]).toBeUndefined();
    expect(off.npc.upgrades).toBe(0);
    expect(leveled(off)).toBe(0);
  });
});
