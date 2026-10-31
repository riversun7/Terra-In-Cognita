// 사이보그 만들기 공용 진입점(@terra/shared/cyborg) — 이름 규칙·외형 목록·조회 응답 모양.
// ADR 2026-11-01-first-login-cyborg. 첫 화면 묶음에 넣지 않으려고 꾸러미 진입점(index.ts)과 나눴다.
export {
  CYBORG_NAME_MAX_UNITS,
  CYBORG_NAME_MIN_UNITS,
  CYBORG_NAME_RESERVED,
  cyborgNameUnits,
  parseCyborgName,
  type CyborgNameProblem,
  type CyborgNameResult,
} from "./cyborgName.ts";
export {
  CYBORG_COLORS,
  CYBORG_COLOR_IDS,
  CYBORG_COLOR_SLOTS,
  CYBORG_LOOK_PARTS,
  CYBORG_LOOK_SLOTS,
  CYBORG_PRESETS,
  DEFAULT_CYBORG_APPEARANCE,
  isCyborgAppearance,
  randomCyborgAppearance,
  stepCyborgPart,
  type CyborgAppearance,
  type CyborgColorId,
  type CyborgColorSlot,
  type CyborgLookSlot,
  type CyborgPresetId,
} from "./cyborgLooks.ts";
export {
  CROWDING_BANDS,
  type CreationCity,
  type CreationFaction,
  type CrowdingBand,
  type CyborgCreationResponse,
  type CyborgNameCheckResponse,
  type CyborgRollView,
  type CyborgStats,
  type CyborgStatusResponse,
  type CyborgTemperamentView,
} from "./cyborgApi.ts";
