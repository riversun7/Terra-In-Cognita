// NPC 건물 채집소 2(기획 D-569 1761·1768) — simulator/npcGatherTier.ts·npcBuild.ts:
// - 기르는 티어는 최고 티어 아래에서 시세로 고른다(시간당 값 = 값 × 수확 배율 ÷ 필요 진행).
// - 짓기 판단이 재료가 있을 때 면적 모듈을 붙인다(레벨 1 짓기 재료·짓는 시간, 자리 = 레벨 × 레벨당 수).
import {
  DEFAULT_BUILDING_GATHER,
  buildingYieldPm,
  chosenGatherTier,
  recommendGatherTier,
} from "@terra/shared/gatherMath";
import { describe, expect, it } from "vitest";
import { chooseCityPlot } from "../npc/build.ts";
import type { CatalogGather, EconomyCatalog } from "./catalog.ts";
import { runSimulation } from "./run.ts";
import { type Scenario, parseScenario } from "./scenario.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO_RAW } from "./testEconomy.ts";

const RANCH: CatalogGather = {
  primary: "wis",
  secondary: "agi",
  subcategory: "livestock_product",
  mode: "select",
  yieldBase: 1,
  yieldPerStatPm: 80,
  yieldCap: 6,
};
const wood = (qty: number) => ({
  mulPm: 1000,
  levels: [{ from: 1, materials: [{ item: "pine_log", qty }] }],
});

/** 목장 사다리 아이템 하나 */
const meat = (id: string, tier: number, startPrice: bigint) => ({
  id,
  tier,
  category: "raw",
  subcategory: "livestock_product",
  startPrice,
  enabled: true,
});

/** 목장 사다리 T0~T2(값은 시험마다) + 통나무(모듈 재료) */
function catalogWith(prices: readonly [bigint, bigint, bigint]): EconomyCatalog {
  return {
    ...TEST_CATALOG,
    items: [
      ...TEST_CATALOG.items,
      meat("raw_meat", 0, prices[0]),
      meat("venison", 1, prices[1]),
      meat("mutton", 2, prices[2]),
      { id: "pine_log", tier: 0, category: "raw", startPrice: 1n, weight: 2000, enabled: true },
    ],
    facilities: [
      ...TEST_CATALOG.facilities.map((facility) => ({ ...facility, build: wood(8) })),
      { id: "ranch", stage: "gather", slotsPerLevel: 10, gather: RANCH, build: wood(8) },
    ],
    recipes: [
      ...TEST_CATALOG.recipes,
      // 통나무 벌목(세계가 통나무를 낸다 — 남는 재고를 팔아도 다시 생긴다, npcBuild.test.ts와 같다)
      {
        id: "cut_logs",
        facility: "lumber_camp",
        inputs: [],
        outputs: [{ item: "pine_log", qty: 10n }],
        work: 1000,
        enabled: true,
      },
      {
        id: "raise_livestock",
        facility: "ranch",
        inputs: [],
        outputs: [{ item: "raw_meat", qty: 10n }],
        work: 1000,
        enabled: true,
      },
    ],
  };
}

/** 농업 나라 도시에 레벨 2 목장(최고 T3 — 사다리 위 끝 T2), 모든 도시에 통나무 벌목 + 통나무 넉넉히 */
const SCENARIO: Scenario = parseScenario({
  ...TEST_ECONOMY_SCENARIO_RAW,
  factions: TEST_ECONOMY_SCENARIO_RAW.factions.map((faction) => ({
    ...faction,
    cityPlan: [
      ...faction.cityPlan,
      { facility: "lumber_camp", recipe: "cut_logs", level: 1, workers: 1 },
      ...(faction.code === "agri"
        ? [{ facility: "ranch", recipe: "raise_livestock", level: 2, workers: 2 }]
        : []),
    ],
    stock: [...faction.stock, { item: "pine_log", qty: "400" }],
  })),
});

const produced = (prices: readonly [bigint, bigint, bigint], tuning?: ReadonlyMap<string, number>) => {
  const summary = runSimulation({
    scenario: SCENARIO,
    catalog: catalogWith(prices),
    seed: 5,
    days: 12,
    tuning,
  });
  const out = summary.economy?.produced ?? {};
  return { summary, qty: (id: string) => BigInt(out[`item:${id}`] ?? "0") };
};

