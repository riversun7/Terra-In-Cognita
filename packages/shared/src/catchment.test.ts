// 도시 배후지 셈 시험(docs/adr/2026-11-11-city-catchment.md)
import { describe, expect, it } from "vitest";
import {
  MATERIAL_BIT,
  STRATEGIC_SLOT_BIT,
  type SupplyStock,
  cellCubePoint,
  cellMaterials,
  cellSharesPm,
  forestSharePm,
  herbSharePm,
  highOrePm,
  isStrategicSlot,
  livestockSharePm,
  oreSharePm,
  resourceBiomeGroup,
  resourceNoisePm,
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
  woodSharePm,
} from "./catchment.ts";

/** 목재·약초·목장 바이옴 규칙(기획 D-536 — 세계 씨앗 출발값과 같은 꼴) */
const RES = {
  woodForestPm: 1000,
  woodOtherPm: 300,
  woodBaselinePm: 300,
  herbWetlandPm: 1000,
  herbAlpinePm: 800,
  herbForestPm: 450,
  herbOtherPm: 100,
  herbClearingPm: 800,
  livestockPasturePm: 1000,
  livestockOtherPm: 0,
  resourceNoiseCells: 8,
  resourceNoiseFloorPm: 250,
  woodNoiseSeed: 5361,
  herbNoiseSeed: 70913,
  livestockNoiseSeed: 288149,
  resourceBitMinPm: 150,
};
const T = {
  lumberMinForestPct: 5,
  mineMinHeightM: 500,
  oreHighMinM: 500,
  farmMinTempC: 5,
  farmMinRainMm: 250,
  ...RES,
};
/** 칸 자리가 없는 땅 — 노이즈는 가운데(500)라 배율 1000 */
const LAND = {
  forest: 0,
  elevationM: 100,
  temperatureC: 15,
  precipitationMm: 400,
  water: 0,
  biomeId: "grassland",
};

