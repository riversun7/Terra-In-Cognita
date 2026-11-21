// 시설 줄 도시 채우기(places.ts fillCityOf): 알박기 중(도시 없는 행정 건물)은 영토 지방 도시로 채우지 않는다(D-572·D-568)
import { describe, expect, it } from "vitest";
import { fillCityOf } from "./places.ts";

describe("fillCityOf", () => {
  it("도시가 빈 일반 시설은 칸 판정 도시(영토 지방 포함)로 채운다", () => {
    expect(fillCityOf({ cityId: null }, "production", () => 12)).toBe(12);
    expect(fillCityOf({ cityId: null }, undefined, () => 12)).toBe(12);
  });

  it("이미 도시가 있으면 채우지 않는다(칸 판정도 하지 않는다)", () => {
    let asked = 0;
    const place = (): number => {
      asked += 1;
      return 12;
    };
    expect(fillCityOf({ cityId: 4 }, "production", place)).toBeNull();
    expect(asked).toBe(0);
  });

  it("도시 없는 행정 건물(알박기 중)은 남의 영토 지방 안이어도 채우지 않는다", () => {
    let asked = 0;
    const province = (): number => {
      asked += 1;
      return 12;
    };
    expect(fillCityOf({ cityId: null }, "government", province)).toBeNull();
    expect(asked).toBe(0);
  });

  it("칸 판정이 도시를 모르면(영토 밖·셈 전) 채우지 않는다", () => {
    expect(fillCityOf({ cityId: null }, "production", () => null)).toBeNull();
    expect(fillCityOf({ cityId: null }, "production", () => undefined)).toBeNull();
  });
});
