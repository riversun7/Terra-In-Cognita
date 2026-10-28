// 행성 격자 진입점 — ADR 2026-10-28-planet-grid-contract (cube-sphere, S2 방식 계층, 탄젠트 투영)
// 여기서 내보내는 것은 정수 연산만 쓴다: 셀 키, 계층, 이웃, 면 경계 변환표, 꼭짓점, 레벨.
// 서버가 판정 보조(경로 검증, 조우 칸 등)에 써도 된다.
// 실수 투영(구 위 방향, 칸 면적, 미터)은 표시·생성 전용이라 따로 들여온다: "@terra/planet/projection".
export {
  EARTH_FACE_LEVEL,
  MAX_FACE_LEVEL,
  MAX_LEVEL,
  MIN_FACE_LEVEL,
  PLACEMENT_CELLS_PER_SIDE,
  PLACEMENT_SUBLEVELS,
  PRIMARY_MAP_LEVEL_COUNT,
  TERRAIN_CELLS_PER_SIDE,
  TERRAIN_SUBLEVELS,
  cellsPerSide,
  isFaceLevel,
  isLevel,
  planetLevels,
  type PlanetLevels,
} from "./levels.ts";
export {
  FACES,
  FACE_EDGES,
  FACE_EDGE_LINKS,
  FACE_FRAMES,
  isFace,
  wrapFaceIJ,
  type Face,
  type FaceEdge,
  type FaceEdgeLink,
  type FaceFrame,
  type FaceIJ,
  type IntVec3,
} from "./faces.ts";
export {
  MAX_CELL_KEY,
  cellFace,
  cellKey,
  cellKeyFromHilbert,
  cellLevel,
  decodeCellKey,
  hilbertIndex,
  isCellKey,
  parseCellKey,
  type CellCoords,
  type CellKey,
} from "./cellKey.ts";
export {
  ancestorKey,
  cellKeyRange,
  childKeys,
  containsCell,
  descendantAt,
  offsetInAncestor,
  parentKey,
  type CellKeyRange,
} from "./hierarchy.ts";
export { neighbors4, neighbors8, stepCell } from "./neighbors.ts";
export {
  CUBE_CORNERS,
  cubeCornerCells,
  cubeCornersOfCell,
  type CubeCorner,
  type CubeCornerId,
  type CubeCornerOnFace,
} from "./corners.ts";
