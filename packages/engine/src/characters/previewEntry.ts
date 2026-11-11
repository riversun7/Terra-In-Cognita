// @terra/engine/characterPreview — 캐릭터 하나 미리 보기·썸네일(사이보그 만들기 "외형" 단계, docs/adr/2026-11-11-character-3d.md 3절).
// 따로 진입점이라 첫 화면·지도 화면 묶음에 들지 않는다(만들기 화면이 지연 로딩한다)
export {
  CharacterPreview,
  type CharacterPreviewStats,
  type CharacterThumbnailFraming,
  renderCharacterThumbnails,
} from "./characterPreview.ts";
export { TRIANGLE_BUDGET } from "./characterModel.ts";
