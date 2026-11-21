// NPC 투자 판단의 기대 수익·유지비 셈(npc-fix-3, 질문 2566 나 + 다 — npcReturn.ts)
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { createEconomy } from "./economy.ts";
import { facilityReturn, firstRecipeOf, npcWorkerDailyWage, workerCardReturn } from "./npcReturn.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO } from "./testEconomy.ts";
import { createWorld } from "./world.ts";

const c = TEST_SOCIETY_COEFFICIENTS;

function setup() {
  const world = createWorld(TEST_ECONOMY_SCENARIO, 3, 0);
  const economy = createEconomy(world, TEST_ECONOMY_SCENARIO, TEST_CATALOG, 0);
  const [cityId] = [...world.cities.keys()].toSorted((a, b) => a - b);
  if (cityId === undefined) throw new Error("city");
  return { economy, cityId };
}

describe("NPC 투자 기대 수익 셈(npcReturn.ts)", () => {
  it("일꾼 하루 임금 = 기준 임금 × business_npc_wage_pm ÷ 1000, 임금을 끄면 0", () => {
    // 기준 임금 = 효율(초기 합 60 ÷ 6 = 10) × 단가 2000밀리 ÷ 1000 = 20
    expect(npcWorkerDailyWage(c)).toBe(20n);
    expect(npcWorkerDailyWage({ ...c, business: { ...c.business, npcWagePm: 500 } })).toBe(10n);
    expect(npcWorkerDailyWage({ ...c, business: { ...c.business, npcWageMode: 0 } })).toBe(0n);
  });

  it("시설: 첫 레시피 산출 값 − 먹는 재료 값을 일꾼 수 × 하루 24시간(효율 1000)으로, 유지비 = 임금 × 일꾼", () => {
    const { economy, cityId } = setup();
    expect(firstRecipeOf(economy.catalog, "farm")?.id).toBe("farm_grain");
    // 농장: 곡물 20 × 시작 시세 4 = 80, 작업량 1000 → 하루 24번 → 일꾼 둘이면 3,840
    expect(facilityReturn(economy, cityId, "farm", 2, 20n)).toEqual({ dailyValue: 3840n, dailyUpkeep: 40n });
    // 제련소: 주괴 7 × 14 − 광석 10 × 8 = 18 → 하루 432
    expect(facilityReturn(economy, cityId, "smelter", 1, 20n)).toEqual({
      dailyValue: 432n,
      dailyUpkeep: 20n,
    });
  });

  it("레시피가 없거나 일꾼 자리가 0이면 셈하지 않는다(숙소 등)", () => {
    const { economy, cityId } = setup();
    expect(facilityReturn(economy, cityId, "lodging", 2, 20n)).toBeUndefined();
    expect(facilityReturn(economy, cityId, "farm", 0, 20n)).toBeUndefined();
  });

  it("더 좋은 일꾼 카드: 늘어나는 효율의 임금 시세 대 늘어나는 값(유지비는 같아 0)", () => {
    const r = workerCardReturn({ total: 60, cost: 600n }, { total: 30, cost: 50n }, c);
    // 효율 10 → 20, 5 → 10: 하루 시세 차이 10
    expect(r).toEqual({ dailyValue: 10n, dailyUpkeep: 0n, basis: 550n });
    expect(workerCardReturn({ total: 30, cost: 50n }, { total: 30, cost: 50n }, c)).toEqual({
      dailyValue: 0n,
      dailyUpkeep: 0n,
      basis: 0n,
    });
  });
});
