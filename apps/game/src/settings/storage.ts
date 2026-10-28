// 기기 저장소(localStorage)의 화면 설정 — 읽기·쓰기 모양(순수 함수, 시험 대상). 저장소를 만지는 일은 settings.ts가 한다.
// public/theme-init.js도 같은 열쇠·모양({ v: 1, theme, followSystem })을 읽는다 → themeSources.test.ts가 확인한다.
// 언어 자체는 Paraglide가 따로 저장한다. 여기의 locale은 "사용자가 고른 언어"다(Paraglide는 처음 정한 언어도 저장해서 구분이 안 된다).
import { EMPTY_SETTINGS, type UserSettings, parseUserSettings } from "@terra/shared";
import { field } from "../net/json.ts";

export const SETTINGS_STORAGE_KEY = "terra.settings";
/** 저장 모양이 바뀌면 올린다. 모르는 판은 아무것도 정하지 않은 것으로 읽는다 */
export const SETTINGS_FORMAT_VERSION = 1;

/** 따로 맞추는 묶음: 화면(테마 + 기기 설정 따르기), 언어 */
export type SettingsGroup = "appearance" | "locale";
export const SETTINGS_GROUPS: readonly SettingsGroup[] = ["appearance", "locale"];

/** 아직 계정에 올리지 못한 바꿈. by는 바꾼 사용자 id, 로그인하지 않았을 때 바꿨으면 null */
export type PendingChanges = Partial<Record<SettingsGroup, { by: string | null }>>;

export interface DeviceSettings extends UserSettings {
  pending: PendingChanges;
}

export const EMPTY_DEVICE_SETTINGS: DeviceSettings = { ...EMPTY_SETTINGS, pending: {} };

/** 저장된 문자열 → 설정. 없거나 깨졌거나 모르는 판이면 아무것도 정하지 않은 설정 */
export function parseDeviceSettings(raw: string | null): DeviceSettings {
  if (raw === null) return EMPTY_DEVICE_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_DEVICE_SETTINGS;
  }
  if (field(data, "v") !== SETTINGS_FORMAT_VERSION) return EMPTY_DEVICE_SETTINGS;
  const pendingData = field(data, "pending");
  const pending: PendingChanges = {};
  for (const group of SETTINGS_GROUPS) {
    const by = field(field(pendingData, group), "by");
    if (by === null || typeof by === "string") pending[group] = { by };
  }
  return { ...parseUserSettings(data), pending };
}

export function serializeDeviceSettings(settings: DeviceSettings): string {
  return JSON.stringify({
    v: SETTINGS_FORMAT_VERSION,
    theme: settings.theme,
    followSystem: settings.followSystem,
    locale: settings.locale,
    pending: settings.pending,
  });
}
