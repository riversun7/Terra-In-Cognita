// 편집기 화면의 키로 고르는 이름표·수 모양 — ADR 38 13절 "키로 고르는 이름표는 편집기 조각 안 표(editorMessages.ts)에 둔다"
// 메시지 네임스페이스를 계산해서 읽지 않는다(oxlint import/namespace): 키마다 m.<키>를 적은 표다.
// 이 파일은 편집기 조각에만 들어간다(첫 화면 묶음에 넣지 않는다).
import type { PlanetPresetAxis, PlanetSettingKey } from "@terra/shared";
import type { BiomeAxis } from "@terra/planet/generator";
import type { OceanDepthClass } from "@terra/shared";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import type { DraftDeniedReason, DraftSyncSnapshot } from "./draftSync.ts";
import type { PreviewErrorCode } from "./previewTypes.ts";

export const AXIS_LABELS: Readonly<Record<PlanetPresetAxis, () => string>> = {
  seaLevel: m.planet_editor_axis_sea_level,
  temperature: m.planet_editor_axis_temperature,
  precipitation: m.planet_editor_axis_precipitation,
  mountains: m.planet_editor_axis_mountains,
  plates: m.planet_editor_axis_plates,
  volcanism: m.planet_editor_axis_volcanism,
};

/** 프리셋 단계 이름(모든 축의 단계 이름 합집합) */
const LEVEL_LABELS: Readonly<Record<string, () => string>> = {
  archipelago: m.planet_editor_level_archipelago,
  normal: m.planet_editor_level_normal,
  continent: m.planet_editor_level_continent,
  cold: m.planet_editor_level_cold,
  hot: m.planet_editor_level_hot,
  dry: m.planet_editor_level_dry,
  wet: m.planet_editor_level_wet,
  young: m.planet_editor_level_young,
  old: m.planet_editor_level_old,
  few: m.planet_editor_level_few,
  many: m.planet_editor_level_many,
  low: m.planet_editor_level_low,
  high: m.planet_editor_level_high,
};

/** 단계 이름(모르는 단계면 그 ID 그대로: 공유 표에 단계가 늘었는데 이름표가 없을 때) */
export function levelLabel(level: string): string {
  return LEVEL_LABELS[level]?.() ?? level;
}

type SettingUnit = "percent" | "count" | "celsius";

export const SETTING_LABELS: Readonly<Record<PlanetSettingKey, { name: () => string; unit: SettingUnit }>> = {
  landPercent: { name: m.planet_editor_setting_land_percent, unit: "percent" },
  shelfPercent: { name: m.planet_editor_setting_shelf_percent, unit: "percent" },
  plateCount: { name: m.planet_editor_setting_plate_count, unit: "count" },
  upliftPercent: { name: m.planet_editor_setting_uplift_percent, unit: "percent" },
  ruggednessPercent: { name: m.planet_editor_setting_ruggedness_percent, unit: "percent" },
  erosionPercent: { name: m.planet_editor_setting_erosion_percent, unit: "percent" },
  hotspotCount: { name: m.planet_editor_setting_hotspot_count, unit: "count" },
  volcanismPercent: { name: m.planet_editor_setting_volcanism_percent, unit: "percent" },
  equatorTemperatureC: { name: m.planet_editor_setting_equator_temperature, unit: "celsius" },
  poleTemperatureC: { name: m.planet_editor_setting_pole_temperature, unit: "celsius" },
  precipitationPercent: { name: m.planet_editor_setting_precipitation_percent, unit: "percent" },
  riverDensityPercent: { name: m.planet_editor_setting_river_density_percent, unit: "percent" },
  lakePercent: { name: m.planet_editor_setting_lake_percent, unit: "percent" },
};

/** 세부 수치 값 + 단위 */
export function settingValue(key: PlanetSettingKey, value: number): string {
  const text = formatNumber(value);
  switch (SETTING_LABELS[key].unit) {
    case "percent":
      return m.planet_editor_value_percent({ value: text });
    case "count":
      return m.planet_editor_value_count({ value: text });
    case "celsius":
      return m.planet_editor_value_celsius({ value: text });
    default:
      return text;
  }
}

export const DEPTH_LABELS: Readonly<Record<OceanDepthClass, () => string>> = {
  coastal: m.planet_editor_depth_coastal,
  shelf: m.planet_editor_depth_shelf,
  deep: m.planet_editor_depth_deep,
};

