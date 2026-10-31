// 2차맵 시험용 행성 값 — S2 시험 행성 정의(옮겨 적은 바이옴 표·시드)를 작은 면 레벨로 생성한다. 시험에서만 쓴다(결정성 검사 밖).
import { NORMAL_PRESETS, resolvePlanetSettings } from "@terra/shared";
import { runPlanetGenerator } from "../generator/generate.ts";
import { S2_TEST_PLANET_SEED, TEST_BIOMES } from "../generator/testFixtures.ts";
import { type PlanetValues, planetValuesFromGeneration } from "./planetValues.ts";
import { type PropRuleSet, compileMapProps } from "./props.ts";
import { TEST_MAP_PROPS } from "./testMapProps.ts";

const cache = new Map<number, PlanetValues>();

/** S2 시험 행성(팩 시드)의 면 레벨 faceLevel 행성 값(한 번만 생성) */
export function testPlanetValues(faceLevel = 6): PlanetValues {
  const cached = cache.get(faceLevel);
  if (cached) return cached;
  const details = runPlanetGenerator({
    faceLevel,
    seed: S2_TEST_PLANET_SEED,
    settings: resolvePlanetSettings(NORMAL_PRESETS),
    biomes: TEST_BIOMES,
  });
  const values = planetValuesFromGeneration(
    details.fields,
    details,
    TEST_BIOMES.map((biome) => biome.id),
  );
  cache.set(faceLevel, values);
  return values;
}

/** S2 시험 행성 바이옴 표로 만든 시험 소품 규칙(팩 map_props 사본) */
export function testPropRules(): PropRuleSet {
  return compileMapProps(
    TEST_MAP_PROPS,
    TEST_BIOMES.map((biome) => biome.id),
  );
}
