// @terra/engine/buildingPreview — 건물 하나 미리 보기(건물 편집기 "2차맵 모습", docs/adr/2026-11-08-building-art.md "바뀜 (2026-11-09)").
// 따로 진입점이라 지도 화면 묶음에 들지 않는다(건물 편집기 조각만 가져온다)
export {
  BuildingPreview,
  type BuildingPreviewInput,
  type BuildingPreviewStats,
  PREVIEW_CELL_M,
} from "./buildingPreview.ts";
export { type BuildingCondition, type BuildingLook, MAX_ART_LEVEL, artKindOf } from "./buildingLook.ts";
