// NPC 건물 채집소 2(기획 D-569 1761·1768) — simulator/npcGatherTier.ts·npcBuild.ts:
// - 기르는 티어는 최고 티어 아래에서 시세로 고른다(시간당 값 = 값 × 수확 배율 ÷ 필요 진행).
// - 짓기 판단이 재료가 있을 때 면적 모듈을 붙인다(레벨 1 짓기 재료·짓는 시간, 자리 = 레벨 × 레벨당 수).
// 바뀜 (2026-11-16, 기획 답 1862·1864 — D-554·D-212):
// - 티어는 시세 + 세력 성향·지도자 기질 가중으로, 시설마다 고정된 시드 난수가 고른다(temperedGatherTier·tierTemperOf).
// - 모듈 재료가 창고에 없으면 짓기처럼 도시 목표 재고로 산다.
import {
  DEFAULT_BUILDING_GATHER,
  buildingYieldPm,
  chosenGatherTier,
  recommendGatherTier,
} from "@terra/shared/gatherMath";
import { describe, expect, it } from "vitest";
import { chooseCityPlot } from "../npc/build.ts";
import { TEST_NPC_COEFFICIENTS } from "../npc/coefficients.ts";
import type { Traits } from "../npc/traits.ts";
import type { CatalogGather, EconomyCatalog } from "./catalog.ts";
import { leaderTemperOf, temperedGatherTier, tierTemperOf } from "./npcGatherTier.ts";
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

/** 성향 칸을 모두 끄고 바닥 1000 = 옛 판(가장 큰 시간당 값) */
const PLAIN_TIER: readonly [string, number][] = [
  ["npc_gather_tier_commerce", 0],
  ["npc_gather_tier_aggression", 0],
  ["npc_gather_tier_faith", 0],
  ["npc_gather_tier_leader", 0],
  ["npc_gather_tier_floor", 1000],
];

