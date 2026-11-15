// 1차 생산 여섯 가지(docs/adr/2026-11-11-production-six.md, 사용자 2026-11-11 "낚시 채집 등 6가지 전부에 적용") — 새 셋(약초원·목장·낚시터)이
// 앞 셋과 같은 규칙 함수로 돈다: 약초원 = 추첨(INT + WIS), 목장 = 선택 + 효율(WIS + AGI), 낚시터 = 성공 확률 뒤 추첨(AGI + DEX).
// 바뀜 (기획 D-566 1721·D-567): 선택 방식(건물 채집소)은 건물 레벨의 최고 티어를 기르고 권장 스탯 미달이면 수확 효율이 준다. 이 시험 목록의
// 약초원은 옛 추첨 칸 그대로다(팩 core@107은 약초원도 선택 방식).
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
function scenarioWith(stat: number | undefined, ranchLevel = 1): Scenario {
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
              { facility: "ranch", recipe: "raise_livestock", level: ranchLevel, workers: 2, ...stats },
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
    // 약초원(옛 1·0.10·8, 추첨 칸): INT 60·WIS 45 → 유효 105, 진행 3, 한 번에 1 + 4 = 5개(선택 티어는 레벨 1 = T1, 쓰지 않음)
    expect(workerEffects(HERB, { level: 1, primaryStat: 60, secondaryStat: 45 }, settings)).toEqual({
      gatherStat: 105,
      selectTier: 1,
      progress: 3,
      yieldPerLot: 5,
    });
    // 목장(옛 1·0.08·6): 레벨 4 → T7(D-566 1721), WIS 50·AGI 100 = 합 150 ≥ 권장 140 → 효율 1000‰, 수확량 1 + 8 = 9 → 상한 6
    expect(workerEffects(RANCH, { level: 4, primaryStat: 50, secondaryStat: 100 }, settings)).toEqual({
      gatherStat: 180,
      selectTier: 7,
      yieldPm: 1000,
      statSum: 150,
      progress: 2,
      yieldPerLot: 6,
    });
    // 낚시터(옛 1·0.10·5, 성공률 0.30 + 0.50 × min(1, 합 ÷ 200), 상한 0.80): AGI 30·DEX 30 → 300 + ⌊500 × 60 ÷ 200⌋ = 450‰
    expect(workerEffects(FISHING, { level: 1, primaryStat: 30, secondaryStat: 30 }, settings)).toEqual({
      gatherStat: 60,
      selectTier: 1,
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
    // 목장 선택: 레벨 1 = 최고 T1(D-566 1721) — NPC는 그 아래에서 시세로 고른다(D-569 1761 npcSelectTier: T0 생고기·T1 사슴 고기),
    // T2 양고기는 나오지 않는다
    expect(qty("venison") + qty("raw_meat")).toBeGreaterThan(0n);
    expect(qty("mutton")).toBe(0n);
    // 낚시: 성공률 300 + ⌊500 × 20 ÷ 200⌋ = 350‰ — 약초원(같은 스탯·같은 표, 늘 성공)보다 적게 낚는다
    const fish = qty("loach") + qty("carp") + qty("salmon") + qty("mackerel");
    expect(fish).toBeGreaterThan(0n);
    expect(fish).toBeLessThan(qty("wild_herb") + qty("aloe") + qty("lavender") + qty("angelica_root"));
  });

  it("목장은 건물 레벨의 최고 티어를 기른다(D-566 1721): 레벨 2 = T3 → 사다리에 없어 T2 양고기, 스탯이 모자라면 덜 거둔다", () => {
    const full = runSimulation({ scenario: scenarioWith(40, 2), catalog: SIX_CATALOG, seed: 7, days: 5 });
    const low = runSimulation({ scenario: scenarioWith(10, 2), catalog: SIX_CATALOG, seed: 7, days: 5 });
    const mutton = (summary: typeof full) => BigInt(summary.economy?.produced["item:mutton"] ?? "0");
    expect(mutton(full)).toBeGreaterThan(0n);
    expect(BigInt(full.economy?.produced["item:venison"] ?? "0")).toBe(0n);
    // 스탯 10·10 = 합 20, 권장 60 → 효율 max(300, 1000 − 25 × 40) = 300‰: 같은 티어를 기르되 덜 거둔다
    expect(mutton(low)).toBeGreaterThan(0n);
    expect(mutton(low)).toBeLessThan(mutton(full));
  });

  it("같은 시드면 같은 결과(결정적)", () => {
    expect(producedOnce()).toEqual(producedOnce());
  });
});

