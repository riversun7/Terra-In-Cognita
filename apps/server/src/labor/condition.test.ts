// 서버 컨디션 입력 모으기 시험 — labor/condition.ts(D-534). 판정은 @terra/sim unitCondition
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type ConditionSource, workerCondition } from "./condition.ts";

const source = (lodging: number | undefined, food: number | undefined, sum = 60): ConditionSource => ({
  initialSum: () => sum,
  lodgingLevel: () => lodging,
  necessitiesPm: () => food,
});

describe("서버 컨디션(주거 = 주인의 그 도시 숙소, 음식 = 도시 생필품 충족)", () => {
  it("숙소 Lv2(사이보그 60 선호 2등급) + 생필품 가득 = +40", () => {
    expect(workerCondition(1, 5, source(2, 1000), TEST_SOCIETY_COEFFICIENTS)).toMatchObject({
      housing: 20,
      food: 20,
      total: 40,
      housingGrade: 2,
    });
  });

  it("숙소가 없거나 도시를 모르면 그 몫은 0(모름), 생필품 부족이면 음수", () => {
    expect(workerCondition(1, 5, source(undefined, 250), TEST_SOCIETY_COEFFICIENTS)).toMatchObject({
      housing: 0,
      food: -10,
      total: -10,
    });
    expect(workerCondition(1, null, source(3, 1000), TEST_SOCIETY_COEFFICIENTS).total).toBe(0);
  });

  it("선호 3등급(초기 합 70 이상)인데 숙소 Lv1이면 주거 몫 −10", () => {
    expect(workerCondition(1, 5, source(1, undefined, 75), TEST_SOCIETY_COEFFICIENTS)).toMatchObject({
      housing: -10,
      food: 0,
      preferredGrade: 3,
    });
  });
});
