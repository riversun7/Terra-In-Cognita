// 도시 배후지 셈 시험(docs/adr/2026-11-11-city-catchment.md)
import { describe, expect, it } from "vitest";
import {
  MATERIAL_BIT,
  cellMaterials,
  cityGapMilli,
  countMaterials,
  coveragePm,
  materialOfFacility,
  siteScore,
  weightsOfFacilities,
} from "./catchment.ts";

const T = { lumberMinForestPct: 5, mineMinHeightM: 500, farmMinTempC: 5, farmMinRainMm: 250 };
const LAND = { forest: 0, elevationM: 100, temperatureC: 15, precipitationMm: 400, water: 0 };

describe("칸 원자재", () => {
  it("숲 → 목재·약초, 농사지을 땅 → 작물·축산물·약초, 높은 땅 → 광석, 물 비트 → 어류", () => {
    expect(cellMaterials(undefined, T)).toBe(0);
    expect(cellMaterials(LAND, T)).toBe(MATERIAL_BIT.crop | MATERIAL_BIT.livestock | MATERIAL_BIT.herb);
    expect(cellMaterials({ ...LAND, temperatureC: 0, forest: 13 }, T)).toBe(
      MATERIAL_BIT.wood | MATERIAL_BIT.herb,
    );
    expect(cellMaterials({ ...LAND, temperatureC: 0, elevationM: 500 }, T)).toBe(MATERIAL_BIT.ore);
    // 강·해안 칸: 땅 원자재 + 어류. 바다·호수 칸: 어류만
    expect(cellMaterials({ ...LAND, water: 4 }, T) & MATERIAL_BIT.fish).toBe(MATERIAL_BIT.fish);
    expect(cellMaterials({ ...LAND, water: 4 }, T) & MATERIAL_BIT.crop).toBe(MATERIAL_BIT.crop);
    expect(cellMaterials({ ...LAND, water: 1, forest: 200, elevationM: 900 }, T)).toBe(MATERIAL_BIT.fish);
  });

  it("시설 ↔ 원자재", () => {
    expect(materialOfFacility("mine")).toBe("ore");
    expect(materialOfFacility("fishing_spot")).toBe("fish");
    expect(materialOfFacility("storehouse")).toBeUndefined();
  });
});

describe("배후지 덮임", () => {
  it("원자재마다 칸 몫을 시설 수로 가중 평균(내림), 가중치 0은 보지 않는다", () => {
    const counts = countMaterials([
      MATERIAL_BIT.crop | MATERIAL_BIT.wood,
      MATERIAL_BIT.crop,
      MATERIAL_BIT.ore,
      0,
    ]);
    expect(counts).toEqual({ ore: 1, wood: 1, herb: 0, crop: 2, livestock: 0, fish: 0 });
    // 작물 500 × 2 + 목재 250 × 1 + 광석 250 × 1 = 1500 ÷ 4 = 375
    expect(coveragePm(counts, 4, { crop: 2, wood: 1, ore: 1 })).toBe(375);
    expect(coveragePm(counts, 4, { fish: 1 })).toBe(0);
    expect(coveragePm(counts, 0, { crop: 1 })).toBe(0);
    expect(coveragePm(counts, 4, {})).toBe(0);
  });

  it("국가 시작 시설 → 가중치(채집 시설이 없으면 농장·벌목장·광산 1씩)", () => {
    expect(weightsOfFacilities({ farm: 2, lumber_camp: 1, mine: 0, storehouse: 2 })).toEqual({
      crop: 2,
      wood: 1,
    });
    expect(weightsOfFacilities({ storehouse: 1 })).toEqual({ crop: 1, wood: 1, ore: 1 });
  });

  it("도시 간격과 자리 점수: 같은 국가 2R × 같은 천분율, 다른 국가 2R × 다른 천분율, 지름 띠마다 덜기", () => {
    const rules = { radiusCells: 2, sameGapPm: 1000, foreignGapPm: 1500, searchCells: 12, compactPm: 100 };
    expect(cityGapMilli(rules, true)).toBe(4000);
    expect(cityGapMilli(rules, false)).toBe(6000);
    expect(siteScore(800, 3999, rules)).toBe(800);
    expect(siteScore(800, 4000, rules)).toBe(700);
    expect(siteScore(800, 9000, rules)).toBe(600);
    expect(siteScore(800, 9000, { ...rules, radiusCells: 0 })).toBe(800);
  });
});
