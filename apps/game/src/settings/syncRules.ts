// 기기 ↔ 계정 화면 설정 맞추기 규칙 — 순수 함수(시험 대상). 요청과 저장은 accountSync.ts·settings.ts가 한다.
// ADR 2026-10-28-design-system "맞추는 규칙"
// - 로그인한 동안 바꾸면 기기와 계정에 함께 저장한다. 올리기 전에 "올릴 것"으로 표시해서, 실패하면 다음 로그인 때 올린다.
// - 로그인하지 않은 동안 바꾼 값(예: 로그인 화면에서 바꾼 언어)은 로그인할 때 계정에 올린다.
// - 그 밖에는 로그인할 때 계정 값이 기기 값을 덮는다. 계정에 값이 없으면 기기 값을 올린다.
// 묶음(화면: 테마 + 기기 설정 따르기, 언어)마다 따로 정한다. 기기 시계는 쓰지 않는다.
// "로그인할 때"는 로그인 상태가 된 모든 때다(앱을 켰을 때 이미 로그인돼 있던 경우 포함).
import type { UserSettings } from "@terra/shared";
import { type DeviceSettings, type PendingChanges, SETTINGS_GROUPS, type SettingsGroup } from "./storage.ts";

/** 바꿀 칸만 담은 설정(계정에 올리는 값) */
export type SettingsPatch = Partial<UserSettings>;

const GROUP_KEYS = {
  appearance: ["theme", "followSystem"],
  locale: ["locale"],
} as const satisfies Record<SettingsGroup, readonly (keyof UserSettings)[]>;

/** 묶음의 값만 골라낸다 */
export function groupPatch(settings: UserSettings, group: SettingsGroup): SettingsPatch {
  return group === "appearance"
    ? { theme: settings.theme, followSystem: settings.followSystem }
    : { locale: settings.locale };
}

/** 이 묶음에 정한 값이 있는지(없으면 기본 규칙을 따르는 중) */
export function hasGroup(settings: UserSettings, group: SettingsGroup): boolean {
  return group === "appearance" ? settings.theme !== null || settings.followSystem : settings.locale !== null;
}

const touches = (patch: SettingsPatch, group: SettingsGroup): boolean =>
  GROUP_KEYS[group].some((key) => key in patch);

const matches = (settings: UserSettings, patch: SettingsPatch, group: SettingsGroup): boolean =>
  GROUP_KEYS[group].every((key) => !(key in patch) || patch[key] === settings[key]);

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

/** 묶음들의 값을 하나로. 묶음이 없으면 null */
function patchOf(settings: UserSettings, groups: readonly SettingsGroup[]): SettingsPatch | null {
  if (groups.length === 0) return null;
  return groups.reduce<SettingsPatch>((patch, group) => ({ ...patch, ...groupPatch(settings, group) }), {});
}

/** 이 사용자(또는 로그인 전)가 바꾼 묶음인지 */
const markedFor = (device: DeviceSettings, group: SettingsGroup, userId: string): boolean => {
  const mark = device.pending[group];
  return mark !== undefined && (mark.by === null || mark.by === userId);
};

/** 이 사용자가 올려야 할 값(그 사용자가, 또는 로그인 전에 바꾼 묶음). 없으면 null */
export function pendingPatch(device: DeviceSettings, userId: string): SettingsPatch | null {
  return patchOf(
    device,
    SETTINGS_GROUPS.filter((group) => markedFor(device, group, userId)),
  );
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