export const CONDITION_LABELS: Readonly<Record<BiomeAxis, () => string>> = {
  temperatureC: m.planet_editor_cond_temperature,
  humidity: m.planet_editor_cond_humidity,
  realElevationM: m.planet_editor_cond_elevation,
};

const REASONS: Readonly<Record<string, () => string>> = {
  entry_too_large: m.planet_editor_reason_entry_too_large,
  invalid_entry: m.planet_editor_reason_invalid_entry,
  unknown_biome: m.planet_editor_reason_unknown_biome,
  unknown_planet: m.planet_editor_reason_unknown_planet,
  generator_rejected: m.planet_editor_reason_generator_rejected,
  too_large: m.planet_editor_reason_too_large,
  not_json: m.planet_editor_reason_not_json,
  unknown_format: m.planet_editor_reason_unknown_format,
};

/** 받지 않음·가져오기 코드 → 문구(모르는 코드는 코드를 그대로 적은 일반 문구) */
export function reasonText(code: string): string {
  return REASONS[code]?.() ?? m.planet_editor_reason_other({ code });
}

const PREVIEW_ERRORS: Readonly<Record<PreviewErrorCode, () => string>> = {
  rejected: m.planet_editor_error_rejected,
  failed: m.planet_editor_error_failed,
  crashed: m.planet_editor_error_crashed,
  unavailable: m.planet_editor_no_worker,
};

export function previewErrorText(code: PreviewErrorCode): string {
  return PREVIEW_ERRORS[code]();
}

const DENIED: Readonly<Record<DraftDeniedReason, () => string>> = {
  unauthorized: m.planet_editor_save_denied_unauthorized,
  forbidden: m.planet_editor_save_denied_forbidden,
  invalid_request: m.planet_editor_save_denied_invalid,
};

/** 초안 저장 상태 한 줄 */
export function saveStatusText(sync: DraftSyncSnapshot): string {
  switch (sync.status) {
    case "loading":
      return m.planet_editor_save_loading();
    case "load_failed":
      return m.planet_editor_save_load_failed();
    case "saved":
      return sync.revision > 0
        ? m.planet_editor_save_saved({ revision: String(sync.revision) })
        : m.planet_editor_save_none();
    case "pending":
      return m.planet_editor_save_pending();
    case "saving":
      return m.planet_editor_save_saving();
    case "retrying":
      return m.planet_editor_save_retrying();
    case "conflict":
      return m.planet_editor_save_conflict();
    case "rejected":
      return m.planet_editor_save_rejected({ reason: reasonText(sync.rejectedCode ?? "") });
    case "denied":
      return DENIED[sync.deniedReason ?? "forbidden"]();
    case "busy":
      return m.planet_editor_save_busy();
    default: {
      const unhandled: never = sync.status;
      return unhandled;
    }
  }
}

/** 지금 언어의 수(정수는 그대로, 실수는 자릿수만큼) */
export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** 0~1 몫 → 백분율 글(소수 한 자리) */
export function formatShare(share: number): string {
  return m.planet_editor_value_percent({ value: formatNumber(share * 100, 1) });
}

/** 몫 차이(0~1 단위) → %p 글(부호 붙임, 소수 한 자리). 0.05%p 아래는 0으로 */
export function formatShareDiff(diff: number): string {
  const points = Math.round(diff * 1000) / 10;
  const sign = points > 0 ? "+" : points < 0 ? "−" : "±";
  return m.planet_editor_value_pp({ value: `${sign}${formatNumber(Math.abs(points), 1)}` });
}

/** 바이트 → KB·MB(1000 단위가 아닌 1024 단위, 소수 한 자리) */
export function formatBytes(bytes: number): string {
  const kib = bytes / 1024;
  if (kib < 1024) return m.planet_editor_size_kb({ value: formatNumber(kib, kib < 10 ? 1 : 0) });
  return m.planet_editor_size_mb({ value: formatNumber(kib / 1024, 1) });
}

/** ISO 시각 → 지금 언어의 날짜·시각(짧게). 틀리면 그대로 */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "short", timeStyle: "medium" }).format(date);
}

/** 이름 묶음 { ko, en } → 지금 언어(없으면 ID) */
export function localName(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) return fallback;
  const text: unknown = Reflect.get(value, getLocale() === "en" ? "en" : "ko");
  return typeof text === "string" && text !== "" ? text : fallback;
}
