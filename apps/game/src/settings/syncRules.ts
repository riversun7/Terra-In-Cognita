// 기기 ↔ 계정 설정 맞추기 규칙 — 순수 함수(시험 대상). 요청과 저장은 accountSync.ts·settings.ts가 한다.
// ADR 2026-10-28-design-system "맞추는 규칙", ADR 2026-10-29-app-shell 5절(묶음 표)
// - 로그인한 동안 바꾸면 기기와 계정에 함께 저장한다. 올리기 전에 "올릴 것"으로 표시해서, 실패하면 다음 로그인 때 올린다.
// - 로그인하지 않은 동안 바꾼 값(예: 로그인 화면에서 바꾼 언어)은 로그인할 때 계정에 올린다.
// - 그 밖에는 로그인할 때 계정 값이 기기 값을 덮는다. 계정에 값이 없으면 기기 값을 올린다.
// 묶음(화면: 테마 + 기기 설정 따르기, 언어, 메뉴, 홈)마다 따로 정한다(아래 GROUPS 표). 기기 시계는 쓰지 않는다.
// 메뉴·홈은 모양을 모르는 JSON 객체 그대로 옮긴다(안쪽을 읽지 않는다). 읽기는 틀(parseNavigation)·홈 조각(parseHome)이 한다.
// "로그인할 때"는 로그인 상태가 된 모든 때다(앱을 켰을 때 이미 로그인돼 있던 경우 포함).
import type { UserSettings } from "@terra/shared";
import { type DeviceSettings, type PendingChanges, SETTINGS_GROUPS, type SettingsGroup } from "./storage.ts";

/** 바꿀 칸만 담은 설정(계정에 올리는 값) */
export type SettingsPatch = Partial<UserSettings>;

interface GroupRule {
  /** 이 묶음의 칸 */
  readonly keys: readonly (keyof UserSettings)[];
  /** 정한 값이 있는지(없으면 기본 규칙을 따르는 중) */
  readonly has: (settings: UserSettings) => boolean;
  /** 묶음의 값만 골라낸다. 메뉴·홈은 값이 없으면 빈 객체(올릴 것이 없다) */
  readonly pick: (settings: UserSettings) => SettingsPatch;
}

/** 맞추는 묶음 표(ADR 37 5절). 묶음을 더할 때는 storage.ts의 SettingsGroup·SETTINGS_GROUPS와 이 표에 한 줄씩 더한다 */
const GROUPS: { readonly [G in SettingsGroup]: GroupRule } = {
  appearance: {
    keys: ["theme", "followSystem"],
    has: (settings) => settings.theme !== null || settings.followSystem,
    pick: (settings) => ({ theme: settings.theme, followSystem: settings.followSystem }),
  },
  locale: {
    keys: ["locale"],
    has: (settings) => settings.locale !== null,
    pick: (settings) => ({ locale: settings.locale }),
  },
  nav: {
    keys: ["nav"],
    has: (settings) => settings.nav !== undefined,
    pick: (settings) => (settings.nav === undefined ? {} : { nav: settings.nav }),
  },
  home: {
    keys: ["home"],
    has: (settings) => settings.home !== undefined,
    pick: (settings) => (settings.home === undefined ? {} : { home: settings.home }),
  },
};

/** 묶음의 값만 골라낸다 */
export function groupPatch(settings: UserSettings, group: SettingsGroup): SettingsPatch {
  return GROUPS[group].pick(settings);
}

/** 이 묶음에 정한 값이 있는지(없으면 기본 규칙을 따르는 중) */
export function hasGroup(settings: UserSettings, group: SettingsGroup): boolean {
  return GROUPS[group].has(settings);
}

const touches = (patch: SettingsPatch, group: SettingsGroup): boolean =>
  GROUPS[group].keys.some((key) => key in patch);

/** 같은 값인지. 메뉴·홈(객체)은 JSON 글자가 같으면 같다(저장소에서 다시 읽은 값은 다른 객체라서) */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

const matches = (settings: UserSettings, patch: SettingsPatch, group: SettingsGroup): boolean =>
  GROUPS[group].keys.every((key) => !(key in patch) || sameValue(patch[key], settings[key]));

function withoutMark(pending: PendingChanges, group: SettingsGroup): PendingChanges {
  const next = { ...pending };
  delete next[group];
  return next;
}

/** 기기에서 바꿈: 값을 바꾸고 그 묶음을 "올릴 것"으로 표시한다. by는 바꾼 사용자(로그인 전이면 null) */
export function applyChange(device: DeviceSettings, patch: SettingsPatch, by: string | null): DeviceSettings {
  const pending = { ...device.pending };
  for (const group of SETTINGS_GROUPS) {
    if (touches(patch, group)) pending[group] = { by };
  }
  return { ...device, ...patch, pending };
}

