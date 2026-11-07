// NPC 도시 계획 — 나라 특산이 건물 레시피를 고름(553 나), 처음 창고 = 생필품 몇 시간분 + 특산 고정 양(554 다).
// docs/adr/2026-11-07-play-flow.md "WP10 경제 마무리"
import { describe, expect, it } from "vitest";
import { type EconomyCatalog, prepareCatalog } from "./catalog.ts";
import { cityStartStock, planCityFacilities } from "./cityPlan.ts";
import { TEST_CATALOG } from "./testEconomy.ts";

/** 시험 목록 + 벌목장 둘째 레시피(통나무)·창고(생산 안 함)·묶음 10짜리 원목 */
const CATALOG: EconomyCatalog = {
  ...TEST_CATALOG,
  items: [
    ...TEST_CATALOG.items,
    { id: "log", tier: 0, category: "raw", startPrice: 6n, enabled: true, lotSize: 10n },
  ],
  facilities: [...TEST_CATALOG.facilities, { id: "warehouse", stage: "storage", slotsPerLevel: 0 }],
  recipes: [
    ...TEST_CATALOG.recipes,
    {
      id: "cut_logs",
      facility: "lumber_camp",
      inputs: [],
      outputs: [{ item: "log", qty: 10n }],
      work: 1000,
      enabled: true,
    },
  ],
};
const catalog = prepareCatalog(CATALOG);

describe("도시 시설(553 나)", () => {
  it("건물은 그 시설의 특산 레시피를 특산 차례로 돌아가며 받고, 특산이 없는 시설은 팩 첫 레시피, 건물이 없는 시설만 특산 직무", () => {
    const jobs = [
      { facility: "lumber_camp", recipe: "cut_logs" },
      { facility: "lumber_camp", recipe: "cut_timber" },
      { facility: "kitchen", recipe: "cook_ration" },
      // 레시피의 시설이 다르면 쓰지 않는다
      { facility: "farm", recipe: "cut_timber" },
    ];
    const plan = planCityFacilities(
      [
        { buildingId: 30, facility: "lumber_camp", level: 1 },
        { buildingId: 10, facility: "lumber_camp", level: 2 },
        { buildingId: 20, facility: "mine", level: 1 },
        { buildingId: 40, facility: "warehouse", level: 1 },
        { buildingId: 50, facility: "lumber_camp", level: 1 },
      ],
      jobs,
      catalog,
    );
    expect(plan).toEqual([
      // 같은 시설 건물은 건물 ID 차례로 특산 차례를 돌아가며(통나무 → 원목 → 통나무)
      { buildingId: 10, jobIndex: null, facility: "lumber_camp", recipe: "cut_logs", level: 2, slots: 20 },
      { buildingId: 20, jobIndex: null, facility: "mine", recipe: "mine_iron_ore", level: 1, slots: 10 },
      { buildingId: 30, jobIndex: null, facility: "lumber_camp", recipe: "cut_timber", level: 1, slots: 10 },
      { buildingId: 50, jobIndex: null, facility: "lumber_camp", recipe: "cut_logs", level: 1, slots: 10 },
      // 벌목장 건물이 있어 벌목장 특산 직무는 휴먼이 돌리지 않고, 주방은 건물이 없어 휴먼이 Lv1로
      { buildingId: null, jobIndex: 2, facility: "kitchen", recipe: "cook_ration", level: 1, slots: 10 },
    ]);
  });

  it("특산이 없으면(기본 직무도 없음) 건물만 팩 첫 레시피로 돌린다", () => {
    expect(planCityFacilities([{ buildingId: 1, facility: "lumber_camp", level: 1 }], [], catalog)).toEqual([
      { buildingId: 1, jobIndex: null, facility: "lumber_camp", recipe: "cut_timber", level: 1, slots: 10 },
    ]);
  });
});

describe("처음 창고(554 다)", () => {
  it("생필품은 휴먼 수 × 몇 시간분, 특산 물건은 고정 양(묶음 단위), 휴먼 0은 한 명으로", () => {
    const stock = cityStartStock(catalog, 10, 24, [
      { item: "log", qty: 3 },
      { item: "iron_ingot", qty: 5 },
      { item: "unknown", qty: 9 },
      { item: "ration", qty: 2 },
    ]);
    expect(Object.fromEntries(stock)).toEqual({
      // 배급 식량: 10명 × 1 × 24시간 ÷ 1 + 특산 2, 생활용품: 10명 × 1 × 24 ÷ 24
      "item:ration": 242n,
      "item:household_goods": 10n,
      "item:log": 30n,
      "item:iron_ingot": 5n,
    });
    expect(Object.fromEntries(cityStartStock(catalog, 0))).toEqual({
      "item:ration": 48n,
      "item:household_goods": 2n,
    });
    expect(cityStartStock(catalog, 5, 0).size).toBe(0);
  });
});