const produced = (
  prices: readonly [bigint, bigint, bigint],
  tuning?: ReadonlyMap<string, number>,
  scenario: Scenario = SCENARIO,
) => {
  const summary = runSimulation({
    scenario,
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

  it("성향 칸을 끄면 옛 판: 양고기(T2)가 비싸면 양고기를, 셋이 같은 값이면 생고기(T0)를 기른다", () => {
    const plain = new Map(PLAIN_TIER);
    const dear = produced([1n, 1n, 50n], plain);
    expect(dear.qty("mutton")).toBeGreaterThan(0n);
    expect(dear.summary.invariants.violations).toBe(0);
    const flat = produced([5n, 5n, 5n], plain);
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

/** 시간당 값 시험 입력(티어 0~3, 필요 진행 30 + 30 × 티어, 수확 배율 1000) */
const flatAdvice = (values: readonly bigint[]) => ({
  maxTier: 3,
  hasTier: (tier: number) => tier < values.length,
  valueOf: (tier: number) => values[tier] ?? 0n,
  progressOf: (tier: number) => 30 + tier * 30,
  yieldPmOf: () => 1000,
});

const traits = (commerce: number, aggression: number, faith: number): Traits => ({
  aggression,
  commerce,
  faith,
  station: 500,
});

/** 도시 1의 주인 세력 7(성향은 시험마다) */
const oneCity = (t: Traits, seed = 11) => ({
  seed,
  cities: new Map([[1, { owner: 7 }]]),
  factions: new Map([[7, { id: 7, traits: t }]]),
});

describe("기르는 티어 성향 가중 고르기(기획 답 1862 — D-554·D-212)", () => {
  it("치우침 0·바닥 1000이면 가장 큰 시간당 값(옛 판)과 같다", () => {
    for (const values of [
      [5n, 5n, 5n, 5n],
      [1n, 3n, 9n, 27n],
      [1n, 3n, 4n, 5n],
    ])
      for (const roll of [0, 1 << 31, 0xffff_ffff])
        expect(temperedGatherTier(flatAdvice(values), { bias: 0, floorPm: 1000, roll })).toBe(
          recommendGatherTier(flatAdvice(values)),
        );
  });

  it("바닥 아래 티어는 고르지 않고, 굴림이 무게 차례로 후보를 가른다(낮은 굴림 = 낮은 티어)", () => {
    // 시간당 값: T0 5/30, T1 5/60(절반), T2 5/90(1/3), T3 5/120(1/4)
    const advice = flatAdvice([5n, 5n, 5n, 5n]);
    const picks = (floorPm: number, bias: number) =>
      [0, 0x4000_0000, 0x8000_0000, 0xc000_0000, 0xffff_ffff].map((roll) =>
        temperedGatherTier(advice, { bias, floorPm, roll }),
      );
    expect(picks(400, 0).every((tier) => tier <= 1)).toBe(true);
    expect(picks(0, 0)).toEqual(picks(0, 0).toSorted((a, b) => a - b));
    expect(picks(0, 0)[0]).toBe(0);
    expect(picks(0, 0).at(-1)).toBe(3);
    // 높은 티어 쪽 치우침이 크면 같은 굴림이 더 높은(같거나) 티어로 간다
    const low = picks(0, -900);
    const high = picks(0, 900);
    for (let i = 0; i < low.length; i++) expect(high[i] ?? 0).toBeGreaterThanOrEqual(low[i] ?? 0);
    expect(high.filter((tier) => tier >= 2).length).toBeGreaterThan(low.filter((tier) => tier >= 2).length);
  });

  it("상업·공격 성향은 높은 티어 쪽, 신앙 성향은 낮은 티어 쪽, 지도자 기질은 세력마다 정해진 값", () => {
    const c = { ...TEST_NPC_COEFFICIENTS, gatherTierLeaderPm: 0 };
    const bias = (t: Traits) => tierTemperOf(oneCity(t), 1, 42, c)?.bias ?? 0;
    expect(bias(traits(500, 500, 500))).toBe(0);
    expect(bias(traits(1000, 500, 500))).toBe(600);
    expect(bias(traits(500, 1000, 500))).toBe(300);
    expect(bias(traits(500, 500, 1000))).toBe(-300);
    expect(bias(traits(1000, 1000, 0))).toBe(900);
    expect(bias(traits(0, 0, 1000))).toBe(-900);
    // 주인이 없으면 옛 판
    expect(tierTemperOf(oneCity(traits(500, 500, 500)), 2, 42, c)).toBeUndefined();
    // 지도자 기질: 폭 안, 같은 (시드, 세력)이면 같은 값, 세력마다 퍼진다
    const spread = { ...TEST_NPC_COEFFICIENTS, gatherTierLeaderPm: 300 };
    const tempers = Array.from({ length: 40 }, (_, id) => leaderTemperOf(11, { id }, spread));
    expect(tempers.every((v) => v >= -300 && v <= 300)).toBe(true);
    expect(new Set(tempers).size).toBeGreaterThan(20);
    expect(leaderTemperOf(11, { id: 3 }, spread)).toBe(tempers[3]);
    expect(leaderTemperOf(11, { id: 3 }, c)).toBe(0);
    // 국가 편집기 성향 칸(D-573 1991): 지도자 기질 칸이 있으면 폭 × 값 ÷ 1000(굴리지 않는다), 폭 0이면 0
    expect(leaderTemperOf(11, { id: 3, leaderPm: 500 }, spread)).toBe(150);
    expect(leaderTemperOf(11, { id: 3, leaderPm: -1000 }, spread)).toBe(-300);
    expect(leaderTemperOf(11, { id: 3, leaderPm: 5000 }, spread)).toBe(300);
    expect(leaderTemperOf(11, { id: 3, leaderPm: 500 }, c)).toBe(0);
    // 굴림은 (시드, 시설)마다 고정
    const a = tierTemperOf(oneCity(traits(500, 500, 500)), 1, 42, spread);
    expect(tierTemperOf(oneCity(traits(500, 500, 500)), 1, 42, spread)).toEqual(a);
    expect(tierTemperOf(oneCity(traits(500, 500, 500)), 1, 43, spread)?.roll).not.toBe(a?.roll);
  });

  it("값이 같은 목장 사다리: 성향 칸이 켜지면 생고기(T0)만이 아니라 사슴 고기(T1)도 기른다, 같은 시드면 같은 결과", () => {
    const tuning = new Map([
      ["npc_gather_tier_commerce", 1000],
      ["npc_gather_tier_leader", 900],
    ]);
    const first = produced([5n, 5n, 5n], tuning);
    expect(first.qty("raw_meat") + first.qty("venison")).toBeGreaterThan(0n);
    expect(first.qty("venison")).toBeGreaterThan(0n);
    expect(first.summary.invariants.violations).toBe(0);
    expect(produced([5n, 5n, 5n], tuning).summary.linesHash).toBe(first.summary.linesHash);
  });
});

/**
 * 통나무를 공업 나라만 내고 갖는다 — 농업 나라 목장 모듈 재료는 사야 한다(1864). 농업 나라 시설은 모두 레벨 상한(2)이라 레벨 올리기 재료로
 * 통나무가 들어오지 않는다(남는 통나무로 붙는 옛 길을 막는다)
 */
const BUY_SCENARIO: Scenario = parseScenario({
  ...TEST_ECONOMY_SCENARIO_RAW,
  factions: TEST_ECONOMY_SCENARIO_RAW.factions.map((faction) => ({
    ...faction,
    cityPlan:
      faction.code === "agri"
        ? [
            ...faction.cityPlan.map((plan) => ({ ...plan, level: 2 })),
            { facility: "ranch", recipe: "raise_livestock", level: 2, workers: 2 },
          ]
        : [...faction.cityPlan, { facility: "lumber_camp", recipe: "cut_logs", level: 1, workers: 1 }],
    stock: faction.code === "agri" ? faction.stock : [...faction.stock, { item: "pine_log", qty: "400" }],
  })),
});

/** 모든 시설 레벨 상한 2 */
function capped(catalog: EconomyCatalog): EconomyCatalog {
  return { ...catalog, facilities: catalog.facilities.map((facility) => ({ ...facility, maxLevel: 2 })) };
}

describe("NPC 모듈 재료 사기(기획 답 1864 — D-212)", () => {
  it("모듈 재료가 창고에 없고 내지도 않는 도시도 짓기처럼 사서 목장에 모듈을 붙인다", () => {
    const tuning = new Map([
      ["npc_build_max_buildings", 5],
      ...[1, 2, 3, 4, 5, 6].map((grade): [string, number] => [`npc_build_cap_l${grade}`, 1]),
    ]);
    const summary = runSimulation({
      scenario: BUY_SCENARIO,
      catalog: capped(catalogWith([1n, 1n, 1n])),
      seed: 5,
      days: 12,
      tuning,
    });
    expect(summary.npc.plots).toBeGreaterThan(0);
    expect(summary.invariants).toMatchObject({ violations: 0, first: [] });
  });
});
