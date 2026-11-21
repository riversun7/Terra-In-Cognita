import { DEFAULT_UNIT_TRAITS, type UnitTraits } from "@terra/shared/unitTraits";
import { TEST_SOCIETY_COEFFICIENTS, cityWorkerUnits } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { createLaborOrders } from "./laborOrders.ts";

const LABOR_CHECK_MS = TEST_SOCIETY_COEFFICIENTS.npcAi.houseCheckMs;

interface TestUnit {
  id: number;
  city: number;
  guard?: boolean | undefined;
  satisfactionMilli: number;
  fedPm?: number | undefined;
  laborRank?: number | undefined;
  onStrike?: boolean | undefined;
}

const unit = (id: number, patch: Partial<TestUnit> = {}): TestUnit => ({
  id,
  city: 1,
  satisfactionMilli: 80_000,
  fedPm: 1000,
  ...patch,
});

function setup(list: TestUnit[], o: { traits?: Map<number, UnitTraits>; enabled?: () => number } = {}) {
  const units = new Map(list.map((entry) => [entry.id, entry]));
  let day = 1;
  const labor = createLaborOrders({
    worldSeed: 9,
    rules: () => ({
      ...TEST_SOCIETY_COEFFICIENTS,
      npcAi: { ...TEST_SOCIETY_COEFFICIENTS.npcAi, houseAiEnabled: o.enabled?.() ?? 1 },
    }),
    units,
    cities: new Map([[1, {}]]),
    traitsOf: (unitId) => o.traits?.get(unitId) ?? DEFAULT_UNIT_TRAITS,
    // 짝수 유닛 = 가문 10, 홀수 = 가문 20, 100 이상 = 가문 없음
    houseOf: (unitId) => (unitId >= 100 ? undefined : unitId % 2 === 0 ? 10 : 20),
    day: () => day,
  });
  return { units, labor, nextDay: () => (day += 1) };
}

describe("가문 일 지시 런타임(laborOrders.ts)", () => {
  it("처음 점검에 일꾼 차례를 적고, 달라진 것이 없으면 다시 짜지 않는다", () => {
    const { units, labor } = setup([unit(1), unit(2), unit(3), unit(4), unit(100), unit(7, { guard: true })]);
    expect(labor.tick(0)).toEqual([1]);
    // 가문끼리 돌아가며(가문 10 → 20), 가문 없는 휴먼은 그 뒤, 경비대는 차례가 없다
    const order = [...units.values()]
      .filter((entry) => entry.laborRank !== undefined)
      .toSorted((a, b) => (a.laborRank ?? 0) - (b.laborRank ?? 0))
      .map((entry) => entry.id);
    expect(order).toEqual([2, 1, 4, 3, 100]);
    expect(units.get(7)?.laborRank).toBeUndefined();
    expect(labor.planOf(1)?.drafted).toEqual([100]);
    // 점검 주기 전에는 보지 않고, 주기가 지나도 달라진 것이 없으면 바뀐 도시가 없다
    expect(labor.tick(1_000)).toEqual([]);
    expect(labor.tick(2 * LABOR_CHECK_MS)).toEqual([]);
  });

  it("만족도가 낮고 자치 성향이 높은 가문원은 지시를 따르지 않아 일꾼에서 빠진다(날이 바뀌면 다시 굴린다)", () => {
    const rebel: UnitTraits = { ...DEFAULT_UNIT_TRAITS, autonomy: 1000, discipline: 0, communalism: 0 };
    const list = Array.from({ length: 60 }, (_, i) => unit(i + 1, { satisfactionMilli: 5_000 }));
    const { units, labor, nextDay } = setup(list, {
      traits: new Map(list.map((entry) => [entry.id, rebel])),
    });
    labor.tick(0);
    const strikers = [...units.values()].filter((entry) => entry.onStrike === true).map((entry) => entry.id);
    expect(strikers.length).toBeGreaterThan(5);
    // 일꾼 ↔ 휴먼 나눔(임금·숙박비·물류가 쓰는 함수)이 불복한 휴먼을 빼고 차례를 따른다
    const workers = cityWorkerUnits(
      { units },
      { facilities: new Map([[1, { id: 1, city: 1, workers: 60 }]]) },
      1,
    );
    expect(workers).toHaveLength(60 - strikers.length);
    for (const worker of workers) expect(strikers).not.toContain(worker.unitId);
    // 다음 날 점검: 굴림이 바뀌어 다시 짠다
    nextDay();
    expect(labor.tick(2 * LABOR_CHECK_MS)).toEqual([1]);
    const next = [...units.values()].filter((entry) => entry.onStrike === true).map((entry) => entry.id);
    expect(next).not.toEqual(strikers);
  });

  it("가문 AI 스위치를 끄면 적은 값을 지운다(옛 유닛 ID 차례)", () => {
    let enabled = 1;
    const { units, labor } = setup([unit(1), unit(2)], { enabled: () => enabled });
    labor.tick(0);
    expect(units.get(2)?.laborRank).toBe(0);
    enabled = 0;
    expect(labor.tick(10)).toEqual([1]);
    expect(units.get(2)?.laborRank).toBeUndefined();
    expect(labor.tick(20)).toEqual([]);
  });
});
