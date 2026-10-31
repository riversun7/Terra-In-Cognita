// 편집기 도우미 시험(ADR 38 12절) — explainBiome이 모든 칸의 저장 바이옴과 같다, 근접 실패·떨어짐 표시,
// summarizePlanet의 면적 몫(합 1, 칸 면적 가중), faceAreaTable(합 4π, 격자 면적과 같음)
import { describe, expect, it } from "vitest";
import { areaOf, buildGrid } from "./grid.ts";
import {
  BIOME_NEAR_MISS,
  NORMAL_PRESETS,
  type BiomeExplanation,
  type PlanetBiome,
  type PlanetFields,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  explainBiome,
  faceAreaTable,
  generatePlanet,
  resolvePlanetSettings,
  summarizePlanet,
} from "./index.ts";
import { S2_TEST_PLANET_SEED, TEST_BIOMES } from "./testFixtures.ts";

const fieldsCache = new Map<number, PlanetFields>();
function packFields(faceLevel: number): PlanetFields {
  const cached = fieldsCache.get(faceLevel);
  if (cached) return cached;
  const fields = generatePlanet({
    faceLevel,
    seed: S2_TEST_PLANET_SEED,
    settings: resolvePlanetSettings(NORMAL_PRESETS),
    biomes: TEST_BIOMES,
  });
  fieldsCache.set(faceLevel, fields);
  return fields;
}

const cellOf = (fields: PlanetFields, c: number) => ({
  water: fields.water[c] ?? 0,
  temperatureC: fields.temperatureC[c] ?? 0,
  humidity: fields.humidity[c] ?? 0,
  elevationM: fields.elevationM[c] ?? 0,
});

const landOf = (explanation: BiomeExplanation) => {
  if (explanation.kind !== "land") throw new Error(`land expected: ${explanation.kind}`);
  return explanation;
};

