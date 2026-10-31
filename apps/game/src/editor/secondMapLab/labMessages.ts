// 2차맵 시험 화면 문구 표 — 지표·소품 그림·엄폐·시험 자리·실패 코드 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다)
import type { MapPreset } from "@terra/planet/secondMap";
import { MAP_PROP_ARTS } from "@terra/shared";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import type { LabErrorCode } from "./labSource.ts";

// 행성 편집기의 같은 도우미(editor/planet/editorMessages.ts)를 가져오지 않고 여기 둔다: 개발자 도구 둘이 같이 쓰는 조각에
// 편집기 모듈이 들면 미리 캐시 검사에 걸린다(labSource.ts 머리 주석)

/** 시험 자리 종류(@terra/planet/secondMap MAP_PRESETS와 같은 차례. 그 진입점은 생성기를 함께 묶어서 값은 가져오지 않는다) */
export const LAB_PRESETS = [
  "river",
  "coast",
  "lake",
  "mountain",
  "forest",
  "grassland",
] as const satisfies readonly MapPreset[];

/** 지금 언어의 수 글(소수 digits자리) */
export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** 콘텐츠 이름 {ko, en} → 지금 언어 글. 없으면 fallback */
export function localName(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) return fallback;
  const text: unknown = Reflect.get(value, getLocale() === "en" ? "en" : "ko");
  return typeof text === "string" && text !== "" ? text : fallback;
}

/** 지표 코드(엔진 SURFACE, 2차맵 생성기 SM_SURFACE와 같은 번호) → 이름 */
const SURFACE_TEXT: readonly (() => string)[] = [
  m.second_map_lab_surface_water,
  m.second_map_lab_surface_grass,
  m.second_map_lab_surface_dirt,
  m.second_map_lab_surface_rock,
  m.second_map_lab_surface_sand,
  m.second_map_lab_surface_gravel,
  m.second_map_lab_surface_snow,
  m.second_map_lab_surface_ice,
  m.second_map_lab_surface_mud,
  m.second_map_lab_surface_ash,
  m.second_map_lab_surface_shallow_water,
];

export function surfaceText(code: number): string {
  return SURFACE_TEXT[code]?.() ?? m.second_map_lab_surface_unknown({ code: String(code) });
}

/** 소품 그림 이름(@terra/shared MAP_PROP_ARTS) → 문구 */
const ART_TEXT: Readonly<Record<(typeof MAP_PROP_ARTS)[number], () => string>> = {
  none: m.second_map_lab_art_none,
  tree_broadleaf: m.second_map_lab_art_tree_broadleaf,
  tree_conifer: m.second_map_lab_art_tree_conifer,
  tree_palm: m.second_map_lab_art_tree_palm,
  bush: m.second_map_lab_art_bush,
  reeds: m.second_map_lab_art_reeds,
  boulder: m.second_map_lab_art_boulder,
  log: m.second_map_lab_art_log,
};

export function artText(code: number | null): string {
  if (code === null) return m.second_map_lab_no_layer();
  const name = MAP_PROP_ARTS[code];
  return name ? ART_TEXT[name]() : m.second_map_lab_art_unknown({ code: String(code) });
}

export function coverText(cover: number | null): string {
  if (cover === null) return m.second_map_lab_no_layer();
  if (cover >= 2) return m.second_map_lab_cover_hard();
  return cover === 1 ? m.second_map_lab_cover_concealment() : m.second_map_lab_cover_none();
}

/** 빨리 가기 단추(시험 2차맵 + 시험 자리 종류) */
export const PRESET_TEXT: Readonly<Record<MapPreset | "test", () => string>> = {
  test: m.second_map_lab_preset_test,
  river: m.second_map_lab_preset_river,
  coast: m.second_map_lab_preset_coast,
  lake: m.second_map_lab_preset_lake,
  mountain: m.second_map_lab_preset_mountain,
  forest: m.second_map_lab_preset_forest,
  grassland: m.second_map_lab_preset_grassland,
};

export function labErrorText(code: LabErrorCode): string {
  switch (code) {
    case "none":
      return m.second_map_lab_error_none();
    case "bad_key":
      return m.second_map_lab_error_bad_key();
    case "not_ready":
      return m.second_map_lab_error_not_ready();
    case "forbidden":
      return m.second_map_lab_error_forbidden();
    case "cancelled":
      return m.second_map_lab_error_cancelled();
    default:
      return m.second_map_lab_error_failed({ code });
  }
}