describe("기르는 티어 고르기(D-569 1761)", () => {
  it("고른 티어는 최고 티어로 자르고, 고르지 않으면 최고 티어", () => {
    expect(chosenGatherTier(3, null)).toBe(5);
    expect(chosenGatherTier(3, 2)).toBe(2);
    expect(chosenGatherTier(1, 7)).toBe(1);
    expect(chosenGatherTier(2, -1)).toBe(0);
  });

  it("기술 추천 = 시간당 값(값 × 수확 배율 ÷ 필요 진행)이 가장 큰 티어, 값이 없으면 최고 티어", () => {
    const rules = DEFAULT_BUILDING_GATHER;
    const advice = (values: readonly bigint[], statSum: number) => ({
      maxTier: 3,
      hasTier: (tier: number) => tier < values.length,
      valueOf: (tier: number) => values[tier] ?? 0n,
      progressOf: (tier: number) => 30 + tier * 30,
      yieldPmOf: (tier: number) => buildingYieldPm(statSum, tier, 0, rules),
    });
    // 값이 같으면 필요 진행이 짧은 T0
    expect(recommendGatherTier(advice([5n, 5n, 5n, 5n], 100))).toBe(0);
    // 값이 티어마다 세 배: T3(효율 1000 — 합 100 ≥ 60)
    expect(recommendGatherTier(advice([1n, 3n, 9n, 27n], 100))).toBe(3);
    // 스탯 합 20: T3 효율 바닥 300 → 27 × 300 ÷ 120 = 67.5 > T2 9 × 500 ÷ 90 = 50(효율이 깎여도 값이 크면 위)
    expect(recommendGatherTier(advice([1n, 3n, 9n, 27n], 20))).toBe(3);
    // 위 티어 값이 조금만 크면 효율 깎임에 진다(합 20: T1 3 × 1000 ÷ 60 = 50 > T2 4 × 500 ÷ 90 ≈ 22)
    expect(recommendGatherTier(advice([1n, 3n, 4n, 5n], 20))).toBe(1);
    expect(recommendGatherTier(advice([0n, 0n], 20))).toBe(3);
  });

  it("NPC 목장은 시세로 고른다: 양고기(T2)가 비싸면 양고기를, 셋이 같은 값이면 생고기(T0)를 기른다", () => {
    const dear = produced([1n, 1n, 50n]);
    expect(dear.qty("mutton")).toBeGreaterThan(0n);
    expect(dear.summary.invariants.violations).toBe(0);
    const flat = produced([5n, 5n, 5n]);
    // 첫 판단 전(시나리오 시설은 최고 티어로 시작) 몇 번만 양고기
    expect(flat.qty("raw_meat")).toBeGreaterThan(flat.qty("mutton") * 10n);
  });
});

/** 시험 자리 수: 목장만 레벨당 하나 */
const slots = (facility: string, level: number) => (facility === "ranch" ? level : 0);

describe("NPC 면적 모듈(D-569 1768)", () => {
  it("모듈 후보 = 다 지었고 일꾼이 있는 건물 채집소 가운데 모듈이 적은 차례", () => {
    const pick = chooseCityPlot(
      [
        { key: 1, facility: "farm", level: 3, workers: 2 },
        { key: 2, facility: "ranch", level: 2, workers: 2, plots: 1 },
        { key: 3, facility: "ranch", level: 1, workers: 0 },
        { key: 4, facility: "ranch", level: 2, workers: 1 },
      ],
      slots,
    );
    expect(pick?.key).toBe(4);
    expect(chooseCityPlot([{ key: 2, facility: "ranch", level: 1, workers: 1, plots: 1 }], slots)).toBe(
      undefined,
    );
  });

  it("건물 수 상한에 닿은 도시는 재료가 있으면 목장에 모듈을 붙인다", () => {
    const tuning = new Map([
      ["npc_build_max_buildings", 5],
      ...[1, 2, 3, 4, 5, 6].map((grade): [string, number] => [`npc_build_cap_l${grade}`, 1]),
    ]);
    const { summary } = produced([1n, 1n, 1n], tuning);
    expect(summary.npc.plots).toBeGreaterThan(0);
    expect(summary.invariants).toMatchObject({ violations: 0, first: [] });
  });
});
