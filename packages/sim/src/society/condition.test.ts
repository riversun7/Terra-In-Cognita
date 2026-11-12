// 컨디션(관리 보너스, D-534) 시험 — society/condition.ts. 출발값 START_CONDITION(가득 관리 = +40 = 상한)
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "./coefficients.ts";
import {
  START_CONDITION as C,
  clampCondition,
  HOME_HOUSING,
  foodConditionPart,
  foodPreferencePart,
  housingConditionPart,
  housingPreferencePart,
  preferredHousingGrade,
  unitCondition,
  unitPreferences,
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
    expect(full).toEqual({
      housing: 20,
      food: 20,
      housingPrefer: 0,
      foodPrefer: 0,
      total: 40,
      capped: false,
      preferredGrade: 2,
      housingGrade: 3,
    });
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

describe("선호(D-535 1151 나)", () => {
  const choices = { foods: ["fish", "crop", "dish", "herb"], housings: ["lodging", HOME_HOUSING] };

  it("(시드, 유닛)으로 정해지고 후보 차례와 상관없다, 유닛마다 고루 퍼진다", () => {
    const a = unitPreferences(42, 7, choices);
    expect(
      unitPreferences(42, 7, { foods: [...choices.foods].reverse(), housings: ["home", "lodging"] }),
    ).toEqual(a);
    expect(choices.foods).toContain(a.food);
    const foods = new Set<string | null>();
    const housings = new Set<string | null>();
    for (let id = 1; id <= 200; id++) {
      const p = unitPreferences(42, id, choices);
      foods.add(p.food);
      housings.add(p.housing);
    }
    expect(foods.size).toBe(4);
    expect(housings.size).toBe(2);
    expect(unitPreferences(42, 7, { foods: [], housings: [] })).toEqual({ food: null, housing: null });
  });

  it("주거: 선호 종류에서 쉬면 +5, 아니면 −5, 노숙은 늘 −5, 모르면 0", () => {
    expect(housingPreferencePart({ kind: "lodging", level: 1 }, "lodging", "lodging", C)).toBe(5);
    expect(housingPreferencePart({ kind: "lodging", level: 1 }, "lodging", undefined, C)).toBe(5);
    expect(housingPreferencePart({ kind: "lodging", level: 1 }, HOME_HOUSING, "lodging", C)).toBe(-5);
    expect(housingPreferencePart({ kind: "home" }, HOME_HOUSING, undefined, C)).toBe(5);
    expect(housingPreferencePart({ kind: "home" }, "lodging", undefined, C)).toBe(-5);
    expect(housingPreferencePart({ kind: "homeless" }, HOME_HOUSING, undefined, C)).toBe(-5);
    expect(housingPreferencePart({ kind: "unknown" }, HOME_HOUSING, undefined, C)).toBe(0);
    expect(housingPreferencePart({ kind: "home" }, null, undefined, C)).toBe(0);
  });

  it("음식: 좋아하는 중분류가 있으면 +10, 없으면 −10, 모르면 0", () => {
    expect(foodPreferencePart("fish", true, C)).toBe(10);
    expect(foodPreferencePart("fish", false, C)).toBe(-10);
    expect(foodPreferencePart("fish", null, C)).toBe(0);
    expect(foodPreferencePart(null, true, C)).toBe(0);
  });

  it("합계에 더한 뒤 상한으로 자른다: 관리가 같아도 선호가 맞으면 +15, 어긋나면 −15", () => {
    const base = { housing: { kind: "lodging", level: 1 } as const, foodPm: 750, initialSum: 60 };
    const plain = unitCondition(base, C).total;
    const liked = unitCondition(
      {
        ...base,
        preferences: { food: "fish", housing: "lodging" },
        lodgingFacility: "lodging",
        foodLiked: true,
      },
      C,
    );
    const disliked = unitCondition(
      {
        ...base,
        preferences: { food: "fish", housing: HOME_HOUSING },
        lodgingFacility: "lodging",
        foodLiked: false,
      },
      C,
    );
    expect(plain).toBe(15);
    expect(liked).toMatchObject({ housingPrefer: 5, foodPrefer: 10, total: 30 });
    expect(disliked).toMatchObject({ housingPrefer: -5, foodPrefer: -10, total: 0 });
    const full = unitCondition(
      {
        housing: { kind: "lodging", level: 3 },
        foodPm: 1000,
        initialSum: 60,
        preferences: { food: "fish", housing: "lodging" },
        foodLiked: true,
      },
      C,
    );
    expect(full).toMatchObject({ total: 40, capped: true });
  });
});
