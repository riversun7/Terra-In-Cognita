// 행성 보관함 이름·시작점 규칙 시험
import { describe, expect, it } from "vitest";
import {
  PLANET_LIBRARY_NAME_MAX,
  isPlanetLibraryBase,
  normalizePlanetLibraryName,
} from "./planetLibraryApi.ts";

describe("보관함 이름", () => {
  it("앞뒤 빈칸을 떼고 1~상한 코드 포인트만 받는다", () => {
    expect(normalizePlanetLibraryName("  지구형 행성 1 ")).toBe("지구형 행성 1");
    expect(normalizePlanetLibraryName("   ")).toBeNull();
    expect(normalizePlanetLibraryName("가".repeat(PLANET_LIBRARY_NAME_MAX))).toHaveLength(
      PLANET_LIBRARY_NAME_MAX,
    );
    expect(normalizePlanetLibraryName("가".repeat(PLANET_LIBRARY_NAME_MAX + 1))).toBeNull();
    // 그림 문자(대리 문자 쌍)는 한 글자로 센다
    expect(normalizePlanetLibraryName("🪐".repeat(PLANET_LIBRARY_NAME_MAX))).not.toBeNull();
  });

  it("제어 문자·DB에 담을 수 없는 글자·문자열이 아닌 값은 받지 않는다", () => {
    expect(normalizePlanetLibraryName("a\nb")).toBeNull();
    expect(normalizePlanetLibraryName("a\u0000b")).toBeNull();
    expect(normalizePlanetLibraryName("a\ud800b")).toBeNull();
    expect(normalizePlanetLibraryName(42)).toBeNull();
  });
});

describe("시작점", () => {
  it("팩 행성만(콘텐츠 ID 규칙)", () => {
    expect(isPlanetLibraryBase({ kind: "pack", id: "s2_editor_planet" })).toBe(true);
    expect(isPlanetLibraryBase({ kind: "template", id: "earth" })).toBe(false);
    expect(isPlanetLibraryBase({ kind: "pack", id: "Bad Id" })).toBe(false);
    expect(isPlanetLibraryBase(null)).toBe(false);
  });
});
