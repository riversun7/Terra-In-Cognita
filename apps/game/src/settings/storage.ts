// 기기 저장소(localStorage)의 설정 — 읽기·쓰기 모양(순수 함수, 시험 대상). 저장소를 만지는 일은 settings.ts가 한다.
// public/theme-init.js도 같은 열쇠·모양({ v: 1, theme, followSystem })을 읽는다 → themeSources.test.ts가 확인한다.
// 언어 자체는 Paraglide가 따로 저장한다. 여기의 locale은 "사용자가 고른 언어"다(Paraglide는 처음 정한 언어도 저장해서 구분이 안 된다).
// 메뉴(nav)·홈(home)은 모양을 모르는 JSON 객체 그대로 쓰고 읽는다(ADR 2026-10-29-app-shell 5절). 판(v)은 1 그대로다:
// 올리면 theme-init.js가 저장된 테마를 버린다. 칸을 더하기만 하므로 옛 앱은 모르는 칸을 무시한다(다시 쓸 때 지운다, ADR 37 5절 감수).
import {
  EMPTY_SETTINGS,
  SETTINGS_OBJECT_MAX_BYTES,
  type SettingsObject,
  type UserSettings,
  hasUnstorableText,
  isSettingsObject,
  parseUserSettings,
  utf8ByteLength,
} from "@terra/shared";
import { field } from "../net/json.ts";

export const SETTINGS_STORAGE_KEY = "terra.settings";
/** 저장 모양이 바뀌면 올린다. 모르는 판은 아무것도 정하지 않은 것으로 읽는다 */
export const SETTINGS_FORMAT_VERSION = 1;

/** 따로 맞추는 묶음: 화면(테마 + 기기 설정 따르기), 언어, 메뉴, 홈. 묶음마다의 칸·규칙은 syncRules.ts 표 */
export type SettingsGroup = "appearance" | "locale" | "nav" | "home";
export const SETTINGS_GROUPS: readonly SettingsGroup[] = ["appearance", "locale", "nav", "home"];

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
  // 메뉴·홈이 없으면(undefined) JSON에 칸이 생기지 않는다
  return JSON.stringify({
    v: SETTINGS_FORMAT_VERSION,
    theme: settings.theme,
    followSystem: settings.followSystem,
    locale: settings.locale,
    nav: settings.nav,
    home: settings.home,
    pending: settings.pending,
  });
}

/**
 * 메뉴·홈 값을 기기에 저장할 모양으로: JSON으로 한 번 바꿔 새 객체를 만든다(부른 쪽 객체와 나누지 않고, undefined 칸 등
 * JSON에 없는 것은 빠진다 = 저장한 뒤 다시 읽은 값과 같다). 안쪽 모양은 보지 않는다(모르는 칸도 남는다).
 * 서버가 받지 않는 값이면 null: 크기 상한(4KB)을 넘음, JSON으로 바꿀 수 없음, 계정에 저장할 수 없는 글자(NUL·짝 없는
 * 대리 문자)가 듦. 그런 값을 저장하면 올리기가 늘 실패해 "올릴 것"이 남고, 그 묶음의 계정 값이 이 기기에 다시 오지 않는다.
 */
export function storableSettingsObject(value: SettingsObject): SettingsObject | null {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return null;
  }
  // toJSON이 객체가 아닌 값을 돌려주면 stringify가 undefined를 낸다(타입은 string)
  if (typeof text !== "string" || utf8ByteLength(text) > SETTINGS_OBJECT_MAX_BYTES) return null;
  const copy: unknown = JSON.parse(text);
  return isSettingsObject(copy) && !hasUnstorableText(copy) ? copy : null;
}
