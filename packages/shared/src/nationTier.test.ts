// 국력 등급 시작 값 풀기 시험(국가 칸 → 등급 표 → 설정 칸) — docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)". 값은 시험용 가짜다.
import { describe, expect, it } from "vitest";
import {
  type NationStartDefaults,
  type NationTierJson,
  POWER_TIERS,
  nationStartTotals,
  resolveNationStart,
  tierPopulation,
  tierRank,
} from "./nationTier.ts";

const defaults: NationStartDefaults = {
  startCitiesMin: 2,
  startCitiesMax: 8,
  housing: 40,
  populationPm: 750,
  facilities: { farm: 1, lumber_camp: 1, mine: 1, storehouse: 1 },
  cityStepCells: 1,
};

const tier: NationTierJson = {
  id: "superpower",
  name: { ko: "초강대국", en: "Superpower" },
  startCities: 6,
  startHousing: 60,
  startPopulationPm: 500,
  facilities: [
    { facility: "farm", count: 2 },
    { facility: "herb_field", count: 3 },
    { facility: "mine", count: 0 },
  ],
  guardsPerCity: 6,
  startTech: 3,
  startCreditPm: 3000,
  cityStepCells: 2,
  homeGapPm: 1600,
};

describe("resolveNationStart", () => {
  it("등급도 국가 칸도 없으면 설정 칸 값(옛 규칙): 도시 수 아래 끝, 경비대 0, 기술 1, 국고 1000‰", () => {
    const start = resolveNationStart(defaults, undefined, undefined);
    expect(start).toMatchObject({
      tier: null,
      startCities: 2,
      housing: 40,
      populationPm: 750,
      populationPerCity: 30,
      guardsPerCity: 0,
      tech: 1,
      creditPm: 1000,
      cityStepCells: 1,
      homeGapPm: 1000,
    });
    expect(start.facilities).toEqual(defaults.facilities);
    expect(start.from.startCities).toBe("default");
  });

  it("등급이 없으면 국가 칸의 도시 수는 설정 칸 아래 끝~위 끝 안으로 자른다", () => {
    expect(resolveNationStart(defaults, undefined, { startCities: 9 }).startCities).toBe(8);
    expect(
      resolveNationStart({ ...defaults, startCitiesMax: 4 }, undefined, { startCities: 7 }).startCities,
    ).toBe(4);
    expect(resolveNationStart(defaults, undefined, { startCities: 1 }).startCities).toBe(2);
    expect(resolveNationStart(defaults, undefined, { startCities: 3 }).from.startCities).toBe("nation");
  });

  it("등급 값이 설정 칸을 덮고, 시설은 시설 ID마다(없는 줄은 설정 칸, 새 시설 ID도 받는다)", () => {
    const start = resolveNationStart(defaults, tier, undefined);
    expect(start).toMatchObject({
      tier: "superpower",
      startCities: 6,
      housing: 60,
      populationPm: 500,
      populationPerCity: 30,
      guardsPerCity: 6,
      tech: 3,
      creditPm: 3000,
      cityStepCells: 2,
      homeGapPm: 1600,
    });
    expect(start.facilities).toEqual({ farm: 2, lumber_camp: 1, mine: 0, storehouse: 1, herb_field: 3 });
    expect(start.from.facilities).toMatchObject({ farm: "tier", lumber_camp: "default", herb_field: "tier" });
    expect(start.from.startCities).toBe("tier");
  });

  it("국가 칸이 등급 값을 이긴다(도시 수는 등급 범위 1~8 안)", () => {
    const start = resolveNationStart(defaults, tier, {
      startCities: 9,
      startHousing: 80,
      startPopulationPm: 250,
      startFarms: 4,
      startMines: 1,
      startGuards: 2,
      startTech: 5,
    });
    expect(start).toMatchObject({
      startCities: 8,
      housing: 80,
      populationPm: 250,
      guardsPerCity: 2,
      tech: 5,
    });
    expect(start.facilities).toMatchObject({ farm: 4, mine: 1, herb_field: 3 });
    expect(start.from).toMatchObject({ startCities: "nation", housing: "nation", guardsPerCity: "nation" });
    expect(start.from.facilities.farm).toBe("nation");
  });

  it("설정 칸 위 끝이 등급의 도시 수도 막는다(아래 끝은 막지 않는다)", () => {
    const one = { ...defaults, startCitiesMin: 1, startCitiesMax: 1 };
    expect(resolveNationStart(one, tier, undefined).startCities).toBe(1);
    expect(resolveNationStart({ ...defaults, startCitiesMax: 4 }, tier, undefined).startCities).toBe(4);
    expect(resolveNationStart(defaults, { ...tier, startCities: 1 }, undefined).startCities).toBe(1);
  });

  it("합계 = 도시 수 × 도시 하나 값", () => {
    expect(nationStartTotals(resolveNationStart(defaults, tier, undefined))).toEqual({
      cities: 6,
      population: 180,
      guards: 36,
    });
    expect(tierPopulation(41, 750)).toBe(30);
  });
});

describe("tierRank", () => {
  it("강한 차례로 0부터, 등급이 없으면 중견국 자리", () => {
    expect(POWER_TIERS.map((id) => tierRank(id))).toEqual([0, 1, 2, 3, 4]);
    expect(tierRank(undefined)).toBe(2);
  });
});