describe("explainBiome", () => {
  it.each([5, 6])("F%i: 모든 칸에서 다시 판정한 바이옴이 저장 바이옴과 같다", (faceLevel) => {
    const fields = packFields(faceLevel);
    const kinds = { ocean: 0, lake: 0, land: 0 };
    const mismatches: number[] = [];
    for (let c = 0; c < fields.biome.length; c++) {
      const stored = fields.biome[c] ?? 0;
      const explanation = explainBiome(cellOf(fields, c), TEST_BIOMES, stored);
      kinds[explanation.kind]++;
      if (explanation.chosen !== stored || explanation.matchesStored !== true) mismatches.push(c);
    }
    expect(mismatches).toEqual([]);
    // 세 갈래를 모두 지났다(시험이 한쪽만 보지 않게)
    expect(kinds.ocean).toBeGreaterThan(0);
    expect(kinds.land).toBeGreaterThan(0);
    expect(kinds.lake + kinds.land + kinds.ocean).toBe(fields.biome.length);
  });

  it("육지: 표 순서대로 모든 규칙을 보이고, 처음 맞은 규칙을 고른다(뒤 규칙도 확인한다)", () => {
    // 기온 10°C, 습도 140, 고도 50m(실제 600m): 온대림(기온 < 19, 습도 ≥ 135)이 처음 맞는다
    const explanation = landOf(
      explainBiome({ water: 0, temperatureC: 10, humidity: 140, elevationM: 50 }, TEST_BIOMES),
    );
    expect(explanation.realElevationM).toBe(600);
    expect(explanation.chosenId).toBe("temperate_forest");
    expect(explanation.fellBack).toBe(false);
    expect(explanation.matchesStored).toBeNull();
    const ids = explanation.rules.map((rule) => rule.id);
    expect(ids[0]).toBe("ice_sheet");
    expect(ids.at(-1)).toBe("tropical_rainforest");
    // 뒤의 초지·사바나도 맞지만(통과) 처음 맞은 것은 온대림이다
    const grassland = explanation.rules.find((rule) => rule.id === "grassland");
    expect(grassland?.pass).toBe(true);
    // 타이가: 기온 < 5에서 5만큼 떨어짐(눈금 2보다 큼 → 아깝지 않음)
    const taiga = explanation.rules.find((rule) => rule.id === "taiga");
    expect(taiga?.pass).toBe(false);
    expect(taiga?.near).toBe(false);
    expect(taiga?.conditions.find((condition) => condition.axis === "temperatureC")).toMatchObject({
      value: 10,
      min: null,
      max: 5,
      pass: false,
      miss: 5,
      near: false,
    });
  });

  it("근접 실패: 떨어진 조건이 모두 눈금 안이면 규칙이 아깝게 떨어진 것이다(max는 포함하지 않아 경계 값은 거리 0)", () => {
    // 기온 19°C(온대림 max 19에서 거리 0), 습도 140 → 온대림·초지가 기온으로 아깝게 떨어지고 사바나(습도 < 160)가 된다
    const explanation = landOf(
      explainBiome({ water: 0, temperatureC: 19, humidity: 140, elevationM: 0 }, TEST_BIOMES),
    );
    expect(explanation.chosenId).toBe("savanna");
    const forest = explanation.rules.find((rule) => rule.id === "temperate_forest");
    expect(forest?.near).toBe(true);
    expect(forest?.conditions[0]).toMatchObject({ axis: "temperatureC", miss: 0, near: true });
    // 습도 눈금: 사막(습도 < 55)은 140 − 55 = 85 떨어짐
    const desert = explanation.rules.find((rule) => rule.id === "desert");
    expect(desert?.near).toBe(false);
    // 눈금 값 자체는 아깝다(≤): 기온 −9°C는 빙상(max −11)에서 2 떨어짐, 고도 142m(실제 1,704m)는 고산(min 1,800)에서 96m
    const edge = landOf(
      explainBiome({ water: 0, temperatureC: -9, humidity: 0, elevationM: 142 }, TEST_BIOMES),
    );
    const ice = edge.rules.find((rule) => rule.id === "ice_sheet");
    expect(ice?.conditions[0]).toMatchObject({ miss: BIOME_NEAR_MISS.temperatureC, near: true });
    const alpine = edge.rules.find((rule) => rule.id === "alpine");
    expect(alpine?.conditions.find((condition) => condition.axis === "realElevationM")).toMatchObject({
      value: 1704,
      miss: 96,
      near: true,
    });
    expect(alpine?.near).toBe(true);
    expect(edge.chosenId).toBe("tundra");
  });

  it("맞는 육지 규칙이 없으면 마지막 육지 바이옴으로 떨어진다", () => {
    const table: PlanetBiome[] = [
      { id: "sea", forestDensity: 0, rule: { kind: "ocean", depthClass: "deep" } },
      { id: "pond", forestDensity: 0, rule: { kind: "lake" } },
      { id: "cold", forestDensity: 0, rule: { kind: "land", temperatureC: { max: 0 } } },
      { id: "high", forestDensity: 0, rule: { kind: "land", realElevationM: { min: 3000 } } },
    ];
    const explanation = landOf(
      explainBiome({ water: 0, temperatureC: 20, humidity: 0, elevationM: 0 }, table, 3),
    );
    expect(explanation.matched).toBeNull();
    expect(explanation.fellBack).toBe(true);
    expect(explanation.chosenId).toBe("high");
    expect(explanation.matchesStored).toBe(true);
  });

  it("바다는 물 비트의 수심 등급, 그 등급 규칙이 없으면 첫 바다 규칙. 호수는 첫 호수 규칙", () => {
    const shelf = explainBiome(
      { water: WATER_OCEAN | (2 << WATER_DEPTH_SHIFT), temperatureC: 5, humidity: 255, elevationM: -10 },
      TEST_BIOMES,
    );
    expect(shelf).toMatchObject({
      kind: "ocean",
      depthClass: "shelf",
      chosenId: "ocean_shelf",
      fellBack: false,
    });
    const table: PlanetBiome[] = [
      { id: "lake_a", forestDensity: 0, rule: { kind: "lake" } },
      { id: "deep", forestDensity: 0, rule: { kind: "ocean", depthClass: "deep" } },
      { id: "land_a", forestDensity: 0, rule: { kind: "land" } },
    ];
    const coastal = explainBiome(
      { water: WATER_OCEAN | (1 << WATER_DEPTH_SHIFT), temperatureC: 5, humidity: 255, elevationM: -1 },
      table,
      0,
    );
    expect(coastal).toMatchObject({
      kind: "ocean",
      depthClass: "coastal",
      chosenId: "deep",
      fellBack: true,
      matchesStored: false,
    });
    expect(
      explainBiome({ water: WATER_LAKE, temperatureC: 5, humidity: 255, elevationM: 3 }, table),
    ).toMatchObject({
      kind: "lake",
      chosen: 0,
    });
  });
});

