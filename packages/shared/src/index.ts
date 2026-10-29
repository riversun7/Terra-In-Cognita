// 공용 유틸리티 진입점 — 다른 내부 패키지를 import하지 않는 최하층 패키지
// package.json "sideEffects": false: 쓰지 않는 모듈은 묶음(첫 화면 등)에서 빠진다. 그래서 이 꾸러미 모듈은 맨 위에서
// 부르는 코드(전역 등록 등)를 두지 않는다(ADR 2026-10-29-s2-planet-lod "다듬기 통합", AGENTS.md 6장)
export { createRng, type Rng } from "./rng.ts";
export { detAsin, detAtan, detAtan2, detCos, detExp, detSin, detTan } from "./detMath.ts";
export {
  BIOME_RULE_KINDS,
  OCEAN_DEPTH_CLASSES,
  PLANET_GENERATOR_FACE_LEVELS,
  PLANET_PRESET_AXES,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_KEYS,
  PLANET_SETTING_RANGES,
  isPlanetPresetLevel,
  type BiomeRuleKind,
  type OceanDepthClass,
  type PlanetPresetAxis,
  type PlanetPresetLevel,
  type PlanetPresets,
  type PlanetSettingKey,
  type PlanetSettingOverrides,
  type PlanetSettings,
} from "./planetDefinition.ts";
export {
  NORMAL_PRESETS,
  PLANET_PRESET_VALUES,
  presetValues,
  resolvePlanetSettings,
} from "./planetPresets.ts";
export {
  PLANET_DRAFT_ENTRY_MAX_BYTES,
  PLANET_DRAFT_REJECT_CODES,
  isPlanetDraftRejectCode,
  planetDraftEntryBytes,
  utf8ByteLength,
  type PlanetDraftRejectCode,
} from "./planetDraftApi.ts";
export { estimateClockOffset, type ClockSample, type ClockEstimate } from "./clock.ts";
export {
  LOGIN_ID_MAX_LENGTH,
  LOGIN_ID_MIN_LENGTH,
  isLoginIdKey,
  parseLoginId,
  type LoginIdProblem,
  type LoginIdResult,
} from "./loginId.ts";
export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./passwordRules.ts";
export { DEFAULT_ROLE, ROLES, isRole, type Role } from "./roles.ts";
export { SAVED_ID_PATTERN, isSavedId } from "./savedId.ts";
// 화면 주소 표·메뉴 항목(앱 뼈대, ADR 2026-10-29-app-shell). 홈 카드·처리할 일은 진입점이 따로다:
// @terra/shared/dashboard, @terra/shared/inbox(첫 화면 묶음에 넣지 않는다)
export {
  ROUTES,
  buildPath,
  canOpenRoute,
  isRouteId,
  isRouteParamValue,
  isRouteTarget,
  matchPath,
  parentTarget,
  replaceSearch,
  routePathExamples,
  targetPath,
  type PathParamNames,
  type RouteAccess,
  type RouteDefinition,
  type RouteFrame,
  type RouteId,
  type RouteMatch,
  type RouteParamKind,
  type RouteParams,
  type RoutePathArgs,
  type RouteSearch,
  type RouteTarget,
} from "./routes.ts";
export {
  DEFAULT_NAV_LAYOUT,
  DEFAULT_NAV_TABS,
  NAV_ITEM_IDS,
  NAV_LAYOUTS,
  NAV_LAYOUT_FIXED_ITEM,
  NAV_MENU_MAX,
  NAV_TAB_SLOTS,
  isNavItemId,
  isNavLayout,
  mergeNavigation,
  parseNavigation,
  visibleTabs,
  type NavItemId,
  type NavLayout,
  type NavigationPatch,
  type NavigationSettings,
} from "./navigation.ts";
export {
  DEFAULT_THEME,
  EMPTY_SETTINGS,
  LOCALES,
  THEMES,
  isSupportedLocale,
  isTheme,
  parseUserSettings,
  type Locale,
  type Theme,
  type UserSettings,
} from "./settings.ts";
export {
  ACCOUNT_API_PATHS,
  ACCOUNT_ERROR_CODES,
  AUTH_SESSION_PATHS,
  type AccountErrorCode,
  type AccountErrorResponse,
  type AccountView,
  type EnterRequest,
  type EnterResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type SessionResponse,
} from "./accountApi.ts";
