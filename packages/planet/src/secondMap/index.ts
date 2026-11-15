// @terra/planet/secondMap — 2차맵 생성기(ADR 2026-10-31-second-map-from-planet). 서버 생성 워커와 편집기 기기 워커가 같은 코드를 쓴다.
// Node·DOM API를 쓰지 않는다. 결정적이다(패키지 전체가 결정성 검사 대상).
export { generateSecondMap, NO_WATER, SNOW_TEMPERATURE_C, type SecondMapTerrain } from "./generate.ts";
export { SECOND_MAP_GENERATOR_VERSION } from "./version.ts";
export { BIOME_SURFACES, DEFAULT_MIX, SM_SURFACE, type SmSurface, type SurfaceMix } from "./surfaces.ts";
export { SM_PLACEMENT, SM_TERRAIN, SM_VERTICES, mapCoords, type MapCoords } from "./layout.ts";
export { stepMapCell, type MapCellStep } from "./edges.ts";
export {
  compileMapProps,
  emptyPropRules,
  mapPropInputsFromJson,
  type MapPropCurveInput,
  type MapPropInput,
  type PropRuleSet,
} from "./props.ts";
export { SM_CLIFF_RELIEF_CM, WATER_DISTANCE_MAX } from "./placement.ts";
export {
  NO_RECEIVER,
  PLANET_VALUES_FORMAT,
  decodePlanetValues,
  encodePlanetValues,
  planetValuesFromGeneration,
  planetValuesReader,
  receiverDirections,
  type PlanetValues,
  type PlanetValuesReader,
} from "./planetValues.ts";
export {
  MAP_PRESETS,
  findMapPreset,
  planetCellValues,
  planetCellValuesFromFile,
  type MapPreset,
  type PlanetCellValues,
} from "./presets.ts";
