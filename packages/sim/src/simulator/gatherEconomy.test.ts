// 시뮬 경제의 채집 티어 추첨·묶음(D-506, 질문 300~302) — 철광석 T3를 Lv1 광산이 막히지 않고 캔다, 제작 시설은 레벨 상한(D-5001) 그대로,
// 레시피 묶음 → 원장 기본 단위, 추첨 산출이 그 중분류 사다리에서 나온다
import { describe, expect, it } from "vitest";
import { type EconomyCatalog, prepareCatalog } from "./catalog.ts";
import { runSimulation } from "./run.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO } from "./testEconomy.ts";

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
    expect(prepared.recipes.get("mine_iron_ore")?.gather).toEqual({ subcategory: "ore", lots: 10 });
    expect(prepared.recipes.get("cut_timber")?.gather).toBeUndefined();
    expect(prepared.gatherLadders.get("ore")?.[0]).toEqual(["item:rubble"]);
    expect(prepared.gatherLadders.get("ore")?.[3]).toEqual(["item:iron_ore"]);
    expect(prepared.lotSize.get("item:iron_ore")).toBe(1000n);
  });

  it("철광석 T3를 Lv1 광산이 막히지 않고 캐고(D-506), 나온 철광석은 1kg 묶음의 배수다", () => {
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
    expect(iron).toBeGreaterThan(0n);
    expect(iron % 1000n).toBe(0n);
    // 새 유닛(20) 구간: 잡석 70% 쪽이 철 5%보다 훨씬 많다(잡석 묶음 = 1개)
    expect(rubble).toBeGreaterThan(iron / 1000n);
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
