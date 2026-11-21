// gov-fix-3 시뮬 쪽 시험 — 쿠데타로 도시 하나뿐인 나라의 도시 떼기(질문 2573 가 확인), 명분 있는 선포의 비용 면제(2585 — 사용자 답 D-290 반대 읽기),
// 나라 화폐가 바뀐 뒤 도시 운영비 금고 옮기기(2576 다). 셋 다 시뮬 판정에는 닿지 않는다(서버만 coup·caused·convertCityFunds를 쓴다).
import { describe, expect, it } from "vitest";
import { TEST_ASSET_CREDIT } from "../settle/owner.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { cityFundCode, cityFundFxCode, convertCityFunds, depositCityFund } from "../society/residentTax.ts";
import { createMetricsRecorder } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { createWorld } from "./world.ts";

/** 세력 둘: 1 = 도시 하나뿐인 고정 나라(시작 도시), 2 = 도시 둘 */
function setup() {
  const scenario = parseScenario({
    id: "gov_fix3_test",
    factions: [
      {
        code: "one",
        count: 1,
        fixed: true,
        cities: 1,
        workers: 10,
        credit: "100000",
        tech: 3,
        regime: "dictatorship",
      },
      {
        code: "two",
        count: 1,
        fixed: false,
        cities: 2,
        workers: 10,
        credit: "100000",
        tech: 3,
        regime: "democracy",
      },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 5, 0);
  const recorder = createMetricsRecorder({ startMs: 0, sink: () => {} });
  recorder.start([...world.factions.values()].map((f) => ({ id: f.id, fixed: f.fixed, tech: f.tech })));
  const society = attachSociety(
    {
      world,
      settings: scenario.society,
      recorder,
      c: TEST_SOCIETY_COEFFICIENTS,
      hooks: undefined,
      combat: undefined,
      scheduleFaction: () => {},
      scheduleUnit: () => {},
      cancel: () => {},
    },
    0,
  );
  const faction = (id: number) => {
    const found = world.factions.get(id);
    if (!found) throw new Error(`faction ${id}`);
    return found;
  };
  return { world, society, faction };
}

describe("gov-fix-3", () => {
  it("도시 하나뿐인 나라의 쿠데타: 시작 도시도 그 도시만 새 세력으로 떨어져 나가고 옛 나라는 도시가 없다(2573 가 확인)", () => {
    const { world, society, faction } = setup();
    const one = faction(1);
    const [cityId] = [...one.cities];
    if (cityId === undefined) throw new Error("city");
    expect(world.cities.get(cityId)?.start).toBe(true);
    // 쿠데타가 아니면 시작 도시는 떼지 않는다(D-341)
    expect(society.cityIndependence(cityId, 1000)).toBeUndefined();
    const child = society.cityIndependence(cityId, 1000, true);
    expect(child).toBeDefined();
    expect(world.cities.get(cityId)?.owner).toBe(child);
    expect(one.cities.size).toBe(0);
    expect(faction(child ?? -1).cities.has(cityId)).toBe(true);
  });

  it("명분이 있는 선포는 선포 비용을 내지 않는다(2585), 없으면 국고의 만분율을 태운다", () => {
    const { world, society, faction } = setup();
    const one = faction(1);
    const two = faction(2);
    const before = world.book.balanceOf(2, TEST_ASSET_CREDIT);
    society.declareWar(two, one, 0, true);
    expect(two.wars.has(1)).toBe(true);
    expect(world.book.balanceOf(2, TEST_ASSET_CREDIT)).toBe(before);
    const oneBefore = world.book.balanceOf(1, TEST_ASSET_CREDIT);
    two.wars.delete(1);
    one.wars.delete(2);
    society.declareWar(one, two, 10);
    expect(world.book.balanceOf(1, TEST_ASSET_CREDIT)).toBe(oneBefore - (oneBefore * 500n) / 10_000n);
    expect(society.check(10)).toEqual([]);
  });

  it("나라 화폐가 바뀌면 옛 화폐 금고를 바꾼 비율로 새 화폐 금고로 옮긴다(2576 다 — 화폐마다 원장이 맞고, 다시 해도 그대로)", () => {
    const { world, faction } = setup();
    const book = world.book;
    const two = faction(2);
    const [cityId] = [...two.cities];
    if (cityId === undefined) throw new Error("city");
    depositCityFund(book, 2, cityId, TEST_ASSET_CREDIT, 500n, 0);
    const fresh = "currency_fresh";
    const fundOf = (asset: string) => book.balance(book.systemAccount(cityFundCode(2, cityId, asset), asset));
    // 비율을 모르면(0) 옮기지 않는다
    expect(
      convertCityFunds(
        book,
        () => fresh,
        () => 0n,
        1,
      ),
    ).toBe(0);
    expect(fundOf(TEST_ASSET_CREDIT)).toBe(500n);
    // 지금 화폐가 같으면 그대로
    expect(
      convertCityFunds(
        book,
        () => TEST_ASSET_CREDIT,
        (amount) => amount * 3n,
        1,
      ),
    ).toBe(0);
    const treasury = book.balanceOf(2, TEST_ASSET_CREDIT);
    expect(
      convertCityFunds(
        book,
        (nation) => (nation === 2 ? fresh : undefined),
        (amount) => amount * 3n,
        2,
      ),
    ).toBe(1);
    expect(fundOf(TEST_ASSET_CREDIT)).toBe(0n);
    expect(fundOf(fresh)).toBe(1500n);
    // 국고로 돌려주지 않는다. 창구가 화폐마다 맞춘다
    expect(book.balanceOf(2, TEST_ASSET_CREDIT)).toBe(treasury);
    expect(book.balance(book.systemAccount(cityFundFxCode(TEST_ASSET_CREDIT), TEST_ASSET_CREDIT))).toBe(500n);
    expect(book.balance(book.systemAccount(cityFundFxCode(fresh), fresh))).toBe(-1500n);
    expect(
      convertCityFunds(
        book,
        () => fresh,
        (amount) => amount * 3n,
        3,
      ),
    ).toBe(0);
  });
});
