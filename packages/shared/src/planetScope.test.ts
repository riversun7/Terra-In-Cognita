import { describe, expect, it } from "vitest";
import {
  ALL_PLANETS,
  auditPlanetId,
  isPlanetId,
  parsePlanetParam,
  resolvePlanetChoice,
} from "./planetScope.ts";

describe("행성 범위", () => {
  it("주소 검색어는 행성 ID 모양만 받는다", () => {
    expect(parsePlanetParam("s2_test_planet")).toBe("s2_test_planet");
    expect(parsePlanetParam(undefined)).toBeNull();
    expect(parsePlanetParam("")).toBeNull();
    expect(parsePlanetParam("Mars")).toBeNull();
    expect(parsePlanetParam("a")).toBeNull();
    expect(parsePlanetParam("mars;drop")).toBeNull();
    // "전체"는 행성 ID가 아니다(겹치지 않는다)
    expect(isPlanetId(ALL_PLANETS)).toBe(false);
  });

  it("고른 행성: 주소 → 기억 → 대표 차례, 목록에 없는 값은 건너뛴다", () => {
    const allowed = ["earth", "mars"];
    const pick = (fromUrl: string | null, remembered: string | null) =>
      resolvePlanetChoice({ fromUrl, remembered, primary: "earth", allowed });
    expect(pick("mars", "earth")).toBe("mars");
    expect(pick(null, "mars")).toBe("mars");
    expect(pick("venus", "mars")).toBe("mars");
    expect(pick("venus", "pluto")).toBe("earth");
    expect(pick(null, null)).toBe("earth");
    // 대표가 목록에 없으면 첫 행성, 목록이 비면 모름
    expect(resolvePlanetChoice({ fromUrl: null, remembered: null, primary: "venus", allowed })).toBe("earth");
    expect(
      resolvePlanetChoice({ fromUrl: "mars", remembered: null, primary: "earth", allowed: [] }),
    ).toBeNull();
  });

  it("감사 기록 meta의 행성 ID는 모양이 맞을 때만 읽는다", () => {
    expect(auditPlanetId({ planetId: "s2_test_planet", faction: "a" })).toBe("s2_test_planet");
    expect(auditPlanetId({ planetId: 3 })).toBeNull();
    expect(auditPlanetId({ planetId: "BAD ID" })).toBeNull();
    expect(auditPlanetId(null)).toBeNull();
    expect(auditPlanetId("s2_test_planet")).toBeNull();
  });
});
