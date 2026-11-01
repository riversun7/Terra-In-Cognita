import { describe, expect, it } from "vitest";
import {
  BASIC_ELEMENTS,
  ELEMENT_IDS,
  ELEMENT_MAX,
  LIGHT_DARK_ELEMENTS,
  ENHANCED_ELEMENTS,
  checkElementAllocation,
  elementsFromArray,
  elementsToArray,
  sumElementSources,
  zeroElements,
} from "./cyborgElements.ts";

const rule = { cells: 2, points: 10 };

describe("속성 12칸(D-167·D-182)", () => {
  it("코드 차례는 기본·강화형 짝(전투 공식 칸 차례와 같다), 기본 4원소·빛어둠·강화형 묶음", () => {
    expect(ELEMENT_IDS).toEqual([
      "water",
      "frost",
      "fire",
      "blaze",
      "wind",
      "lightning",
      "earth",
      "crystal",
      "light",
      "holy",
      "dark",
      "necro",
    ]);
    expect(BASIC_ELEMENTS).toEqual(["water", "fire", "wind", "earth"]);
    expect(LIGHT_DARK_ELEMENTS).toEqual(["light", "dark"]);
    expect(ENHANCED_ELEMENTS).toEqual(["frost", "blaze", "lightning", "crystal"]);
    expect(ELEMENT_MAX).toBe(10);
  });

  it("배열(저장)과 칸 표가 서로 바뀐다. 모자라거나 틀린 칸은 0", () => {
    const values = { ...zeroElements(), fire: 7, wind: 3 };
    const array = elementsToArray(values);
    expect(array).toEqual([0, 0, 7, 0, 3, 0, 0, 0, 0, 0, 0, 0]);
    expect(elementsFromArray(array)).toEqual(values);
    expect(elementsFromArray(null)).toEqual(zeroElements());
    expect(elementsFromArray([1, "x", 2.5])).toEqual({ ...zeroElements(), water: 1 });
  });
});

describe("생성 속성 분배(D-450, N36: 4원소 가운데 두 칸까지, 합 10)", () => {
  it("두 칸에 나누거나 한 칸에 모두 넣는다", () => {
    expect(checkElementAllocation({ fire: 6, wind: 4 }, rule)).toEqual({
      ok: true,
      values: { ...zeroElements(), fire: 6, wind: 4 },
    });
    expect(checkElementAllocation({ earth: 10 }, rule)).toEqual({
      ok: true,
      values: { ...zeroElements(), earth: 10 },
    });
    // 0인 칸은 고른 칸으로 치지 않는다
    expect(checkElementAllocation({ water: 0, fire: 0, wind: 5, earth: 5 }, rule)).toMatchObject({
      ok: true,
    });
  });

  it("합이 정확히 10이어야 한다", () => {
    expect(checkElementAllocation({ fire: 6, wind: 3 }, rule)).toEqual({ ok: false, problem: "total" });
    expect(checkElementAllocation({ fire: 6, wind: 5 }, rule)).toEqual({ ok: false, problem: "total" });
    expect(checkElementAllocation({}, rule)).toEqual({ ok: false, problem: "total" });
  });

  it("세 칸 이상은 안 된다", () => {
    expect(checkElementAllocation({ water: 4, fire: 3, wind: 3 }, rule)).toEqual({
      ok: false,
      problem: "cells",
    });
  });

  it("4원소가 아닌 칸(빛·어둠·강화형)은 생성 때 넣지 못한다", () => {
    expect(checkElementAllocation({ light: 10 }, rule)).toEqual({ ok: false, problem: "not_basic" });
    expect(checkElementAllocation({ fire: 5, blaze: 5 }, rule)).toEqual({ ok: false, problem: "not_basic" });
  });

  it("칸 값은 0 이상 정수, 모르는 칸·모양은 막는다", () => {
    expect(checkElementAllocation({ fire: -1, wind: 11 }, rule)).toEqual({ ok: false, problem: "value" });
    expect(checkElementAllocation({ fire: 5.5, wind: 4.5 }, rule)).toEqual({ ok: false, problem: "value" });
    expect(checkElementAllocation({ plasma: 10 }, rule)).toEqual({ ok: false, problem: "value" });
    expect(checkElementAllocation(null, rule)).toEqual({ ok: false, problem: "value" });
    expect(checkElementAllocation([10], rule)).toEqual({ ok: false, problem: "value" });
  });

  it("칸 수·점수는 설정값이다(규칙을 넘겨받는다)", () => {
    expect(checkElementAllocation({ water: 4, fire: 4, wind: 4 }, { cells: 3, points: 12 })).toMatchObject({
      ok: true,
    });
    // 점수가 칸 상한(10)보다 크면 한 칸에 모두 넣을 수 없다
    expect(checkElementAllocation({ water: 12 }, { cells: 3, points: 12 })).toEqual({
      ok: false,
      problem: "value",
    });
  });
});

describe("속성값 합치기(D-450: 출처를 더하고 칸마다 10에서 자른다)", () => {
  it("생성·환생 값 + 장비·인공장기·신앙 출처", () => {
    const own = { ...zeroElements(), fire: 8, wind: 2, light: 5 };
    const organ = { fire: 4, frost: 3 };
    const faith = { light: 7 };
    expect(sumElementSources(own, [organ, faith])).toEqual({
      ...zeroElements(),
      fire: 10,
      wind: 2,
      frost: 3,
      light: 10,
    });
  });

  it("음수·모르는 칸은 버린다", () => {
    expect(sumElementSources(zeroElements(), [{ fire: -3, plasma: 4 }])).toEqual(zeroElements());
  });
});
