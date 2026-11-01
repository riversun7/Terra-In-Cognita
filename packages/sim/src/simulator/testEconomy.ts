// 시험 도우미: 경제 시나리오용 작은 목록과 시나리오(콘텐츠 팩 임시 데이터와 같은 모양, 팩 파일을 읽지 않는다)
import type { EconomyCatalog } from "./catalog.ts";
import { type Scenario, parseScenario } from "./scenario.ts";

const st = (item: string, qty: number) => ({ item, qty: BigInt(qty) });

export const TEST_CATALOG: EconomyCatalog = {
  items: [
    { id: "grain", tier: 0, category: "raw", baseValue: 4n, enabled: true },
    { id: "timber", tier: 0, category: "raw", baseValue: 5n, enabled: true },
    { id: "iron_ore", tier: 1, category: "raw", baseValue: 8n, enabled: true },
    { id: "iron_ingot", tier: 1, category: "processed", baseValue: 14n, enabled: true },
    { id: "ration", tier: 0, category: "consumable", baseValue: 4n, enabled: true },
    { id: "household_goods", tier: 1, category: "consumable", baseValue: 40n, enabled: true },
  ],
  facilities: ["farm", "lumber_camp", "mine", "smelter", "kitchen", "workshop"].map((id) => ({
    id,
    stage: "gather",
    slotsPerLevel: 10,
    enabled: true,
  })),
  recipes: [
    { id: "farm_grain", facility: "farm", inputs: [], outputs: [st("grain", 20)], work: 1000, enabled: true },
    {
      id: "cut_timber",
      facility: "lumber_camp",
      inputs: [],
      outputs: [st("timber", 10)],
      work: 1000,
      enabled: true,
    },
    {
      id: "mine_iron_ore",
      facility: "mine",
      inputs: [],
      outputs: [st("iron_ore", 10)],
      work: 1000,
      enabled: true,
    },
    {
      id: "smelt_iron",
      facility: "smelter",
      inputs: [st("iron_ore", 10)],
      outputs: [st("iron_ingot", 7)],
      work: 1000,
      enabled: true,
    },
    {
      id: "cook_ration",
      facility: "kitchen",
      inputs: [st("grain", 20)],
      outputs: [st("ration", 30)],
      work: 1000,
      enabled: true,
    },
    {
      id: "make_household_goods",
      facility: "workshop",
      inputs: [st("iron_ingot", 2), st("timber", 1)],
      outputs: [st("household_goods", 1)],
      work: 500,
      enabled: true,
    },
  ],
  necessities: [
    { id: "food", item: "ration", perUnit: 1n, periodHours: 1, enabled: true },
    { id: "daily_goods", item: "household_goods", perUnit: 1n, periodHours: 24, enabled: true },
  ],
  presets: Array.from({ length: 6 }, (_, index) => ({
    id: `nation_${index + 1}`,
    currency: `cur_${index + 1}`,
    tradeTaxBp: 200,
    enabled: true,
  })),
};

/** 농업 나라 둘 + 공업 나라 둘(서로 모자란 것을 사야 하는 세계) */
export const TEST_ECONOMY_SCENARIO: Scenario = parseScenario({
  id: "test_economy",
  factions: [
    {
      code: "agri",
      count: 2,
      fixed: true,
      cities: 2,
      workers: 20,
      credit: "0",
      tech: 2,
      cityPlan: [
        { facility: "farm", recipe: "farm_grain", level: 1, workers: 2 },
        { facility: "kitchen", recipe: "cook_ration", level: 1, workers: 1 },
        { facility: "lumber_camp", recipe: "cut_timber", level: 1, workers: 1 },
      ],
      stock: [
        { item: "ration", qty: "200" },
        { item: "household_goods", qty: "20" },
      ],
    },
    {
      code: "ind",
      count: 2,
      fixed: true,
      cities: 2,
      workers: 20,
      credit: "0",
      tech: 2,
      cityPlan: [
        { facility: "mine", recipe: "mine_iron_ore", level: 1, workers: 2 },
        { facility: "smelter", recipe: "smelt_iron", level: 1, workers: 1 },
        { facility: "workshop", recipe: "make_household_goods", level: 1, workers: 1 },
        { facility: "lumber_camp", recipe: "cut_timber", level: 1, workers: 1 },
      ],
      stock: [
        { item: "ration", qty: "200" },
        { item: "household_goods", qty: "20" },
      ],
    },
  ],
  npc: { decideEveryMs: 6 * 3_600_000 },
  economy: {
    tradeEveryMs: 3 * 3_600_000,
    fxEveryMs: 3_600_000,
    shipMs: 2 * 3_600_000,
    orderLifeMs: 7 * 24 * 3_600_000,
    perCapitaDaily: "200",
    baseReserveBp: 2500,
    fxLot: "100",
  },
});
