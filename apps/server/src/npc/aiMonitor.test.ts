import { planCityLabor } from "@terra/sim/npcAi";
import { describe, expect, it } from "vitest";
import { buildAiMonitor } from "./aiMonitor.ts";

const member = (unitId: number, fedPm = 1000, satisfactionMilli = 70_000) => ({
  unitId,
  workPm: 500,
  obediencePm: 1000,
  fedPm,
  satisfactionMilli,
});

describe("NPC AI 작동 모니터(aiMonitor.ts)", () => {
  const plan = planCityLabor({
    houses: [
      { houseId: 10, members: [member(1, 0), member(2)] },
      { houseId: 20, members: [member(3)] },
    ],
    unhoused: [member(4)],
    day: 1,
    seed: 1,
  });
  const base = {
    nowMs: 5000,
    day: 3,
    switches: { npcAi: 1, unitAi: 1, houseAi: 1 },
    cities: new Map([
      [1, { owner: 7 }],
      [2, { owner: 8 }],
    ]),
    planOf: (cityId: number) => (cityId === 1 ? plan : undefined),
    cityName: (cityId: number) => (cityId === 1 ? "한밭" : undefined),
    lastHouseDay: { atMs: 4000, taxed: 3, cared: 1 },
    lastLaborChange: null,
    laborChanges: 0,
    housesOf: () => [],
    unfedBelowPm: 500,
  };
  const units = [
    { city: 1, satisfactionMilli: 80_000, fedPm: 0, paidToday: 0, onStrike: true },
    { city: 1, satisfactionMilli: 60_000, fedPm: 1000, paidToday: 100 },
    { city: 1, satisfactionMilli: 40_000, guard: true },
    { city: 2, satisfactionMilli: 50_000 },
    // 도시 밖(노숙)은 세지 않는다
    { city: -1, satisfactionMilli: 10_000 },
  ];

  it("도시마다 휴먼·불복·못 받음·못 먹음·가문 깃발을 세고 합계를 낸다. 불복이 많은 도시가 앞에 온다", () => {
    const view = buildAiMonitor({ ...base, units });
    expect(view.cities.map((city) => city.id)).toEqual([1, 2]);
    expect(view.cities[0]).toMatchObject({
      name: "한밭",
      humans: 2,
      guards: 1,
      strikes: 1,
      drafted: 1,
      unpaid: 1,
      unfed: 1,
      avgSatisfaction: 60,
      avgFedPm: 500,
      houses: 2,
      flags: { food_short: 1, morale_low: 0, unruly: 0 },
    });
    expect(view.cities[1]).toMatchObject({ name: null, humans: 1, avgFedPm: null, houses: 0 });
    expect(view.totals).toMatchObject({
      cities: 2,
      humans: 3,
      guards: 1,
      strikes: 1,
      houses: 2,
      flaggedHouses: 1,
    });
    expect(view.lastHouseDay).toEqual({ atMs: 4000, taxed: 3, cared: 1 });
    expect(view.city).toBeNull();
  });

  it("도시를 고르면 그 도시 가문 표를 붙인다. 없는 도시면 붙이지 않는다", () => {
    const houses = [
      { id: 10, name: "등대", head: 1, status: plan.houses.get(10)!.status, flags: [], vault: "300" },
    ];
    expect(buildAiMonitor({ ...base, units, cityId: 1, housesOf: () => houses }).city).toEqual({
      id: 1,
      houses,
    });
    expect(buildAiMonitor({ ...base, units, cityId: 99 }).city).toBeNull();
  });
});
