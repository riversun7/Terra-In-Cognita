// 일꾼 쉼터·채집소 옮김 계획(cityRest.ts) 시험 — 질문 1047 다·1050 가(D-533)
import { TEST_SOCIETY_COEFFICIENTS, restDutyPm } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type CityRestInput, planCityRest } from "./cityRest.ts";

const rules = TEST_SOCIETY_COEFFICIENTS;
const area = (x: number, y: number) => ({ x, y, radius: 4 });

/** 시청 (100,100), 채집소 (130,100), 창고 (122,100) */
const base: CityRestInput = {
  facilities: [{ id: 7, buildingId: 7, workers: 3, station: true }],
  areas: new Map([[7, area(130, 100)]]),
  lodgings: [],
  home: { x: 100, y: 100 },
  housing: 40,
  stores: [{ x: 122, y: 100 }],
  rules,
};

describe("planCityRest", () => {
  it("숙소가 없으면 집에서 쉬고(배율 = 집 + 거리), 옮김 칸은 가장 가까운 창고", () => {
    const plan = planCityRest(base);
    expect(plan.workers.map((w) => w.place.kind)).toEqual(["home", "home", "home"]);
    expect(plan.workers[0]?.commuteCells).toBe(30);
    expect(plan.facilities.get(7)).toEqual({ dutyPm: restDutyPm({ kind: "home" }, 30, rules), haulCells: 8 });
  });

  it("창고가 없으면 시청 칸까지 나른다", () => {
    expect(planCityRest({ ...base, stores: [] }).facilities.get(7)?.haulCells).toBe(30);
  });

  it("길 위 숙소를 먼저 고르고, 침대가 차면 다음 숙소·집", () => {
    const lodgings = [
      // 뒤쪽(시청 너머) 숙소: 돌아감이 크다
      { id: 50, area: area(80, 100), level: 1, ownerId: 1 },
      // 길 위 숙소
      { id: 60, area: area(115, 100), level: 1, ownerId: 1 },
    ];
    const rulesSmall = { ...rules, logistics: { ...rules.logistics, lodgingBedsPerLevel: 2 } };
    const plan = planCityRest({
      ...base,
      facilities: [{ id: 7, buildingId: 7, workers: 5, station: true }],
      lodgings,
      rules: rulesSmall,
    });
    expect(plan.workers.map((w) => w.lodgingId)).toEqual([60, 60, 50, 50, null]);
    expect(plan.occupancy.get(60)).toBe(2);
    expect(plan.beds.get(50)).toBe(2);
    expect(plan.workers[0]?.commuteCells).toBe(15);
    // 길 위 숙소 일꾼이 먼 숙소 일꾼보다 배율이 높다
    const onRoute = restDutyPm({ kind: "lodging", level: 1 }, 15, rulesSmall);
    const offRoute = restDutyPm({ kind: "lodging", level: 1 }, 50, rulesSmall);
    expect(onRoute).toBeGreaterThan(offRoute);
  });

  it("자리 수 = 주거 + 침대 합(질문 1089 나): 넘친 일꾼은 노숙", () => {
    const plan = planCityRest({
      ...base,
      housing: 2,
      facilities: [{ id: 7, buildingId: 7, workers: 4, station: true }],
    });
    expect(plan.workers.map((w) => w.place.kind)).toEqual(["home", "home", "homeless", "homeless"]);
    const lodged = planCityRest({
      ...base,
      housing: 2,
      lodgings: [{ id: 60, area: area(115, 100), level: 1, ownerId: 1 }],
      facilities: [{ id: 7, buildingId: 7, workers: 4, station: true }],
    });
    // 숙소 침대 10이 주거가 되어 넷 모두 숙소
    expect(lodged.workers.every((w) => w.place.kind === "lodging")).toBe(true);
    expect(lodged.bedTotal).toBe(10);
    // 침대 2 + 집 2 = 넷까지, 다섯째는 노숙(예전 max(주거, 침대)면 둘째 숙소 뒤 둘이 노숙)
    const mixed = planCityRest({
      ...base,
      housing: 2,
      rules: { ...rules, logistics: { ...rules.logistics, lodgingBedsPerLevel: 2 } },
      lodgings: [{ id: 60, area: area(115, 100), level: 1, ownerId: 1 }],
      facilities: [{ id: 7, buildingId: 7, workers: 5, station: true }],
    });
    expect(mixed.workers.map((w) => w.place.kind)).toEqual([
      "lodging",
      "lodging",
      "home",
      "home",
      "homeless",
    ]);
  });

  it("도시 직무(건물 없음)는 옮김 칸 0", () => {
    const plan = planCityRest({ ...base, facilities: [{ id: 9, buildingId: null, workers: 1 }] });
    expect(plan.facilities.get(9)?.haulCells).toBe(0);
  });
});