describe("faceAreaTable", () => {
  it("격자 칸 면적과 같고 여섯 면 합은 4π다", () => {
    const grid = buildGrid(5);
    const table = faceAreaTable(5);
    expect(table.length).toBe(grid.faceCells);
    let total = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      expect(table[c % grid.faceCells]).toBe(areaOf(grid, c));
      total += table[c % grid.faceCells] ?? 0;
    }
    expect(total).toBeCloseTo(4 * Math.PI, 10);
  });
});

describe("summarizePlanet", () => {
  it("몫의 합은 1이고 바이옴 몫은 칸 면적으로 가중한 값이다", () => {
    const fields = packFields(5);
    const summary = summarizePlanet(fields, TEST_BIOMES);
    expect(summary.faceLevel).toBe(5);
    expect(summary.cellCount).toBe(fields.biome.length);
    expect(summary.biomes.map((biome) => biome.id)).toEqual(TEST_BIOMES.map((biome) => biome.id));
    const planetTotal = summary.biomes.reduce((sum, biome) => sum + biome.planetShare, 0);
    const landTotal = summary.biomes.reduce((sum, biome) => sum + (biome.landShare ?? 0), 0);
    expect(planetTotal).toBeCloseTo(1, 12);
    expect(landTotal).toBeCloseTo(1, 12);
    expect(summary.landShare + summary.lakeShare + summary.oceanShare).toBeCloseTo(1, 12);
    const { coastal, shelf, deep } = summary.oceanDepthShares;
    expect(coastal + shelf + deep).toBeCloseTo(summary.oceanShare, 12);
    expect(summary.riverShare).toBeGreaterThan(0);
    expect(summary.riverShare).toBeLessThanOrEqual(summary.landShare);
    // 바다·호수 바이옴은 육지 몫이 없다
    expect(summary.biomes[0]?.landShare).toBeNull();
    expect(summary.biomes[3]?.landShare).toBeNull();
    // 직접 센 값과 같다(칸 면적 가중)
    const grid = buildGrid(5);
    let total = 0;
    let land = 0;
    let river = 0;
    let temperature = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      const area = areaOf(grid, c);
      total += area;
      temperature += area * (fields.temperatureC[c] ?? 0);
      const water = fields.water[c] ?? 0;
      if ((water & (WATER_OCEAN | WATER_LAKE)) === 0) {
        land += area;
        if (water & WATER_RIVER) river += area;
      }
    }
    expect(summary.landShare).toBeCloseTo(land / total, 12);
    expect(summary.riverShare).toBeCloseTo(river / total, 12);
    expect(summary.meanTemperatureC).toBeCloseTo(temperature / total, 10);
    expect(summary.maxElevationM).toBe(Math.max(...fields.elevationM));
    expect(summary.minElevationM).toBe(Math.min(...fields.elevationM));
  });

  it("바이옴 하나뿐인 결과는 그 바이옴이 100%다(칸 수가 아니라 면적)", () => {
    const fields = packFields(5);
    const allLand: PlanetFields = {
      ...fields,
      biome: new Uint8Array(fields.biome.length).fill(13),
      water: new Uint8Array(fields.water.length),
    };
    const summary = summarizePlanet(allLand, TEST_BIOMES);
    expect(summary.biomes[13]).toMatchObject({ planetShare: 1, landShare: 1 });
    expect(summary.landShare).toBe(1);
    expect(summary.oceanShare).toBeCloseTo(0, 12);
  });
});
