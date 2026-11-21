// 시뮬 경제의 채집 티어 추첨·묶음(D-506, 질문 300~302) — 철광석 T3를 Lv1 광산이 막히지 않고 캔다, 제작 시설은 레벨 상한(D-5001) 그대로,
// 레시피 묶음 → 원장 기본 단위, 추첨 산출이 그 중분류 사다리에서 나온다.
// 옛 1차 생산 규칙(D-507, 49 N32·N44·P8): 주 스탯 → 진행 속도, 보조 스탯 → 수확량, 티어별 필요 진행, 선택 방식(농장)
import { describe, expect, it } from "vitest";
import { type CatalogGather, type EconomyCatalog, prepareCatalog } from "./catalog.ts";
import { workerEffects } from "./economy.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { runSimulation } from "./run.ts";
import { type Scenario, parseScenario } from "./scenario.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO, TEST_ECONOMY_SCENARIO_RAW } from "./testEconomy.ts";

/** 시험 목록 + 광석 사다리(잡석 T0·묶음 1, 철광석 T3·묶음 1,000 = 1kg), 광산 추첨 STR + VIT, 제련소는 가공 단계 */
const GATHER_CATALOG: EconomyCatalog = {
  ...TEST_CATALOG,
  items: [
    ...TEST_CATALOG.items.map((item) =>
      item.id === "iron_ore" ? { ...item, tier: 3, subcategory: "ore", lotSize: 1000n } : item,
    ),
    { id: "rubble", tier: 0, category: "raw", subcategory: "ore", startPrice: 1n, enabled: true },
  ],
  facilities: TEST_CATALOG.facilities.map((facility) =>
    facility.id === "mine"
      ? { ...facility, gather: { primary: "str", secondary: "vit", subcategory: "ore" } }
      : facility.id === "smelter"
        ? { ...facility, stage: "process" }
        : facility,
  ),
};

describe("채집 티어 추첨 + 묶음(시뮬 경제)", () => {
  it("레시피 수량은 묶음 × 묶음 크기 = 원장 기본 단위, 광산 레시피는 추첨(묶음 10개)", () => {
    const prepared = prepareCatalog(GATHER_CATALOG);
    expect(prepared.recipes.get("smelt_iron")?.inputs).toEqual([{ asset: "item:iron_ore", qty: 10_000n }]);
    expect(prepared.recipes.get("mine_iron_ore")?.gather).toEqual({
      subcategory: "ore",
      lots: 10,
      mode: "roll",
    });
    expect(prepared.recipes.get("cut_timber")?.gather).toBeUndefined();
    expect(prepared.gatherLadders.get("ore")?.[0]).toEqual(["item:rubble"]);
    expect(prepared.gatherLadders.get("ore")?.[3]).toEqual(["item:iron_ore"]);
    expect(prepared.lotSize.get("item:iron_ore")).toBe(1000n);
  });

  it("철광석 T3를 Lv1 광산이 막히지 않고 캐고(D-506), 광석 수확 1단위 = gatherOreGrams(기본 20g)로 나온다", () => {
    const summary = runSimulation({
      scenario: TEST_ECONOMY_SCENARIO,
      catalog: GATHER_CATALOG,
      seed: 5,
      days: 3,
    });
    expect(summary.invariants.violations).toBe(0);
    const produced = summary.economy?.produced ?? {};
    const iron = BigInt(produced["item:iron_ore"] ?? "0");
    const rubble = BigInt(produced["item:rubble"] ?? "0");
    const grams = BigInt(TEST_SOCIETY_COEFFICIENTS.gatherOreGrams);
    expect(iron).toBeGreaterThan(0n);
    expect(iron % grams).toBe(0n);
    // 새 유닛(20) 구간: 잡석 70% 쪽이 철 5%보다 훨씬 많다(이 시험 목록의 잡석은 묶음 1이라 1개 = 1, 철은 수확 1단위 = gatherOreGrams g)
    expect(rubble).toBeGreaterThan(iron / grams);
  });

  it("광산 수확량 50 + VIT × 5(상한 500): 수확 단위 100·300·500(× gatherOreGrams 20g = 사이클당 2·6·10kg)", () => {
    const gramCatalog: EconomyCatalog = {
      ...GATHER_CATALOG,
      items: GATHER_CATALOG.items.map((item) =>
        item.subcategory === "ore" ? { ...item, lotSize: 10_000n } : item,
      ),
      facilities: GATHER_CATALOG.facilities.map((facility) =>
        facility.id === "mine"
          ? {
              ...facility,
              gather: {
                primary: "str",
                secondary: "vit",
                subcategory: "ore",
                yieldBase: 50,
                yieldPerStatPm: 5000,
                yieldCap: 500,
              },
            }
          : facility,
      ),
    };
    const low = workerEffects(
      gramCatalog.facilities.find((f) => f.id === "mine")?.gather,
      { level: 1, primaryStat: 10, secondaryStat: 10 },
      { levelBonus: 5, defaultStat: 10 },
    );
    const mid = workerEffects(
      gramCatalog.facilities.find((f) => f.id === "mine")?.gather,
      { level: 1, primaryStat: 40, secondaryStat: 50 },
      { levelBonus: 5, defaultStat: 10 },
    );
    const capped = workerEffects(
      gramCatalog.facilities.find((f) => f.id === "mine")?.gather,
      { level: 1, primaryStat: 120, secondaryStat: 120 },
      { levelBonus: 5, defaultStat: 10 },
    );
    expect(low.yieldPerLot).toBe(100);
    expect(mid.yieldPerLot).toBe(300);
    expect(capped.yieldPerLot).toBe(500);
  });

  it("제작(가공) 시설은 레벨 티어 상한(D-5001)을 그대로 받는다: Lv1 제련소가 T3 산출이면 차리지 못한다", () => {
    const capped: EconomyCatalog = {
      ...GATHER_CATALOG,
      items: GATHER_CATALOG.items.map((item) => (item.id === "iron_ingot" ? { ...item, tier: 3 } : item)),
    };
    expect(() =>
      runSimulation({ scenario: TEST_ECONOMY_SCENARIO, catalog: capped, seed: 5, days: 1 }),
    ).toThrow(/facility level too low for smelt_iron/);
  });
});

