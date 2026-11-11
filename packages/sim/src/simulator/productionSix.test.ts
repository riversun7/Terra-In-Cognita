// 1차 생산 여섯 가지(docs/adr/2026-11-11-production-six.md, 사용자 2026-11-11 "낚시 채집 등 6가지 전부에 적용") — 새 셋(약초원·목장·낚시터)이
// 앞 셋과 같은 규칙 함수로 돈다: 약초원 = 추첨(INT + WIS), 목장 = 선택 + 효율(WIS + AGI, 해금 티어), 낚시터 = 성공 확률 뒤 추첨(AGI + DEX).
import { describe, expect, it } from "vitest";
import { type CatalogGather, type EconomyCatalog, prepareCatalog } from "./catalog.ts";
import { workerEffects } from "./economy.ts";
import { runSimulation } from "./run.ts";
import { type Scenario, parseScenario } from "./scenario.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO_RAW } from "./testEconomy.ts";

const st = (item: string, qty: number) => ({ item, qty: BigInt(qty) });
const raw = (id: string, tier: number, subcategory: string) => ({
  id,
  tier,
  category: "raw",
  subcategory,
  startPrice: 1n,
  enabled: true,
});

/** 팩 core@62의 새 세 시설 채집 칸(옛 gather_type_config·fishing_config 값) */
const HERB: CatalogGather = {
  primary: "int",
  secondary: "wis",
  subcategory: "herb",
  yieldBase: 1,
  yieldPerStatPm: 100,
  yieldCap: 8,
};
const RANCH: CatalogGather = {
  primary: "wis",
  secondary: "agi",
  subcategory: "livestock_product",
  mode: "select",
  yieldBase: 1,
  yieldPerStatPm: 80,
  yieldCap: 6,
};
const FISHING: CatalogGather = {
  primary: "agi",
  secondary: "dex",
  subcategory: "fish",
  yieldBase: 1,
  yieldPerStatPm: 100,
  yieldCap: 5,
  catch: { basePm: 300, maxPm: 800, statPm: 500, fullStat: 200 },
};

/** 시험 목록 + 새 세 시설·사다리(티어마다 하나씩 몇 개)·레시피(한 번에 10번 캠) */
const SIX_CATALOG: EconomyCatalog = {
  ...TEST_CATALOG,
  items: [
    ...TEST_CATALOG.items,
    raw("wild_herb", 0, "herb"),
    raw("aloe", 1, "herb"),
    raw("lavender", 2, "herb"),
    raw("angelica_root", 3, "herb"),
    raw("raw_meat", 0, "livestock_product"),
    raw("venison", 1, "livestock_product"),
    raw("mutton", 2, "livestock_product"),
    raw("loach", 0, "fish"),
    raw("carp", 1, "fish"),
    raw("salmon", 2, "fish"),
    raw("mackerel", 3, "fish"),
  ],
  facilities: [
    ...TEST_CATALOG.facilities,
    { id: "herb_field", stage: "gather", slotsPerLevel: 10, gather: HERB },
    { id: "ranch", stage: "gather", slotsPerLevel: 10, gather: RANCH },
    { id: "fishing_spot", stage: "gather", slotsPerLevel: 10, gather: FISHING },
  ],
  recipes: [
    ...TEST_CATALOG.recipes,
    {
      id: "gather_herbs",
      facility: "herb_field",
      inputs: [],
      outputs: [st("wild_herb", 10)],
      work: 1000,
      enabled: true,
    },
    {
      id: "raise_livestock",
      facility: "ranch",
      inputs: [],
      outputs: [st("raw_meat", 10)],
      work: 1000,
      enabled: true,
    },
    {
      id: "catch_fish",
      facility: "fishing_spot",
      inputs: [],
      outputs: [st("loach", 10)],
      work: 1000,
      enabled: true,
    },
  ],
};

/** 농업 나라 도시에 새 세 시설을 더한 시나리오(일꾼 스탯은 주·보조 같은 값) */
function scenarioWith(stat: number | undefined): Scenario {
  const stats = stat === undefined ? {} : { primaryStat: stat, secondaryStat: stat };
  return parseScenario({
    ...TEST_ECONOMY_SCENARIO_RAW,
    factions: TEST_ECONOMY_SCENARIO_RAW.factions.map((faction) =>
      faction.code === "agri"
        ? {
            ...faction,
            cityPlan: [
              ...faction.cityPlan,
              { facility: "herb_field", recipe: "gather_herbs", level: 1, workers: 2, ...stats },
              { facility: "ranch", recipe: "raise_livestock", level: 1, workers: 2, ...stats },
              { facility: "fishing_spot", recipe: "catch_fish", level: 1, workers: 2, ...stats },
            ],
          }
        : faction,
    ),
  });
}

const producedOnce = () =>
  runSimulation({ scenario: scenarioWith(undefined), catalog: SIX_CATALOG, seed: 9, days: 2 }).economy
    ?.produced;

const settings = { levelBonus: 10, defaultStat: 10, progressDivisor: 20, yieldPerStatPm: 80 };