/** 새 유닛(스탯 기본) 시나리오 5일 산출 */
const producedWith = (catalog: EconomyCatalog) =>
  runSimulation({ scenario: scenarioWith(undefined), catalog, seed: 7, days: 5 }).economy?.produced ?? {};

describe('목장 사다리 = 축산물 + 목축 부산물(질문 946 나, ADR production-six "바뀜 (2026-11-11, 946·947)")', () => {
  const RANCH_BOTH: CatalogGather = { ...RANCH, extraSubcategories: ["livestock_byproduct"] };
  const BOTH_CATALOG: EconomyCatalog = {
    ...SIX_CATALOG,
    items: [
      ...SIX_CATALOG.items,
      raw("feather", 0, "livestock_byproduct"),
      raw("deer_hide", 1, "livestock_byproduct"),
    ],
    facilities: SIX_CATALOG.facilities.map((facility) =>
      facility.id === "ranch" ? { ...facility, gather: RANCH_BOTH } : facility,
    ),
    recipes: SIX_CATALOG.recipes.map((recipe) =>
      // 대표 산출이 부산물이어도 사다리 산출이다(산출이 모두 사다리 중분류 가운데 하나)
      recipe.id === "raise_livestock" ? { ...recipe, outputs: [st("feather", 10)] } : recipe,
    ),
  };

  it("사다리 키는 두 중분류를 잇고, 티어마다 두 중분류 물건이 팩 차례로 한 사다리에 든다", () => {
    const prepared = prepareCatalog(BOTH_CATALOG);
    expect(prepared.recipes.get("raise_livestock")?.gather).toEqual({
      subcategory: "livestock_product+livestock_byproduct",
      lots: 10,
      mode: "select",
    });
    const ladder = prepared.gatherLadders.get("livestock_product+livestock_byproduct");
    expect(ladder?.[0]).toEqual(["item:raw_meat", "item:feather"]);
    expect(ladder?.[1]).toEqual(["item:venison", "item:deer_hide"]);
    expect(ladder?.[2]).toEqual(["item:mutton"]);
    // 다른 시설의 사다리 키는 그대로(중분류 하나 = 그 ID)
    expect(prepared.gatherLadders.get("fish")?.[3]).toEqual(["item:mackerel"]);
  });

  it("해금 티어 T1에서 사슴 고기와 사슴 가죽을 함께 고른다(다른 시설 산출은 앞 판과 같다)", () => {
    const both = producedWith(BOTH_CATALOG);
    const qty = (id: string) => BigInt(both[`item:${id}`] ?? "0");
    expect(qty("venison")).toBeGreaterThan(0n);
    expect(qty("deer_hide")).toBeGreaterThan(0n);
    // 최고 T1 위(T2 양고기)는 나오지 않는다 — NPC가 시세로 T0(생고기·깃털)을 고르는 때도 있다(D-569 1761)
    expect(qty("mutton")).toBe(0n);
    // 약초·어류는 목장 사다리를 넓혀도 그대로다(시설마다 난수 흐름이 따로)
    const before = producedWith(SIX_CATALOG);
    for (const id of [
      "wild_herb",
      "aloe",
      "lavender",
      "angelica_root",
      "loach",
      "carp",
      "salmon",
      "mackerel",
    ])
      expect(both[`item:${id}`]).toEqual(before[`item:${id}`]);
  });
});
