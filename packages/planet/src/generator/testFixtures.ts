// 생성기 시험용 자료 — 골든 해시가 콘텐츠 팩 수정에 흔들리지 않게 팩 값을 옮겨 적었다(2026-10-29 content/core 기준).
// 팩과 같은지는 generate.test.ts의 "팩 행성" 시험이 본다(해시는 보지 않는다).
import type { PlanetBiome } from "./types.ts";

/** 바이옴 표 1판(content/core/biomes.json, S2 시험 행성의 biomes 순서) */
export const TEST_BIOMES: readonly PlanetBiome[] = [
  { id: "ocean_deep", forestDensity: 0, rule: { kind: "ocean", depthClass: "deep" } },
  { id: "ocean_shelf", forestDensity: 0, rule: { kind: "ocean", depthClass: "shelf" } },
  { id: "ocean_coastal", forestDensity: 0, rule: { kind: "ocean", depthClass: "coastal" } },
  { id: "lake", forestDensity: 0, rule: { kind: "lake" } },
  { id: "ice_sheet", forestDensity: 0, rule: { kind: "land", temperatureC: { max: -11 } } },
  {
    id: "alpine",
    forestDensity: 10,
    rule: { kind: "land", temperatureC: { max: 3 }, realElevationM: { min: 1800 } },
  },
  {
    id: "wetland",
    forestDensity: 90,
    rule: { kind: "land", temperatureC: { min: -3 }, humidity: { min: 205 }, realElevationM: { max: 300 } },
  },
  { id: "tundra", forestDensity: 8, rule: { kind: "land", temperatureC: { max: -3 } } },
  {
    id: "taiga",
    forestDensity: 175,
    rule: { kind: "land", temperatureC: { max: 5 }, humidity: { min: 70 } },
  },
  {
    id: "temperate_forest",
    forestDensity: 200,
    rule: { kind: "land", temperatureC: { max: 19 }, humidity: { min: 135 } },
  },
  {
    id: "grassland",
    forestDensity: 25,
    rule: { kind: "land", temperatureC: { max: 19 }, humidity: { min: 55 } },
  },
  { id: "desert", forestDensity: 0, rule: { kind: "land", humidity: { max: 55 } } },
  { id: "savanna", forestDensity: 55, rule: { kind: "land", humidity: { max: 160 } } },
  { id: "tropical_rainforest", forestDensity: 245, rule: { kind: "land" } },
];

/** S2 시험 행성(content/core/planets.json s2_test_planet)의 시드 */
export const S2_TEST_PLANET_SEED = 20261029;