describe("1차 생산 여섯 가지: 약초원·목장·낚시터", () => {
  it("레시피 셋 모두 사다리 산출이다: 약초원·낚시터 = 추첨, 목장 = 선택", () => {
    const prepared = prepareCatalog(SIX_CATALOG);
    expect(prepared.recipes.get("gather_herbs")?.gather).toEqual({
      subcategory: "herb",
      lots: 10,
      mode: "roll",
    });
    expect(prepared.recipes.get("raise_livestock")?.gather).toEqual({
      subcategory: "livestock_product",
      lots: 10,
      mode: "select",
    });
    expect(prepared.recipes.get("catch_fish")?.gather).toEqual({
      subcategory: "fish",
      lots: 10,
      mode: "roll",
    });
    expect(prepared.gatherLadders.get("fish")?.[3]).toEqual(["item:mackerel"]);
    expect(prepared.gatherLadders.get("livestock_product")?.[2]).toEqual(["item:mutton"]);
  });

  it("일꾼 효과는 앞 셋과 같은 식: 유효 스탯 = 주 + 보조, 진행 = ⌊주 ÷ 20⌋, 수확량 = 시설 칸", () => {
    // 약초원(옛 1·0.10·8): INT 60·WIS 45 → 유효 105, 진행 3, 한 번에 1 + 4 = 5개
    expect(workerEffects(HERB, { level: 1, primaryStat: 60, secondaryStat: 45 }, settings)).toEqual({
      gatherStat: 105,
      selectTier: 5,
      progress: 3,
      yieldPerLot: 5,
    });
    // 목장(옛 1·0.08·6): WIS 50·AGI 100 → 해금 ⌊150 ÷ 20⌋ = T7, 수확량 1 + 8 = 9 → 상한 6
    expect(workerEffects(RANCH, { level: 1, primaryStat: 50, secondaryStat: 100 }, settings)).toEqual({
      gatherStat: 150,
      selectTier: 7,
      progress: 2,
      yieldPerLot: 6,
    });
    // 낚시터(옛 1·0.10·5, 성공률 0.30 + 0.50 × min(1, 합 ÷ 200), 상한 0.80): AGI 30·DEX 30 → 300 + ⌊500 × 60 ÷ 200⌋ = 450‰
    expect(workerEffects(FISHING, { level: 1, primaryStat: 30, secondaryStat: 30 }, settings)).toEqual({
      gatherStat: 60,
      selectTier: 3,
      progress: 1,
      yieldPerLot: 4,
      catchPm: 450,
    });
    // 스탯 합 200 이상이면 상한 800‰
    expect(workerEffects(FISHING, { level: 1, primaryStat: 150, secondaryStat: 90 }, settings).catchPm).toBe(
      800,
    );
  });

  it("시뮬 경제에서 새 세 시설이 그 사다리의 물건만 낸다(위반 0)", () => {
    const summary = runSimulation({
      scenario: scenarioWith(undefined),
      catalog: SIX_CATALOG,
      seed: 7,
      days: 5,
    });
    expect(summary.invariants.violations).toBe(0);
    const produced = summary.economy?.produced ?? {};
    const qty = (id: string) => BigInt(produced[`item:${id}`] ?? "0");
    // 새 유닛(스탯 10·10 = 유효 20): 약초 T0가 가장 많고 T3까지 나온다
    expect(qty("wild_herb")).toBeGreaterThan(qty("aloe"));
    expect(qty("wild_herb") + qty("aloe") + qty("lavender") + qty("angelica_root")).toBeGreaterThan(0n);
    // 목장 선택: 해금 ⌊20 ÷ 20⌋ = T1 → 사슴 고기만(T0 생고기·T2 양고기는 나오지 않는다)
    expect(qty("venison")).toBeGreaterThan(0n);
    expect(qty("raw_meat")).toBe(0n);
    expect(qty("mutton")).toBe(0n);
    // 낚시: 성공률 300 + ⌊500 × 20 ÷ 200⌋ = 350‰ — 약초원(같은 스탯·같은 표, 늘 성공)보다 적게 낚는다
    const fish = qty("loach") + qty("carp") + qty("salmon") + qty("mackerel");
    expect(fish).toBeGreaterThan(0n);
    expect(fish).toBeLessThan(qty("wild_herb") + qty("aloe") + qty("lavender") + qty("angelica_root"));
  });

  it("목장은 스탯이 오르면 더 높은 티어를 기른다(해금 티어): 스탯 20·20 → T2 양고기", () => {
    const summary = runSimulation({ scenario: scenarioWith(20), catalog: SIX_CATALOG, seed: 7, days: 5 });
    const produced = summary.economy?.produced ?? {};
    expect(BigInt(produced["item:mutton"] ?? "0")).toBeGreaterThan(0n);
    expect(BigInt(produced["item:venison"] ?? "0")).toBe(0n);
  });

  it("같은 시드면 같은 결과(결정적)", () => {
    expect(producedOnce()).toEqual(producedOnce());
  });
});
