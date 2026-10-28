// 서버 전용 판정 코드 진입점 (ADR 2026-10-28-s1-second-map.md, 2026-10-28-simulation-model.md)
// 게임 앱은 이 패키지를 import할 수 없다(scripts/check-boundaries.mjs). 정수 계산만 쓰고 초월함수는 쓰지 않는다.
export { SIM_VERSION, TEMP_TERRAIN_GENERATOR_VERSION } from "./version.ts";
export {
  CAR_SPEED,
  CELL_UNITS,
  HALF_CELL_UNITS,
  MAP_UNITS,
  MS_PER_SECOND,
  PLACEMENT_CELLS,
  PLACEMENT_PER_TERRAIN,
  PLACEMENT_SIZE,
  TERRAIN_SIZE,
  TERRAIN_VERTEX_SIZE,
  WALK_SPEED,
  type Point,
} from "./units.ts";
export { isqrt, isqrtRound } from "./math/isqrt.ts";
export { createFnv1a, hashCoords, mix32, type Fnv1a } from "./math/hash.ts";