/**
 * 잡석(T0)만 있는 광석 사다리(철광석은 광석 중분류에서 빼고, 광산 레시피는 잡석 10번): 한 번 캘 때 필요 진행이 늘 T0 30이라
 * 시간을 셀 수 있다
 */
const RUBBLE_ONLY: EconomyCatalog = {
  ...GATHER_CATALOG,
  items: GATHER_CATALOG.items.map((item) =>
    item.id === "iron_ore" ? { ...item, subcategory: undefined } : item,
  ),
  recipes: GATHER_CATALOG.recipes.map((recipe) =>
    recipe.id === "mine_iron_ore" ? { ...recipe, outputs: [{ item: "rubble", qty: 10n }] } : recipe,
  ),
};

/** 시험 시나리오의 광산 계획에 일꾼 스탯을 적는다(그 밖은 그대로) */
function withMineStats(primaryStat: number, secondaryStat: number): Scenario {
  return parseScenario({
    ...TEST_ECONOMY_SCENARIO_RAW,
    factions: TEST_ECONOMY_SCENARIO_RAW.factions.map((faction) => ({
      ...faction,
      cityPlan: faction.cityPlan.map((plan) =>
        plan.facility === "mine" ? { ...plan, primaryStat, secondaryStat } : plan,
      ),
    })),
  });
}

function producedRubble(catalog: EconomyCatalog, scenario: Scenario): bigint {
  const summary = runSimulation({ scenario, catalog, seed: 3, days: 1 });
  expect(summary.invariants.violations).toBe(0);
  return BigInt(summary.economy?.produced["item:rubble"] ?? "0");
}