describe("칸 원자재", () => {
  it("숲 → 목재·약초, 농사지을 땅 → 작물, 목초지 → 축산물, 높은 땅 → 광석, 물 비트 → 어류, 사막 → 전략 자원 자리", () => {
    expect(cellMaterials(undefined, T)).toBe(0);
    // 초지: 작물(기후) + 축산물(목초지 무리) + 목재(목재 바닥 300‰ ≥ 벌목장 문턱 5%). 약초는 그 밖의 땅 100‰ < 문턱 150‰
    expect(cellMaterials(LAND, T)).toBe(MATERIAL_BIT.crop | MATERIAL_BIT.livestock | MATERIAL_BIT.wood);
    expect(cellMaterials(LAND, { ...T, woodBaselinePm: 0 })).toBe(MATERIAL_BIT.crop | MATERIAL_BIT.livestock);
    expect(cellMaterials({ ...LAND, temperatureC: 0, forest: 13, biomeId: "temperate_forest" }, T)).toBe(
      MATERIAL_BIT.wood | MATERIAL_BIT.herb,
    );
    expect(cellMaterials({ ...LAND, temperatureC: 0, elevationM: 500, biomeId: "ice_sheet" }, T)).toBe(
      MATERIAL_BIT.ore,
    );
    // 강·해안 칸: 땅 원자재 + 어류. 바다·호수 칸: 어류만
    expect(cellMaterials({ ...LAND, water: 4 }, T) & MATERIAL_BIT.fish).toBe(MATERIAL_BIT.fish);
    expect(cellMaterials({ ...LAND, water: 4 }, T) & MATERIAL_BIT.crop).toBe(MATERIAL_BIT.crop);
    expect(cellMaterials({ ...LAND, water: 1, forest: 200, elevationM: 900 }, T)).toBe(MATERIAL_BIT.fish);
    // 사막: 여섯 원자재 밖의 전략 자원 자리 비트(기획 D-536) + 목재 바닥
    expect(cellMaterials({ ...LAND, temperatureC: 30, precipitationMm: 100, biomeId: "desert" }, T)).toBe(
      STRATEGIC_SLOT_BIT | MATERIAL_BIT.wood,
    );
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
    expect(cellMaterials({ ...LAND, temperatureC: 0, elevationM: 200, biomeId: "ice_sheet" }, rules)).toBe(
      MATERIAL_BIT.ore,
    );
    expect(oreSharePm({ ...LAND, elevationM: 200 }, rules)).toBe(400);
  });

  it("광산 티어 막기: 높은 티어 몫 1000이면 막지 않고, 아니면 그 몫만 남긴다", () => {
    expect(oreTierCapOf(1000, 2)).toBeUndefined();
    expect(oreTierCapOf(50, 2)).toEqual({ maxTier: 2, keepAbovePm: 50 });
    expect(oreTierCapOf(0, 2.7)).toEqual({ maxTier: 2, keepAbovePm: 0 });
    expect(oreTierCapOf(-5, -1)).toEqual({ maxTier: 0, keepAbovePm: 0 });
  });

  it("칸 몫: 광석 = 고도 몫, 목재·약초·축산물 = 바이옴 몫(기획 D-536), 작물·어류 = 비트. site와 supply는 같다", () => {
    const forest = { ...LAND, forest: 51, temperatureC: 0, biomeId: "taiga" };
    // 목재 = max(숲 밀도 몫 200, 목재 바닥 300)
    const shares = { ore: 275, wood: 300, herb: 450, crop: 0, livestock: 0, fish: 0 };
    expect(cellSharesPm(forest, ORE, "supply")).toEqual(shares);
    expect(cellSharesPm(forest, ORE, "site")).toEqual(shares);
    expect(cellSharesPm(LAND, ORE, "site")).toEqual({
      ore: 275,
      wood: 300,
      herb: 100,
      crop: 1000,
      livestock: 1000,
      fish: 0,
    });
    expect(cellSharesPm({ ...LAND, water: 1, forest: 200 }, ORE, "site").wood).toBe(0);
    expect(cellSharesPm({ ...LAND, water: 2, forest: 200 }, ORE, "supply").wood).toBe(0);
    // 강·해안 칸(잠기지 않음)의 숲은 그대로, 숲 밀도 255 = 1000
    expect(cellSharesPm({ ...LAND, water: 4, forest: 255, biomeId: "taiga" }, ORE, "supply").wood).toBe(1000);
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

/** 면 레벨 9 칸 자리가 있는 초지 땅(노이즈 시험) */
const at = (face: number, i: number, j: number) => ({ ...LAND, face, faceLevel: 9, i, j });
/** 평균 */
const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;

describe("목재·약초·목장 바이옴 나눔과 노이즈(기획 D-536)", () => {
  it("바이옴 무리: 숲·습지·고산·목초지·사막·얼음·물, 표 밖은 other", () => {
    expect(resourceBiomeGroup("taiga")).toBe("forest");
    expect(resourceBiomeGroup("tundra")).toBe("pasture");
    expect(resourceBiomeGroup("desert")).toBe("desert");
    expect(resourceBiomeGroup("ocean_deep")).toBe("water");
    expect(resourceBiomeGroup("moon_dust")).toBe("other");
    expect(resourceBiomeGroup("toString")).toBe("other");
    expect(resourceBiomeGroup(null)).toBe("other");
    expect(resourceBiomeGroup(undefined)).toBe("other");
  });

  it("목재 = 숲 밀도 몫 × 무리 배율, 약초 = 습지·고산 초지·숲 가장자리·그 밖, 목장 = 목초지(노이즈 가운데 = 배율 1000)", () => {
    const full = { ...LAND, forest: 255 };
    expect(woodSharePm({ ...full, biomeId: "temperate_forest" }, RES)).toBe(1000);
    expect(woodSharePm({ ...full, biomeId: "savanna" }, RES)).toBe(300);
    expect(woodSharePm({ ...full, biomeId: "ice_sheet" }, RES)).toBe(0);
    // 목재 바닥(기본 재료 바닥 보장): 숲이 없는 마른 땅도 300‰, 바닥 0이면 숲 밀도 몫 × 배율만
    expect(woodSharePm({ ...LAND, biomeId: "desert" }, RES)).toBe(300);
    expect(woodSharePm({ ...LAND, biomeId: "desert" }, { ...RES, woodBaselinePm: 0 })).toBe(0);
    expect(woodSharePm({ ...LAND, forest: 128, biomeId: "taiga" }, RES)).toBe(501);
    expect(woodSharePm({ ...full, biomeId: "taiga", water: 2 }, RES)).toBe(0);
    expect(herbSharePm({ ...LAND, biomeId: "wetland" }, RES)).toBe(1000);
    expect(herbSharePm({ ...LAND, biomeId: "alpine" }, RES)).toBe(800);
    // 숲: 약초 노이즈 500 × 200‰ + 빈터(1000 − 목재 노이즈 500) × 800‰ = 500 → 배율 1000
    expect(herbSharePm({ ...LAND, biomeId: "taiga" }, RES)).toBe(450);
    expect(herbSharePm({ ...LAND, biomeId: "desert" }, RES)).toBe(100);
    expect(herbSharePm({ ...LAND, biomeId: "lake" }, RES)).toBe(0);
    expect(livestockSharePm({ ...LAND, biomeId: "tundra" }, RES)).toBe(1000);
    expect(livestockSharePm({ ...LAND, biomeId: "temperate_forest" }, RES)).toBe(0);
    expect(livestockSharePm(undefined, RES)).toBe(0);
  });

  it("노이즈는 0 ~ 1000, 같은 자리·시드면 같고, 자리가 없으면 500", () => {
    expect(resourceNoisePm(LAND, 1, 8)).toBe(500);
    expect(resourceNoisePm(undefined, 1, 8)).toBe(500);
    expect(resourceNoisePm({ ...at(0, 3, 4), face: 9 }, 1, 8)).toBe(500);
    const values = Array.from({ length: 400 }, (_, k) =>
      resourceNoisePm(at(2, k % 20, Math.floor(k / 20) * 3), 7, 4),
    );
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1000);
    }
    expect(new Set(values).size).toBeGreaterThan(50);
    expect(resourceNoisePm(at(2, 5, 6), 7, 4)).toBe(values[5 + 2 * 20]);
  });

  it("노이즈는 이웃 칸끼리 부드럽고, 면 경계를 넘어도 이어진다(면 0 i 끝 ↔ 면 1 i 0)", () => {
    const n = 512;
    for (let j = 0; j < n; j += 37) {
      const inside = Math.abs(
        resourceNoisePm(at(0, 100, j), 5361, 8) - resourceNoisePm(at(0, 101, j), 5361, 8),
      );
      expect(inside).toBeLessThanOrEqual(200);
      const across = Math.abs(
        resourceNoisePm(at(0, n - 1, j), 5361, 8) - resourceNoisePm(at(1, 0, j), 5361, 8),
      );
      expect(across).toBeLessThanOrEqual(200);
    }
    // 면 0 i 끝과 면 1 i 0의 칸 가운데는 정육면체 위에서 2만큼 떨어져 있다
    const a = cellCubePoint(0, 9, n - 1, 10);
    const b = cellCubePoint(1, 9, 0, 10);
    expect(a && b ? a.reduce((sum, value, k) => sum + Math.abs(value - (b[k] ?? 0)), 0) : -1).toBe(2);
    expect(cellCubePoint(0, 1, 0, 0)).toEqual([2, -1, -1]);
    expect(cellCubePoint(6, 1, 0, 0)).toBeUndefined();
  });

  it("시드가 다르면 많은 곳이 비켜 간다(칸 상관 |r| < 0.2)", () => {
    const wood: number[] = [];
    const livestock: number[] = [];
    for (let j = 0; j < 200; j += 2)
      for (let i = 0; i < 200; i += 2) {
        wood.push(resourceNoisePm(at(0, i, j), RES.woodNoiseSeed, 8));
        livestock.push(resourceNoisePm(at(0, i, j), RES.livestockNoiseSeed, 8));
      }
    const mw = mean(wood);
    const ml = mean(livestock);
    let cov = 0;
    let vw = 0;
    let vl = 0;
    wood.forEach((value, k) => {
      const dw = value - mw;
      const dl = (livestock[k] ?? 0) - ml;
      cov += dw * dl;
      vw += dw * dw;
      vl += dl * dl;
    });
    expect(Math.abs(cov / Math.sqrt(vw * vl))).toBeLessThan(0.2);
  });

  it("노이즈 배율: 바닥 ~ 2000 − 바닥(몫은 1000에서 자른다), 바닥 1000이면 노이즈를 보지 않는다", () => {
    const cells = Array.from({ length: 300 }, (_, k) => ({ ...at(3, k, 2 * k), biomeId: "grassland" }));
    const shares = cells.map((land) => livestockSharePm(land, { ...RES, livestockPasturePm: 500 }));
    expect(Math.min(...shares)).toBeGreaterThanOrEqual(125);
    expect(Math.max(...shares)).toBeLessThanOrEqual(875);
    expect(new Set(shares).size).toBeGreaterThan(20);
    const flat = cells.map((land) => livestockSharePm(land, { ...RES, resourceNoiseFloorPm: 1000 }));
    expect(new Set(flat)).toEqual(new Set([1000]));
  });

  it("숲 약초는 나무가 성긴 곳(목재 노이즈가 낮은 곳)을 따른다", () => {
    const cells = Array.from({ length: 400 }, (_, k) => ({
      ...at(4, k % 40, Math.floor(k / 40) * 4),
      biomeId: "temperate_forest",
      forest: 200,
    }));
    const wood = cells.map((land) => woodSharePm(land, RES));
    const herb = cells.map((land) => herbSharePm(land, RES));
    const order = wood.map((value, k) => [value, herb[k] ?? 0] as const).toSorted((x, y) => x[0] - y[0]);
    const low = order.slice(0, 100).reduce((sum, row) => sum + row[1], 0);
    const high = order.slice(-100).reduce((sum, row) => sum + row[1], 0);
    expect(low).toBeGreaterThan(high);
  });

  it("전략 자원 자리 = 사막 무리의 마른 칸(지금은 아무 원자재도 아니다)", () => {
    const desert = { ...LAND, biomeId: "desert" };
    expect(isStrategicSlot(desert)).toBe(true);
    expect(isStrategicSlot({ ...desert, water: 1 })).toBe(false);
    expect(isStrategicSlot(LAND)).toBe(false);
    expect(isStrategicSlot(undefined)).toBe(false);
    expect(STRATEGIC_SLOT_BIT & Object.values(MATERIAL_BIT).reduce((sum, bit) => sum | bit, 0)).toBe(0);
    expect(
      cellSharesPm(
        desert,
        { ...T, oreShareLowPm: 150, oreShareHillM: 200, oreShareHillPm: 400, oreFlatHighPm: 0 },
        "supply",
      ),
    ).toEqual({ ore: 275, wood: 300, herb: 100, crop: 1000, livestock: 0, fish: 0 });
  });
});
