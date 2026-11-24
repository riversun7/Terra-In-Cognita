import type { CityLaborPlan } from "@terra/sim/npcAi";
import { houseStatusOf } from "@terra/sim/npcAi";
import { describe, expect, it } from "vitest";
import {
  type MonitorBody,
  type MonitorCityEcon,
  type MonitorUnitInput,
  STUCK_AFTER_MS,
  buildAiMonitor,
} from "./aiMonitor.ts";

const body = (patch: Partial<MonitorBody> = {}): MonitorBody => ({
  activity: "post",
  worker: true,
  moving: false,
  idleMs: 30_000,
  ...patch,
});

const unit = (id: number, patch: Partial<MonitorUnitInput> = {}): MonitorUnitInput => ({
  id,
  city: 1,
  satisfactionMilli: 60_000,
  fedPm: 1000,
  paidToday: 50,
  injuryStage: 0,
  houseId: null,
  body: body(),
  ...patch,
});

const econ = (patch: Partial<MonitorCityEcon> = {}): MonitorCityEcon => ({
  rests: [],
  beds: 0,
  bedsUsed: 0,
  capBeds: 0,
  facilities: [],
  stocks: [],
  due: 0,
  short: 0,
  treasury: null,
  currency: null,
  ...patch,
});

const plan = (patch: Partial<CityLaborPlan> = {}): CityLaborPlan => ({
  order: [],
  refused: [],
  drafted: [],
  houses: new Map(),
  ...patch,
});

const facility = (id: number, workers: number, running: boolean) => ({
  id,
  buildingId: id,
  facility: "farm",
  recipe: "grain",
  level: 1,
  workers,
  running,
  endsAtMs: running ? 5_000 : null,
  dutyPm: 1000,
});

const view = (o: {
  units: MonitorUnitInput[];
  cities?: Map<number, { owner: number; housing: number }>;
  econOf?: (cityId: number) => MonitorCityEcon | undefined;
  planOf?: (cityId: number) => CityLaborPlan | undefined;
  cityId?: number;
}) =>
  buildAiMonitor({
    nowMs: 1_000,
    day: 3,
    switches: { npcAi: 1, unitAi: 1, houseAi: 1 },
    units: o.units,
    cities: o.cities ?? new Map([[1, { owner: 10, housing: 100 }]]),
    planOf: o.planOf ?? (() => undefined),
    cityName: (id) => `city-${String(id)}`,
    econOf: o.econOf ?? (() => undefined),
    lastHouseDay: null,
    lastLaborChange: null,
    laborChanges: 0,
    housesOf: () => [{ id: 7, name: "house", head: 1, vault: "120" }],
    cityId: o.cityId,
    unfedBelowPm: 500,
  });

