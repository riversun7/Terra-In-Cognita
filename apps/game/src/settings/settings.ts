// 화면 설정(테마·기기 설정 따르기·고른 언어) — 화면(React) 밖에 하나만 둔다. 화면은 useSettings()로 읽는다.
// ADR 2026-10-28-design-system "처음 테마와 기기 설정", "설정 화면과 저장"
// - 기기: localStorage(열쇠·모양은 storage.ts). 언어 자체는 Paraglide가 저장한다. 저장소를 못 쓰면 이번 실행 동안만 기억한다.
// - 화면: <html data-theme>와 주소창 색(<meta name="theme-color">). 첫 화면은 public/theme-init.js가 먼저 걸어 둔다.
//   기기 설정(다크·고대비)이 바뀌면 바로 다시 고른다. 다른 탭에서 바꾸면 그 값을 따른다(storage 이벤트).
// - 계정: 로그인 상태가 되면 accountSync.ts를 불러(동적 import) 맞춘다. tRPC 클라이언트를 첫 화면 묶음에 넣지 않으려고다.
// - 테마를 고르면 "기기 설정에 맞추기"는 꺼진다. 스위치를 끄면 지금 보이는 테마를 그대로 남긴다(화면이 갑자기 바뀌지 않게).
import type { Locale, Theme } from "@terra/shared";
import { useSyncExternalStore } from "react";
import { getSessionState, subscribe as subscribeSession } from "../auth/session.ts";
import { setLocale } from "../paraglide/runtime.js";
import {
  type DeviceSettings,
  SETTINGS_STORAGE_KEY,
  parseDeviceSettings,
  serializeDeviceSettings,
} from "./storage.ts";
import { type SettingsPatch, applyChange } from "./syncRules.ts";
import { CONTRAST_QUERY, DARK_QUERY, type DevicePreferences, THEME_COLORS, resolveTheme } from "./theme.ts";

export interface SettingsSnapshot {
  device: DeviceSettings;
  /** 지금 화면에 걸린 테마 */
  theme: Theme;
}

/** 언어를 바꿀 때 계정에 올리기를 기다리는 최대 시간. 넘으면 새로고침하고, 새로고침 뒤 다시 올린다 */
const LOCALE_UPLOAD_TIMEOUT_MS = 3_000;

function readStored(): DeviceSettings {
  try {
    return parseDeviceSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    // 사파리 개인 정보 보호 모드·차단된 저장소: 정하지 않은 것으로
    return parseDeviceSettings(null);
  }
}

function matches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

const readPreferences = (): DevicePreferences => ({
  contrastMore: matches(CONTRAST_QUERY),
  dark: matches(DARK_QUERY),
});

const listeners = new Set<() => void>();
let device: DeviceSettings = readStored();
let snapshot: SettingsSnapshot = { device, theme: resolveTheme(device, readPreferences()) };
let started = false;
/** 계정과 맞춘 사용자. 로그아웃하면 null로 돌아가 다음 로그인 때 다시 맞춘다 */
let syncedUser: string | null = null;

/** 테마를 다시 골라 <html>·주소창 색에 걸고, 바뀌었으면 화면에 알린다 */
function refresh(): void {
  const theme = resolveTheme(device, readPreferences());
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && meta.getAttribute("content") !== THEME_COLORS[theme]) {
    meta.setAttribute("content", THEME_COLORS[theme]);
  }
  if (snapshot.device === device && snapshot.theme === theme) return;
  snapshot = { device, theme };
  for (const listener of listeners) listener();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSettingsSnapshot(): SettingsSnapshot {
  return snapshot;
}

export function useSettings(): SettingsSnapshot {
  return useSyncExternalStore(subscribeSettings, getSettingsSnapshot);
}

/** 기기 설정(accountSync.ts가 계정과 맞출 때 읽는다) */
export function getDeviceSettings(): DeviceSettings {
  return device;
}

/** 기기 설정을 바꿔 저장하고 화면에 건다(accountSync.ts도 쓴다) */
export function replaceDeviceSettings(next: DeviceSettings): void {
  device = next;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, serializeDeviceSettings(next));
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 기억한다
  }
  refresh();
}

/** accountSync.ts에 넘기는 기기 설정 읽기·쓰기(그 조각이 이 파일을 정적으로 가져오지 않게) */
const deviceStore = { get: getDeviceSettings, replace: replaceDeviceSettings };

const signedInUserId = (): string | null => {
  const session = getSessionState();
  return session.kind === "signed_in" ? session.user.id : null;
};

const loadAccountSync = () => import("./accountSync.ts");

/** 계정에 올린다. 조각을 못 불러오거나 실패하면 "올릴 것" 표시가 남아 다음 로그인 때 올린다 */
async function upload(userId: string, timeoutMs?: number): Promise<void> {
  try {
    const sync = await loadAccountSync();
    await sync.uploadPending(deviceStore, userId, timeoutMs);
  } catch {
    // 다음 로그인 때 다시
  }
}

/** 바꾼 값을 기기에 저장하고 "올릴 것"으로 표시한다. 로그인한 사용자 id(없으면 null)를 돌려준다 */
function change(patch: SettingsPatch): string | null {
  const by = signedInUserId();
  replaceDeviceSettings(applyChange(device, patch, by));
  return by;
}

/** 테마 고르기 — "기기 설정에 맞추기"는 꺼진다 */
export function chooseTheme(theme: Theme): void {
  const by = change({ theme, followSystem: false });
  if (by !== null) void upload(by);
}

/** "기기 설정에 맞추기" 켜기·끄기. 끌 때는 지금 보이는 테마를 고른 테마로 남긴다 */
export function setFollowSystem(on: boolean): void {
  const by = change(on ? { followSystem: true } : { followSystem: false, theme: snapshot.theme });
  if (by !== null) void upload(by);
}

/** 언어 바꾸기 — 로그인했으면 계정에 올린 뒤(최대 3초) Paraglide로 바꾼다(새로고침) */
export async function chooseLocale(locale: Locale): Promise<void> {
  const by = change({ locale });
  if (by !== null) await upload(by, LOCALE_UPLOAD_TIMEOUT_MS);
  await setLocale(locale);
}

/** 로그인 상태가 되면(앱을 켰을 때 이미 로그인돼 있던 경우 포함) 계정과 한 번 맞춘다 */
function onSessionChange(): void {
  const userId = signedInUserId();
  if (userId === syncedUser) return;
  syncedUser = userId;
  if (userId === null) return;
  loadAccountSync()
    .then((sync) => sync.syncAtSignIn(deviceStore, userId))
    .catch(() => {
      // 조각을 못 불러옴(오프라인 등): 다음 로그인 때 다시
    });
}

/** 앱 시작 때 한 번 부른다(main.tsx) */
export function startSettings(): void {
  if (started) return;
  started = true;
  refresh();
  for (const query of [CONTRAST_QUERY, DARK_QUERY]) {
    try {
      window.matchMedia(query).addEventListener("change", refresh);
    } catch {
      // matchMedia가 없는 환경: 기기 설정 변화는 따르지 않는다
    }
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== SETTINGS_STORAGE_KEY) return;
    device = readStored();
    refresh();
  });
  subscribeSession(onSessionChange);
  onSessionChange();
}
