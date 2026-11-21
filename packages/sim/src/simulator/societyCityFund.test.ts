// 도시 운영비 금고 시험(gov-fix-2 — 질문 2537 기획 답: 주민세 도시 몫은 다시 켜도 남는다). 원장 계정에 담기므로 새 정산 객체(= 다시 켬)에서도 잔고가 그대로이고,
// 운영비를 그 금고에서 메우며, 도시가 다른 나라로 넘어가면 남은 몫은 옛 나라 국고로 돌아간다.
import { describe, expect, it } from "vitest";
import { TEST_ASSET_CREDIT } from "../settle/owner.ts";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { cityFundCode } from "../society/residentTax.ts";
import { DAY_MS } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import type { SimHooks } from "./npcRun.ts";
import { createSocietyPayouts } from "./societyPayouts.ts";
import { createWorld } from "./world.ts";

const C: SocietyCoefficients = {
  ...TEST_SOCIETY_COEFFICIENTS,
  business: {
    ...TEST_SOCIETY_COEFFICIENTS.business,
    residentTaxPm: 10,
    residentTaxEveryMs: DAY_MS,
    residentTaxNationPm: 0,
  },
};

/** 세력 둘(도시 둘씩) — 세력 1 도시 1에 사는 유닛 하나를 77번 주인에게 넘기고 재산 10,000 */
function setup() {
  const scenario = parseScenario({
    id: "city_fund_test",
    factions: [
      {
        code: "cap",
        count: 1,
        fixed: false,
        cities: 2,
        workers: 4,
        credit: "100000",
        tech: 3,
        regime: "capitalism",
      },
      {
        code: "dem",
        count: 1,
        fixed: false,
        cities: 2,
        workers: 4,
        credit: "100000",
        tech: 3,
        regime: "democracy",
      },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 5, 0);
  const unit = [...world.units.values()].find((u) => u.city === 1);
  if (!unit) throw new Error("unit in city 1");
  unit.owner = 77;
  world.book.post({
    kind: "transfer",
    atMs: 0,
    entries: [
      { account: world.book.ownerAccount(1, TEST_ASSET_CREDIT), amount: -1000n },
      { account: world.book.ownerAccount(77, TEST_ASSET_CREDIT), amount: 1000n },
    ],
  });
  const hooks: SimHooks = {
    treasuryAsset: () => TEST_ASSET_CREDIT,
    beforeCityTransfer: () => {},
    factionBorn: () => {},
    factionDied: () => {},
    residentProperty: () => (payer, city) => (payer === 77 && city === 1 ? 10_000n : 0n),
  };
  const payouts = () => createSocietyPayouts(world, C, hooks, () => TEST_ASSET_CREDIT);
  const fund = () =>
    world.book.balance(world.book.systemAccount(cityFundCode(1, 1, TEST_ASSET_CREDIT), TEST_ASSET_CREDIT));
  return { world, payouts, fund };
}

describe("도시 운영비 금고(질문 2537)", () => {
  it("걷은 도시 몫은 금고 계정에 담기고, 다시 켠 정산이 그 금고로 운영비를 메우고, 남은 몫은 금고에 남는다", () => {
    const { world, payouts, fund } = setup();
    const treasury0 = world.book.balanceOf(1, TEST_ASSET_CREDIT);
    payouts().collectResidentTax(DAY_MS, 1);
    // 세금 100(10,000 × 10‰), 나라 몫 0 → 모두 도시 몫 → 금고
    expect(fund()).toBe(100n);
    expect(world.book.balanceOf(1, TEST_ASSET_CREDIT)).toBe(treasury0);
    // 다시 켬: 새 정산 객체(메모리 없음) — 원장 금고는 그대로
    const restarted = payouts();
    expect(fund()).toBe(100n);
    restarted.spent(1, 30n);
    restarted.settleDividends(2 * DAY_MS);
    // 운영비 30을 금고가 냄(금고 → 국고), 남은 70은 다음 기간으로
    expect(fund()).toBe(70n);
    expect(world.book.balanceOf(1, TEST_ASSET_CREDIT)).toBe(treasury0 + 30n);
    restarted.spent(1, 500n);
    restarted.settleDividends(3 * DAY_MS);
    expect(fund()).toBe(0n);
    expect(world.book.balanceOf(1, TEST_ASSET_CREDIT)).toBe(treasury0 + 100n);
  });

  it("도시가 다른 나라로 넘어가면 남은 금고는 옛 나라 국고로 돌아간다", () => {
    const { world, payouts, fund } = setup();
    const p = payouts();
    p.collectResidentTax(DAY_MS, 1);
    const treasury = world.book.balanceOf(1, TEST_ASSET_CREDIT);
    const from = world.factions.get(1);
    if (!from) throw new Error("faction 1");
    p.cityMoved(1, from, 2 * DAY_MS);
    expect(fund()).toBe(0n);
    expect(world.book.balanceOf(1, TEST_ASSET_CREDIT)).toBe(treasury + 100n);
  });
});