describe("AI 작동 모니터 집계", () => {
  it("유닛마다 문제를 붙이고 여섯 기둥으로 센다", () => {
    const out = view({
      units: [
        unit(1),
        unit(2, { fedPm: 200 }),
        unit(3, { paidToday: 0 }),
        unit(4, { injuryStage: 2, body: body({ activity: "rest" }) }),
        unit(5, { onStrike: true, body: body({ worker: false, activity: "rest" }) }),
        unit(6, { body: body({ idleMs: STUCK_AFTER_MS }) }),
        unit(7, { body: null }),
        unit(8, {
          guard: true,
          paidToday: undefined,
          body: body({ worker: false, activity: "patrol", moving: true, idleMs: 0 }),
        }),
        unit(9, { fedPm: undefined, body: body({ activity: "travel", idleMs: STUCK_AFTER_MS * 3 }) }),
      ],
    });
    const t = out.totals;
    expect([t.humans, t.guards]).toEqual([8, 1]);
    expect(t.food).toEqual({ ok: 7, bad: 1, unknown: 1 });
    expect(t.income).toEqual({ workers: 6, idle: 2, paid: 7, unpaid: 1 });
    expect(t.recovery).toEqual({ injured: 1, down: 0 });
    // 다른 곳에 간 유닛은 오래 서 있어도 멈춤으로 세지 않는다
    expect(t.motion).toEqual({ moving: 1, standing: 5, stuck: 1, offMap: 1, away: 1 });
    expect(t.order.strikes).toBe(1);
    expect(t.byIssue).toEqual({
      unfed: 1,
      unpaid: 1,
      homeless: 0,
      injured: 1,
      strike: 1,
      stuck: 1,
      off_map: 1,
    });
    expect(t.issues).toBe(6);
    expect(t.activity.post).toBe(4);
    expect(t.activity.none).toBe(1);
    // 도시를 고르지 않으면 문제 유닛만 싣는다
    expect(out.units.map((row) => row.id).toSorted((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(out.city).toBeNull();
  });

  it("주거: 일꾼은 쉼터 계획 자리, 나머지는 남은 주거 수까지 집, 그 뒤는 노숙", () => {
    const out = view({
      units: [
        unit(1, { laborRank: 0 }),
        unit(2, { laborRank: 1 }),
        unit(3, { laborRank: 2 }),
        unit(4, { body: body({ worker: false, activity: "rest" }) }),
        unit(5, { body: body({ worker: false, activity: "rest" }) }),
        unit(6, { guard: true }),
      ],
      cities: new Map([[1, { owner: 10, housing: 2 }]]),
      econOf: () => econ({ rests: ["lodging", "home", "homeless"], beds: 1, bedsUsed: 1, capBeds: 1 }),
      cityId: 1,
    });
    const city = out.cities[0];
    expect(city?.housing).toEqual({ lodging: 1, home: 2, homeless: 3 });
    expect(city?.cap).toBe(3);
    const housingOf = new Map(out.units.map((row) => [row.id, row.housing]));
    expect(housingOf.get(1)).toBe("lodging");
    expect(housingOf.get(3)).toBe("homeless");
    expect(housingOf.get(4)).toBe("home");
    expect(housingOf.get(6)).toBe("homeless");
    // 도시를 고르면 그 도시 유닛을 모두 싣는다(문제 많은 차례)
    expect(out.units).toHaveLength(6);
    expect(out.unitsFound).toBe(6);
  });

  it("도시: 생산(도는·멈춘·일꾼 없는 시설)과 생필품 재고·못 낸 몫", () => {
    const out = view({
      units: [unit(1)],
      econOf: () =>
        econ({
          facilities: [facility(1, 2, true), facility(2, 1, false), facility(3, 0, false)],
          stocks: [
            { asset: "food", have: "30", perRound: "10", rounds: 3, periodHours: 6, coverHours: 18 },
            { asset: "water", have: "500", perRound: "10", rounds: 50, periodHours: 6, coverHours: 300 },
          ],
          due: 10,
          short: 4,
          treasury: "900",
          currency: "cur_a",
        }),
      cityId: 1,
    });
    const city = out.cities[0];
    expect(city?.production).toEqual({ facilities: 3, running: 1, stalled: 1, unstaffed: 1 });
    expect(city?.minCoverHours).toBe(18);
    expect([city?.due, city?.short]).toEqual([10, 4]);
    expect([out.totals.due, out.totals.short]).toEqual([10, 4]);
    expect(out.totals.stalled).toBe(1);
    expect(out.city?.facilities).toHaveLength(3);
    expect(out.city?.treasury).toBe("900");
  });

  it("가문: 고른 도시의 가문원을 같은 기둥으로 세고 깃발·금고를 붙인다", () => {
    const out = view({
      units: [unit(1, { houseId: 7, fedPm: 100 }), unit(2, { houseId: 7 }), unit(3)],
      planOf: () =>
        plan({
          drafted: [3],
          houses: new Map([[7, { status: houseStatusOf([]), flags: ["food_short"] }]]),
        }),
      cityId: 1,
    });
    const house = out.city?.houses[0];
    expect(house?.humans).toBe(2);
    expect(house?.food).toEqual({ ok: 1, bad: 1, unknown: 0 });
    expect(house?.flags).toEqual(["food_short"]);
    expect(house?.vault).toBe("120");
    expect(out.cities[0]?.drafted).toBe(1);
    expect(out.totals.flaggedHouses).toBe(1);
  });

  it("문제 유닛이 많은 도시가 앞에 온다. 없는 도시를 고르면 도시 상세가 없다", () => {
    const out = view({
      units: [unit(1, { city: 1 }), unit(2, { city: 2, fedPm: 0 })],
      cities: new Map([
        [1, { owner: 10, housing: 10 }],
        [2, { owner: 10, housing: 10 }],
      ]),
      cityId: 99,
    });
    expect(out.cities.map((city) => city.id)).toEqual([2, 1]);
    expect(out.city).toBeNull();
  });
});
