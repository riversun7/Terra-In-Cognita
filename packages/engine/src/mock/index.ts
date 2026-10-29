// @terra/engine/mock — [임시] 시험용 가짜 자료: 2차맵(지형·건물·유닛·"서버")과 1차맵(가짜 행성 타일 원천, 엔진 단위 시험용).
// 진짜 자료는 서버가 보낸다(ADR 2026-10-28-s1-second-map, 2026-10-29-s2-planet-lod). 서버 쪽이 생기면 이 폴더와 시험 화면의 사용처를 함께 지운다.
// 1차맵 화면은 이미 서버 타일을 그린다. 가짜 행성은 서버 굽기와 같은 타일 규칙(@terra/planet)으로 타일을 만든다(mockPlanet.ts).
export { MOCK_CELL_SIZE_M, createMockTerrain } from "./mockTerrain.ts";
export { type MockWorld, type MockWorldOptions, createMockWorld, segmentWalkable } from "./mockWorld.ts";
export { type MockDriver, startMockDriver } from "./mockDriver.ts";
export {
  MOCK_MAX_ELEVATION_M,
  MOCK_PLANET_BIOMES,
  type MockTileMaker,
  createMockTileMaker,
  generateMockFields,
  mockPlanetDescription,
} from "./mockPlanet.ts";
export { type MockPlanet, type MockPlanetOptions, createMockPlanet } from "./mockPlanetSource.ts";
