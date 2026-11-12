// 컨디션(관리 보너스, D-534) 시험 — society/condition.ts. 출발값 START_CONDITION(가득 관리 = +40 = 상한)
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "./coefficients.ts";
import {
  START_CONDITION as C,
  clampCondition,
  foodConditionPart,
  housingConditionPart,
  preferredHousingGrade,
  unitCondition,
} from "./condition.ts";

describe("선호 주거 등급([임시] 초기 합)", () => {
  it("합 50 미만 1등급, 50~69 2등급, 70 이상 3등급(사이보그 60 = 2등급)", () => {
    expect([30, 49, 50, 60, 69, 70, 80].map((sum) => preferredHousingGrade(sum, C))).toEqual([
      1, 1, 2, 2, 2, 3, 3,
    ]);
  });
});

describe("주거 몫", () => {
  it("선호 이상 숙소 +20, 한 등급 모자랄 때마다 −15, 집 0, 노숙 −20, 모름 0", () => {
    expect(housingConditionPart({ kind: "lodging", level: 2 }, 2, C)).toBe(20);
    expect(housingConditionPart({ kind: "lodging", level: 5 }, 3, C)).toBe(20);
    expect(housingConditionPart({ kind: "lodging", level: 1 }, 2, C)).toBe(5);
    expect(housingConditionPart({ kind: "lodging", level: 1 }, 3, C)).toBe(-10);
    expect(housingConditionPart({ kind: "home" }, 2, C)).toBe(0);
    expect(housingConditionPart({ kind: "homeless" }, 1, C)).toBe(-20);
    expect(housingConditionPart({ kind: "unknown" }, 3, C)).toBe(0);
  });
});

describe("음식 몫(생필품 충족 ‰)", () => {
  it("1000 = +20, 500 = 0, 0 = −20, 사이는 선형(버림), 모르면 0, 범위 밖은 자른다", () => {
    expect([1000, 750, 500, 250, 0].map((pm) => foodConditionPart(pm, C))).toEqual([20, 10, 0, -10, -20]);
    expect(foodConditionPart(null, C)).toBe(0);
    expect(foodConditionPart(5000, C)).toBe(20);
    expect(foodConditionPart(-3, C)).toBe(-20);
  });
});

describe("합계와 상한", () => {
  it("가득 관리 = +40(상한), 굶고 노숙하면 −40, 상한을 줄이면 잘린다", () => {
    const full = unitCondition({ housing: { kind: "lodging", level: 3 }, foodPm: 1000, initialSum: 60 }, C);
    expect(full).toEqual({ housing: 20, food: 20, total: 40, capped: false, preferredGrade: 2, housingGrade: 3 });
    const worst = unitCondition({ housing: { kind: "homeless" }, foodPm: 0, initialSum: 30 }, C);
    expect(worst.total).toBe(-40);
    const tight = unitCondition(
      { housing: { kind: "lodging", level: 3 }, foodPm: 1000, initialSum: 60 },
      { ...C, cap: 25 },
    );
    expect(tight).toMatchObject({ total: 25, capped: true });
    expect(clampCondition(-99, { cap: 40 })).toBe(-40);
    expect(clampCondition(7, { cap: -5 })).toBe(0);
  });

  it("세력·사회 계수표 출발값 = START_CONDITION, 초기 합 상한 휴먼·크리쳐 80", () => {
    expect(TEST_SOCIETY_COEFFICIENTS.condition).toEqual(C);
    expect(TEST_SOCIETY_COEFFICIENTS.statSums).toEqual({ humanMax: 80, creatureMax: 80 });
  });
});
