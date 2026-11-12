// 도시 배후지 셈 시험(docs/adr/2026-11-11-city-catchment.md)
import { describe, expect, it } from "vitest";
import {
  MATERIAL_BIT,
  type SupplyStock,
  cellMaterials,
  cellSharesPm,
  forestSharePm,
  highOrePm,
  oreSharePm,
  shareCoveragePm,
  stepCatchmentSupply,
  sumShares,
  cityGapMilli,
  countMaterials,
  coveragePm,
  materialOfFacility,
  oreTierCapOf,
  siteScore,
  weightsOfFacilities,
} from "./catchment.ts";

const T = {
  lumberMinForestPct: 5,
  mineMinHeightM: 500,
  oreHighMinM: 500,
  farmMinTempC: 5,
  farmMinRainMm: 250,
};
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

/** 칸 1은 산지(광석 1000), 나머지는 낮은 땅(250). 광석만 */
const oreCapacity = (cell: number, material: string): number =>
  material !== "ore" ? 0 : cell === 1 ? 1000 : 250;

describe("광석 고도 몫(기획 D-533 — 석재·구리는 어디서나 조금, 높은 티어는 산지)", () => {
  const ORE = { ...T, oreShareLowPm: 150, oreShareHillM: 200, oreShareHillPm: 400, oreFlatHighPm: 0 };

  it("고도 꺾은선: 0m 이하 150 · 200m 400 · 500m 이상 1000, 사이는 곧게(내림). 물에 잠긴 칸 0", () => {
    expect(oreSharePm({ ...LAND, elevationM: -30 }, ORE)).toBe(150);
    expect(oreSharePm({ ...LAND, elevationM: 0 }, ORE)).toBe(150);
    expect(oreSharePm({ ...LAND, elevationM: 100 }, ORE)).toBe(275);
    expect(oreSharePm({ ...LAND, elevationM: 200 }, ORE)).toBe(400);
    expect(oreSharePm({ ...LAND, elevationM: 350 }, ORE)).toBe(700);
    expect(oreSharePm({ ...LAND, elevationM: 499 }, ORE)).toBe(998);
    expect(oreSharePm({ ...LAND, elevationM: 500 }, ORE)).toBe(1000);
    expect(oreSharePm({ ...LAND, elevationM: 3000 }, ORE)).toBe(1000);
    expect(oreSharePm({ ...LAND, water: 1, elevationM: 900 }, ORE)).toBe(0);
    // 강·해안 칸(땅)은 몫이 있다
    expect(oreSharePm({ ...LAND, water: 4 }, ORE)).toBe(275);
    expect(oreSharePm(undefined, ORE)).toBe(0);
    // 언덕 몫이 낮은 몫보다 작으면 낮은 몫, 언덕이 산지보다 높으면 산지에서 꺾는다
    expect(oreSharePm({ ...LAND, elevationM: 100 }, { ...ORE, oreShareHillPm: 50 })).toBe(150);
    expect(oreSharePm({ ...LAND, elevationM: 600 }, { ...ORE, oreShareHillM: 900 })).toBe(1000);
    // 높은 티어는 산지 칸만(산지 밖 몫 0)
    expect(highOrePm({ ...LAND, elevationM: 499 }, ORE)).toBe(0);
    expect(highOrePm({ ...LAND, elevationM: 500 }, ORE)).toBe(1000);
  });

  it("높은 티어 광석(기획 D-535): 산지 고도는 따로 된 칸, 산지 밖 마른 땅은 드물게(oreFlatHighPm), 잠긴 칸은 0", () => {
    const rules = { ...ORE, oreHighMinM: 200, oreFlatHighPm: 50 };
    expect(highOrePm({ ...LAND, elevationM: 199 }, rules)).toBe(50);
    expect(highOrePm({ ...LAND, elevationM: 200 }, rules)).toBe(1000);
    expect(highOrePm({ ...LAND, elevationM: -20 }, rules)).toBe(50);
    expect(highOrePm({ ...LAND, water: 4 }, rules)).toBe(50);
    expect(highOrePm({ ...LAND, water: 1, elevationM: 900 }, rules)).toBe(0);
    expect(highOrePm(undefined, rules)).toBe(0);
    expect(highOrePm(LAND, { ...rules, oreFlatHighPm: 5000 })).toBe(1000);
    // 광석 비트(산지)도 같은 고도를 따른다 — 몫 곡선의 1000 고도(mineMinHeightM)와 따로
    expect(cellMaterials({ ...LAND, temperatureC: 0, elevationM: 200 }, rules)).toBe(MATERIAL_BIT.ore);
    expect(oreSharePm({ ...LAND, elevationM: 200 }, rules)).toBe(400);
  });

  it("광산 티어 막기: 높은 티어 몫 1000이면 막지 않고, 아니면 그 몫만 남긴다", () => {
    expect(oreTierCapOf(1000, 2)).toBeUndefined();
    expect(oreTierCapOf(50, 2)).toEqual({ maxTier: 2, keepAbovePm: 50 });
    expect(oreTierCapOf(0, 2.7)).toEqual({ maxTier: 2, keepAbovePm: 0 });
    expect(oreTierCapOf(-5, -1)).toEqual({ maxTier: 0, keepAbovePm: 0 });
  });

  it("칸 몫: supply는 광석 = 고도 몫·목재 = 숲 밀도 몫(질문 1080 가, 나머지 비트), site는 약초 = max(목재, 작물)(질문 1027 다)", () => {
    const forest = { ...LAND, forest: 51, temperatureC: 0 };
    expect(cellSharesPm(forest, ORE, "supply")).toEqual({
      ore: 275,
      wood: 200,
      herb: 1000,
      crop: 0,
      livestock: 0,
      fish: 0,
    });
    expect(cellSharesPm(forest, ORE, "site")).toEqual({
      ore: 275,
      wood: 200,
      herb: 200,
      crop: 0,
      livestock: 0,
      fish: 0,
    });
    expect(cellSharesPm({ ...LAND, forest: 51 }, ORE, "site").herb).toBe(1000);
    expect(cellSharesPm({ ...LAND, water: 1, forest: 200 }, ORE, "site").wood).toBe(0);
    expect(cellSharesPm({ ...LAND, water: 2, forest: 200 }, ORE, "supply").wood).toBe(0);
    // 강·해안 칸(잠기지 않음)의 숲은 그대로, 숲 밀도 255 = 1000
    expect(cellSharesPm({ ...LAND, water: 4, forest: 255 }, ORE, "supply").wood).toBe(1000);
    expect(forestSharePm(0)).toBe(0);
    expect(forestSharePm(128)).toBe(501);
    expect(forestSharePm(999)).toBe(1000);
  });

  it("몫 덮임 = 원자재마다 (몫 합 ÷ 칸 수)의 가중 평균. 몫이 0·1000이면 비트 덮임과 같다", () => {
    const sums = sumShares([
      cellSharesPm(LAND, ORE, "site"),
      cellSharesPm({ ...LAND, elevationM: 600 }, ORE, "site"),
    ]);
    expect(sums.ore).toBe(1275);
    // 작물 1000 × 2 + 광석 ⌊1275 ÷ 2⌋ = 637 → ⌊2637 ÷ 3⌋
    expect(shareCoveragePm(sums, 2, { crop: 2, ore: 1 })).toBe(879);
    expect(shareCoveragePm(sums, 0, { crop: 1 })).toBe(0);
    const bits = [MATERIAL_BIT.crop | MATERIAL_BIT.wood, MATERIAL_BIT.crop, MATERIAL_BIT.ore, 0];
    const asShares = bits.map((value) => ({
      ore: value & MATERIAL_BIT.ore ? 1000 : 0,
      wood: value & MATERIAL_BIT.wood ? 1000 : 0,
      herb: 0,
      crop: value & MATERIAL_BIT.crop ? 1000 : 0,
      livestock: 0,
      fish: 0,
    }));
    expect(shareCoveragePm(sumShares(asShares), 4, { crop: 2, wood: 1, ore: 1 })).toBe(
      coveragePm(countMaterials(bits), 4, { crop: 2, wood: 1, ore: 1 }),
    );
  });

  it("채집 다툼: 칸마다 캐는 양은 칸 재고 상한 비례(산지 칸에서 더 캔다)", () => {
    const rules = { stockPerCell: 1000, regrowPm: 0, regrowFloor: 0, drawPm: 750 };
    const stock: SupplyStock = new Map();
    const result = stepCatchmentSupply(
      [{ id: 1, cells: [1, 2], demand: { ore: 500 } }],
      stock,
      oreCapacity,
      rules,
    );
    // 칸 1: ⌈500 × 1000 ÷ 1250⌉ = 400, 칸 2: ⌈500 × 250 ÷ 1250⌉ = 100
    expect(result.get(1)?.got.ore).toBe(500);
    expect(stock.get(1)?.[0]).toBe(600);
    expect(stock.get(2)?.[0]).toBe(150);
  });
});
