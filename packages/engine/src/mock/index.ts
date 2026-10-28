// @terra/engine/mock — [임시] 2차맵 시험 화면용 가짜 지형·건물·유닛·"서버".
// 진짜 자료는 서버가 보낸다(ADR 2026-10-28-s1-second-map). 서버 쪽이 생기면 이 폴더와 시험 화면의 사용처를 함께 지운다.
export { MOCK_CELL_SIZE_M, createMockTerrain } from "./mockTerrain.ts";
export { type MockWorld, type MockWorldOptions, createMockWorld, segmentWalkable } from "./mockWorld.ts";
export { type MockDriver, startMockDriver } from "./mockDriver.ts";
