// 시설 분류 시험 — 기획 D-560 시설 분류표(이름표 차례·생산 단계에서 고르기)
import { describe, expect, it } from "vitest";
import { FACILITY_CATEGORIES, facilityCategoryOf, isFacilityCategory } from "./facilityCategory.ts";

describe("facilityCategory", () => {
  it("분류는 아홉 가지(기획 분류표 차례)", () => {
    expect(FACILITY_CATEGORIES).toEqual([
      "administration",
      "gathering",
      "processing",
      "storage",
      "housing",
      "public",
      "commerce",
      "transport",
      "military",
    ]);
    expect(isFacilityCategory("commerce")).toBe(true);
    expect(isFacilityCategory("gather")).toBe(false);
    expect(isFacilityCategory(3)).toBe(false);
  });
  it("팩 칸이 있으면 그 값, 없으면 생산 단계에서 고른다", () => {
    expect(facilityCategoryOf({ stage: "gather", category: "commerce" })).toBe("commerce");
    expect(facilityCategoryOf({ stage: "gather" })).toBe("gathering");
    expect(facilityCategoryOf({ stage: "finish" })).toBe("processing");
    expect(facilityCategoryOf({ stage: "government" })).toBe("administration");
    expect(facilityCategoryOf({ stage: "medical" })).toBe("public");
    expect(facilityCategoryOf({ stage: "living" })).toBe("housing");
    expect(facilityCategoryOf({ stage: "defense" })).toBe("military");
    expect(facilityCategoryOf({ stage: "territory" })).toBe("military");
    expect(facilityCategoryOf({ stage: "transport" })).toBe("transport");
    expect(facilityCategoryOf({ stage: "toString" })).toBe("public");
  });
});
