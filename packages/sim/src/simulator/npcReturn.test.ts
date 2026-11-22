// NPC 투자 판단의 기대 수익·유지비 셈(npc-fix-3, 질문 2566 나 + 다 — npcReturn.ts)
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { createEconomy } from "./economy.ts";
import {
  cityDailyFlow,
  facilityReturn,
  firstRecipeOf,
  npcWorkerDailyWage,
  workerCardReturn,
} from "./npcReturn.ts";
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

  // fixes-1117e(질문 2604 나): 시설 산출 값을 그 도시 수요로 자른다
  it("도시 하루 흐름: 수요 = 생필품(유닛 × 회) + 다 지은 시설이 먹는 재료 + 지으려는 재료, 공급 = 다 지은 시설 산출", () => {
    const { economy, cityId } = setup();
    // 첫 도시: 유닛 10, 농장(일꾼 2)·부엌(1)·벌목장(1)
    const flow = cityDailyFlow(economy, cityId, () => 0n);
    // 배급 10 × 24회 = 240, 생활용품 10 × 1회 = 10, 곡물 = 부엌 20 × 24번 = 480
    expect(flow.demand).toEqual(
      new Map([
        ["item:ration", 240n],
        ["item:household_goods", 10n],
        ["item:grain", 480n],
      ]),
    );
    // 곡물 20 × 48번 = 960, 배급 30 × 24번 = 720, 목재 10 × 24번 = 240
    expect(flow.supply).toEqual(
      new Map([
        ["item:grain", 960n],
        ["item:ration", 720n],
        ["item:timber", 240n],
      ]),
    );
    expect(flow.glutted.size).toBe(0);
    economy.buildWants = new Map([[cityId, new Map([["item:grain", 1000n]])]]);
    expect(cityDailyFlow(economy, cityId, () => 0n).demand.get("item:grain")).toBe(1480n);
  });

  it("이미 넘치는 물건 = 재고 > 목표 재고 × 4이고 > 하루 공급(시장이 받아 주지 못해 쌓임)", () => {
    const { economy, cityId } = setup();
    // 곡물 목표 재고 = 부엌 24시간분 480 → 넘침 문턱 1,920(하루 공급 960보다 크다)
    const at = (grain: bigint) =>
      cityDailyFlow(economy, cityId, (asset) => (asset === "item:grain" ? grain : 0n)).glutted;
    expect(at(1920n).has("item:grain")).toBe(false);
    expect(at(1921n).has("item:grain")).toBe(true);
    // 공급하지 않는 물건은 쌓여도 넘침으로 보지 않는다(새 시설의 첫 산출)
    expect(cityDailyFlow(economy, cityId, () => 1_000_000n).glutted).toEqual(
      new Set(["item:grain", "item:ration", "item:timber"]),
    );
  });

  it("수요로 자르기: 넘치지 않으면 다, 넘치면 (수요 − 공급) 안만 지난 값·넘는 몫은 넘침 값 ‰, 재료는 다 친다", () => {
    const { economy, cityId } = setup();
    const flowAt = (grain: bigint) =>
      cityDailyFlow(economy, cityId, (asset) => (asset === "item:grain" ? grain : 0n));
    // 넘치지 않음: 옛 셈과 같다(곡물 960 × 4)
    expect(facilityReturn(economy, cityId, "farm", 2, 20n, { flow: flowAt(0n), surplusPm: 0 })).toEqual({
      dailyValue: 3840n,
      dailyUpkeep: 40n,
    });
    // 넘침 + 공급(960)이 이미 수요(480)를 넘음: 새 산출은 모두 넘는 몫
    const glut = flowAt(10_000n);
    expect(facilityReturn(economy, cityId, "farm", 2, 20n, { flow: glut, surplusPm: 0 })?.dailyValue).toBe(
      0n,
    );
    expect(facilityReturn(economy, cityId, "farm", 2, 20n, { flow: glut, surplusPm: 500 })?.dailyValue).toBe(
      1920n,
    );
    // 지으려는 곡물 1,000이 있으면 수요 1,480 − 공급 960 = 520만 지난 값(넘침 문턱은 목표 1,480 × 4 = 5,920)
    economy.buildWants = new Map([[cityId, new Map([["item:grain", 1000n]])]]);
    expect(
      facilityReturn(economy, cityId, "farm", 2, 20n, { flow: flowAt(6000n), surplusPm: 0 })?.dailyValue,
    ).toBe(2080n);
    // 부엌: 배급(넘침)은 0, 먹는 곡물 20 × 24 × 4 = 1,920은 다 뺀다
    const all = cityDailyFlow(economy, cityId, () => 1_000_000n);
    expect(facilityReturn(economy, cityId, "kitchen", 1, 20n, { flow: all, surplusPm: 0 })?.dailyValue).toBe(
      -1920n,
    );
  });
});