/** 묶음들의 값을 하나로. 올릴 칸이 없으면 null */
function patchOf(settings: UserSettings, groups: readonly SettingsGroup[]): SettingsPatch | null {
  const patch = groups.reduce<SettingsPatch>(
    (sum, group) => ({ ...sum, ...groupPatch(settings, group) }),
    {},
  );
  return Object.keys(patch).length === 0 ? null : patch;
}

/**
 * 이 사용자(또는 로그인 전)가 바꾼 묶음인지. 올릴 값이 없는 표시(메뉴·홈 값이 없음: 다른 판이 남긴 것 등)는 보지 않는다 —
 * 그런 표시가 계정 값을 막지 않게.
 */
const markedFor = (device: DeviceSettings, group: SettingsGroup, userId: string): boolean => {
  const mark = device.pending[group];
  return (
    mark !== undefined &&
    (mark.by === null || mark.by === userId) &&
    Object.keys(groupPatch(device, group)).length > 0
  );
};

/** 이 사용자가 올려야 할 값(그 사용자가, 또는 로그인 전에 바꾼 묶음). 없으면 null */
export function pendingPatch(device: DeviceSettings, userId: string): SettingsPatch | null {
  return patchOf(
    device,
    SETTINGS_GROUPS.filter((group) => markedFor(device, group, userId)),
  );
}

/**
 * 올릴 값을 묶음마다 나눈다(묶음 표 순서). 묶음마다 따로 올려서, 옛 서버가 모르는 칸(nav·home)을 막아도 다른 묶음은 올라간다
 * (accountSync.ts가 같은 틱에 불러 HTTP 요청은 하나다)
 */
export function splitByGroup(patch: SettingsPatch): SettingsPatch[] {
  const parts: SettingsPatch[] = [];
  for (const group of SETTINGS_GROUPS) {
    const part: SettingsPatch = {};
    for (const key of GROUPS[group].keys) {
      if (key in patch) Object.assign(part, { [key]: patch[key] });
    }
    if (Object.keys(part).length > 0) parts.push(part);
  }
  return parts;
}

export interface SignInPlan {
  /** 기기의 다음 상태. 올릴 묶음은 이 사용자 이름으로 "올릴 것" 표시가 남는다(올리기에 성공하면 afterUpload가 지운다) */
  device: DeviceSettings;
  /** 계정에 올릴 값. 없으면 null */
  upload: SettingsPatch | null;
}

/**
 * 로그인할 때 묶음마다:
 * 1. 이 사용자(또는 로그인 전)가 바꾸고 아직 못 올린 묶음 → 기기 값을 올린다.
 * 2. 계정에 값이 있으면 → 계정 값으로 기기를 덮는다. 다른 사용자가 남긴 "올릴 것" 표시는 버린다.
 * 3. 계정에 값이 없고 기기에 있으면 → 기기 값을 올린다.
 */
export function planSignIn(device: DeviceSettings, account: UserSettings | null, userId: string): SignInPlan {
  let next: DeviceSettings = { ...device, pending: {} };
  const uploadGroups: SettingsGroup[] = [];
  for (const group of SETTINGS_GROUPS) {
    const mine = markedFor(device, group, userId);
    if (!mine && account !== null && hasGroup(account, group)) {
      next = { ...next, ...groupPatch(account, group) };
      continue;
    }
    if (mine || hasGroup(device, group)) {
      uploadGroups.push(group);
      next = { ...next, pending: { ...next.pending, [group]: { by: userId } } };
    }
  }
  return { device: next, upload: patchOf(device, uploadGroups) };
}

/** 올리기에 성공한 뒤: 올린 값과 지금 기기 값이 같은 묶음만 표시를 지운다(그새 또 바꿨으면 남긴다) */
export function afterUpload(device: DeviceSettings, sent: SettingsPatch): DeviceSettings {
  let pending = device.pending;
  for (const group of SETTINGS_GROUPS) {
    if (touches(sent, group) && matches(device, sent, group)) pending = withoutMark(pending, group);
  }
  return pending === device.pending ? device : { ...device, pending };
}

/** 같은 언어로 다시 새로고침하지 않는 시간. 저장이 막힌 기기에서 새로고침이 끝없이 반복되지 않게 */
export const LOCALE_RELOAD_GUARD_MS = 60_000;

export interface LocaleReloadMark {
  locale: string;
  at: number;
}

/** 계정 언어로 바꾸며 새로고침해도 되는지. 시계가 뒤로 가도 차이의 절댓값으로 본다 */
export function canReloadForLocale(last: LocaleReloadMark | null, target: string, now: number): boolean {
  return last === null || last.locale !== target || Math.abs(now - last.at) >= LOCALE_RELOAD_GUARD_MS;
}

/** sessionStorage에 남긴 표시 읽기. 모양이 틀리면 null */
export function parseLocaleReloadMark(raw: string | null): LocaleReloadMark | null {
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const locale: unknown = Reflect.get(data, "locale");
    const at: unknown = Reflect.get(data, "at");
    return typeof locale === "string" && typeof at === "number" && Number.isFinite(at)
      ? { locale, at }
      : null;
  } catch {
    return null;
  }
}
