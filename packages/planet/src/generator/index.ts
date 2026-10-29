// 행성 생성기 진입점 — import { generatePlanet, … } from "@terra/planet/generator" (ADR 2026-10-29-s2-planet-lod)
// 서버 굽기(워커 스레드)와 편집기 미리보기(기기 워커)가 같은 코드를 쓴다. Node·DOM API를 쓰지 않는다.
// 입력은 풀어 쓴 행성 정의다: 콘텐츠 팩 행성 항목의 presets·overrides → resolvePlanetSettings, 바이옴 표(행성의
// biomes 순서대로 바이옴 항목) → biomes. @terra/planet은 @terra/content를 가져오지 않으므로 구조만 맞춘다.
export {
  type GeneratorDetails,
  type GeneratorOptions,
  generatePlanet,
  runPlanetGenerator,
  validatePlanetInput,
} from "./generate.ts";
export {
  parsePlanetBiome,
  parsePlanetOverrides,
  parsePlanetPresets,
  planetInputFromDefinition,
} from "./definition.ts";
export { CELL_DRY, CELL_FILLED, CELL_LAKE, CELL_OPEN } from "./hydrology.ts";
// 프리셋 수치표와 풀기는 콘텐츠 검증과 같이 쓰려고 @terra/shared(planetPresets.ts)에 있다. 생성기 진입점도 내보낸다
export { NORMAL_PRESETS, PLANET_PRESET_VALUES, presetValues, resolvePlanetSettings } from "@terra/shared";
export { VERTICAL_SCALE } from "./surface.ts";
export {
  type BiomeRange,
  type BiomeRule,
  type GeneratorStage,
  type PlanetBiome,
  type PlanetGeneratorInput,
} from "./types.ts";
// 출력 모양·물 비트는 정수 진입점(@terra/planet)의 정의 하나를 다시 내보낸다(생성기만 가져오는 쪽도 쓰게)
export {
  DEPTH_COASTAL,
  DEPTH_DEEP,
  DEPTH_NONE,
  DEPTH_SHELF,
  WATER_COAST,
  WATER_DEPTH_MASK,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  type PlanetFields,
  type PlanetFieldsMeta,
} from "../tiles/fields.ts";
export { GENERATOR_VERSION } from "./version.ts";
