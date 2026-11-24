// 건물별 접근 권한 판정(access.ts) 및 외부인 건설 정책(landRule.ts) 단위 시험 — ADR 2026-11-25-building-access-and-foreign-build.md
import { defaultBuildingAccessScope } from "@terra/shared/facilities";
import { describe, expect, it } from "vitest";
import { type BuildingAccessEvalInput, evaluateBuildingAccess } from "./access.ts";
import { landVerdict } from "./landRule.ts";

const baseInput = (over: Partial<BuildingAccessEvalInput> = {}): BuildingAccessEvalInput => ({
  scope: "anyone",
  isOwner: false,
  isOperator: false,
  isBlacklisted: false,
  userNationId: null,
  userHouseCityId: null,
  isCityResident: false,
  cityId: 10,
  cityNationId: 100,
  ...over,
});

describe("건물별 접근 권한(defaultBuildingAccessScope · evaluateBuildingAccess)", () => {
  it("기본 범위: 정부 건물만 nation_citizen, 거래소·채집소·의료·종교·생활 등 경제·공공 시설은 anyone", () => {
    expect(defaultBuildingAccessScope("government")).toBe("nation_citizen");
    expect(defaultBuildingAccessScope("gathering")).toBe("anyone");
    expect(defaultBuildingAccessScope("living")).toBe("anyone");
    expect(defaultBuildingAccessScope("medical")).toBe("anyone");
    expect(defaultBuildingAccessScope("religion")).toBe("anyone");
    expect(defaultBuildingAccessScope(undefined)).toBe("anyone");
  });

  it("anyone: 외부인·블랙리스트 포함 누구나 이용 가능", () => {
    expect(evaluateBuildingAccess(baseInput({ scope: "anyone", isBlacklisted: true }))).toEqual({
      allowed: true,
    });
  });

  it("건물 주인과 운영자 모드는 범위·블랙리스트와 무관하게 항상 허용", () => {
    expect(
      evaluateBuildingAccess(baseInput({ scope: "nation_citizen", isOwner: true, isBlacklisted: true })),
    ).toEqual({ allowed: true });
    expect(
      evaluateBuildingAccess(baseInput({ scope: "city_house", isOperator: true, isBlacklisted: true })),
    ).toEqual({ allowed: true });
  });

  it("city_resident: 도시 거주자 또는 도시 소속 가문원만 허용, 블랙리스트는 차단", () => {
    expect(evaluateBuildingAccess(baseInput({ scope: "city_resident" }))).toEqual({
      allowed: false,
      reason: "city_resident",
    });
    expect(evaluateBuildingAccess(baseInput({ scope: "city_resident", isCityResident: true }))).toEqual({
      allowed: true,
    });
    expect(evaluateBuildingAccess(baseInput({ scope: "city_resident", userHouseCityId: 10 }))).toEqual({
      allowed: true,
    });
    expect(
      evaluateBuildingAccess(
        baseInput({ scope: "city_resident", isCityResident: true, isBlacklisted: true }),
      ),
    ).toEqual({ allowed: false, reason: "blacklisted" });
  });

  it("city_house: 도시 소속 가문원만 허용(단순 거주자·다른 도시 시민 차단)", () => {
    expect(
      evaluateBuildingAccess(
        baseInput({ scope: "city_house", isCityResident: true, userNationId: 100, userHouseCityId: 11 }),
      ),
    ).toEqual({ allowed: false, reason: "city_house" });
    expect(evaluateBuildingAccess(baseInput({ scope: "city_house", userHouseCityId: 10 }))).toEqual({
      allowed: true,
    });
  });

  it("nation_citizen: 같은 나라 시민만 허용(다른 도시 소속이어도 가능, 무소속·타국·블랙리스트 차단)", () => {
    expect(evaluateBuildingAccess(baseInput({ scope: "nation_citizen", userNationId: null }))).toEqual({
      allowed: false,
      reason: "nation_citizen",
    });
    expect(evaluateBuildingAccess(baseInput({ scope: "nation_citizen", userNationId: 200 }))).toEqual({
      allowed: false,
      reason: "nation_citizen",
    });
    expect(
      evaluateBuildingAccess(baseInput({ scope: "nation_citizen", userNationId: 100, userHouseCityId: 99 })),
    ).toEqual({ allowed: true });
    expect(
      evaluateBuildingAccess(baseInput({ scope: "nation_citizen", userNationId: 100, isBlacklisted: true })),
    ).toEqual({ allowed: false, reason: "blacklisted" });
  });
});

describe("외부인 건설 정책(landVerdict)", () => {
  it("NPC 도시: foreignAllow=true이면 비적대 외부인·무소속 건설 허용, hostile=true면 항상 차단", () => {
    expect(landVerdict([], [{ faction: 20, foreignAllow: false }])).toEqual({
      allowed: false,
      reason: "foreign_city",
      cityFaction: 20,
    });
    expect(landVerdict([], [{ faction: 20, foreignAllow: true, hostile: false }])).toEqual({
      allowed: true,
    });
    expect(landVerdict([30], [{ faction: 20, foreignAllow: true, hostile: true }])).toEqual({
      allowed: false,
      reason: "foreign_city",
      cityFaction: 20,
    });
  });

  it("가문 도시: 다른 나라 외부인도 foreignAllow=true·비적대면 허용, 전쟁 중이면 차단", () => {
    expect(
      landVerdict(
        [99],
        [{ faction: 50, house: { sameNation: false, allow: false }, foreignAllow: true, hostile: false }],
      ),
    ).toEqual({ allowed: true });
    expect(
      landVerdict(
        [99],
        [{ faction: 50, house: { sameNation: false, allow: false }, foreignAllow: true, hostile: true }],
      ),
    ).toEqual({ allowed: false, reason: "foreign_city", cityFaction: 50 });
  });
});