describe("옛 1차 생산 규칙(D-507): 주 스탯 → 진행 속도, 보조 스탯 → 수확량, 티어별 필요 진행", () => {
  const settings = { levelBonus: 10, defaultStat: 10, progressDivisor: 20, yieldPerStatPm: 80 };
  const mine: CatalogGather = {
    primary: "str",
    secondary: "vit",
    subcategory: "ore",
    yieldBase: 1,
    yieldPerStatPm: 100,
    yieldCap: 10,
  };

  it("일꾼 효과: 새 유닛(주 10·보조 10) 광산 = 속도 ×1·한 번에 2개(1 + ⌊10 × 0.10⌋)·추첨 스탯 20", () => {
    expect(workerEffects(mine, { level: 1 }, settings)).toEqual({
      gatherStat: 20,
      selectTier: 1,
      progress: 1,
      yieldPerLot: 2,
    });
    // 옛 문서 예시(ITM-10): VIT 60 + INT 20 = 80, 진행 ⌊60 ÷ 20⌋ = 3. 농장 수확량 0.08 → 1 + ⌊20 × 0.08⌋ = 2.
    // 바뀜 (D-566 1721): 티어 = 건물 레벨 최고 티어(레벨 1 = T1), 합 80 ≥ 권장 20 → 효율 1000‰
    const farm: CatalogGather = {
      primary: "vit",
      secondary: "int",
      subcategory: "crop",
      mode: "select",
      yieldBase: 1,
      yieldPerStatPm: 80,
      yieldCap: 8,
    };
    expect(workerEffects(farm, { level: 1, primaryStat: 60, secondaryStat: 20 }, settings)).toEqual({
      gatherStat: 80,
      selectTier: 1,
      yieldPm: 1000,
      // 티어를 다시 고를 때 쓰는 스탯 합(D-569 1761)
      statSum: 80,
      progress: 3,
      yieldPerLot: 2,
    });
    // 레벨 3 = T5(권장 100), 합 80 → 효율 1000 − 25 × 20 = 500‰, 면적 모듈 둘(+200‰씩) → 500 × 1400 ÷ 1000 = 700‰
    expect(
      workerEffects(farm, { level: 3, primaryStat: 60, secondaryStat: 20, plots: 2 }, settings).yieldPm,
    ).toBe(700);
    expect(workerEffects(farm, { level: 3, primaryStat: 60, secondaryStat: 20 }, settings).selectTier).toBe(
      5,
    );
    // 합 20 → 권장 100에 80 모자람 → 바닥 300‰
    expect(workerEffects(farm, { level: 3, primaryStat: 10, secondaryStat: 10 }, settings).yieldPm).toBe(300);
    // 스탯 짝이 없는 시설(제련소 등)은 효과 없음
    expect(workerEffects(undefined, { level: 3, primaryStat: 200 }, settings)).toEqual({
      gatherStat: 0,
      selectTier: 0,
      progress: 1,
      yieldPerLot: 1,
    });
  });

  it("필요 진행: 잡석(T0 30) 10번 ÷ 일꾼 2명 = 150분에 한 번, 주 스탯 40이면 진행 ×2라 75분에 한 번", () => {
    // 광산 4곳(공업 나라 2 × 도시 2), 하루 1,440분. 시험 목록 광산은 수확량 칸이 없어 설정 칸 80‰ → 보조 10이면 한 번에 1개
    expect(producedRubble(RUBBLE_ONLY, TEST_ECONOMY_SCENARIO)).toBe(4n * 9n * 10n); // ⌊1440 ÷ 150⌋ = 9번
    expect(producedRubble(RUBBLE_ONLY, withMineStats(40, 10))).toBe(4n * 19n * 10n); // ⌊1440 ÷ 75⌋ = 19번
  });

  it("보조 스탯 → 수확량: 시설 비율 0.10·상한 10, 보조 20이면 한 번에 3개, 보조 200이면 상한 10개", () => {
    const catalog: EconomyCatalog = {
      ...RUBBLE_ONLY,
      facilities: RUBBLE_ONLY.facilities.map((facility) =>
        facility.id === "mine" ? { ...facility, gather: mine } : facility,
      ),
    };
    expect(producedRubble(catalog, withMineStats(10, 20))).toBe(4n * 9n * 10n * 3n);
    expect(producedRubble(catalog, withMineStats(10, 200))).toBe(4n * 9n * 10n * 10n);
  });
});
