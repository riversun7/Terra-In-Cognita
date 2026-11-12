// 서버 컨디션 입력 모으기 시험 — labor/condition.ts(D-534·D-535). 판정은 @terra/sim unitCondition
import { HOME_HOUSING, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type ConditionRest, type ConditionSource, workerCondition } from "./condition.ts";

const lodging = (level: number): ConditionRest => ({
  housing: { kind: "lodging", level },
  lodgingFacility: "lodging",
});

const source = (
  rest: ConditionRest | undefined,
  food: number | undefined,
  sum = 60,
  extra: Partial<ConditionSource> = {},
): ConditionSource => ({
  initialSum: () => sum,
  rest: () => rest,
  necessitiesPm: () => food,
  ...extra,
});

describe("서버 컨디션(주거 = 쉼터 배정, 음식 = 도시 생필품 충족)", () => {
  it("숙소 Lv2(사이보그 60 선호 2등급) + 생필품 가득 = +40", () => {
    expect(workerCondition(1, 5, source(lodging(2), 1000), TEST_SOCIETY_COEFFICIENTS)).toMatchObject({
      housing: 20,
      food: 20,
      total: 40,
      housingGrade: 2,
    });
  });

  it("쉼터를 모르거나 도시를 모르면 그 몫은 0(모름), 생필품 부족이면 음수, 침대가 없어 집이면 0", () => {
    expect(workerCondition(1, 5, source(undefined, 250), TEST_SOCIETY_COEFFICIENTS)).toMatchObject({
      housing: 0,
      food: -10,
      total: -10,
    });
    expect(workerCondition(1, null, source(lodging(3), 1000), TEST_SOCIETY_COEFFICIENTS).total).toBe(0);
    expect(
      workerCondition(1, 5, source({ housing: { kind: "home" } }, 500), TEST_SOCIETY_COEFFICIENTS).total,
    ).toBe(0);
  });

  it("선호 3등급(초기 합 70 이상)인데 숙소 Lv1이면 주거 몫 −10", () => {
    expect(workerCondition(1, 5, source(lodging(1), undefined, 75), TEST_SOCIETY_COEFFICIENTS)).toMatchObject(
      {
        housing: -10,
        food: 0,
        preferredGrade: 3,
      },
    );
  });

  it("선호(D-535 1151 나): 좋아하는 음식이 도시 창고에 있고 선호 종류에서 쉬면 +, 아니면 −", () => {
    const liked = source(lodging(1), 750, 60, {
      preferences: () => ({ food: "fish", housing: "lodging" }),
      foodInCity: (_city, sub) => sub === "fish",
    });
    expect(workerCondition(1, 5, liked, TEST_SOCIETY_COEFFICIENTS)).toMatchObject({
      housingPrefer: 5,
      foodPrefer: 10,
      total: 30,
      preferences: { food: "fish", housing: "lodging" },
    });
    const missed = source(lodging(1), 750, 60, {
      preferences: () => ({ food: "crop", housing: HOME_HOUSING }),
      foodInCity: () => false,
    });
    expect(workerCondition(1, 5, missed, TEST_SOCIETY_COEFFICIENTS)).toMatchObject({
      housingPrefer: -5,
      foodPrefer: -10,
      total: 0,
    });
    // 도시를 모르면 좋아하는 음식 몫도 모름
    expect(workerCondition(1, null, liked, TEST_SOCIETY_COEFFICIENTS).foodPrefer).toBe(0);
  });
});

describe("도시 창고 식품 중분류(facilities/world.ts cityFoodSubcategories)", () => {
  it("주인 있는 도시 창고 계정의 잔고 > 0 아이템만, 건물 창고·화물·잔고 0은 뺀다", async () => {
    const { cityFoodSubcategories } = await import("../facilities/world.ts");
    const accounts = [
      { ownerId: 1, asset: "item:salmon", location: 5, balance: 3n },
      { ownerId: 2, asset: "item:wheat", location: 5, balance: 0n },
      { ownerId: 2, asset: "item:wheat", location: -4, balance: 9n },
      { ownerId: null, asset: "item:carrot", location: 6, balance: 9n },
      { ownerId: 3, asset: "credit", location: 6, balance: 9n },
      { ownerId: 3, asset: "item:ration", location: 6, balance: 1n },
    ];
    const subs: Record<string, string> = { salmon: "fish", wheat: "crop", carrot: "crop", ration: "dish" };
    const map = cityFoodSubcategories(
      // 시험용 가짜 원장(계정 목록만)
      { accounts: () => accounts.values() as never },
      (item) => subs[item],
    );
    expect([...(map.get(5) ?? [])]).toEqual(["fish"]);
    expect([...(map.get(6) ?? [])]).toEqual(["dish"]);
  });
});
