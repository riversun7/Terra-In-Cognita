// 설정(테마·기기 설정 따르기·고른 언어·메뉴·홈) — 화면(React) 밖에 하나만 둔다. 화면은 useSettings()로 읽는다.
// ADR 2026-10-28-design-system "처음 테마와 기기 설정", "설정 화면과 저장", ADR 2026-10-29-app-shell 5절
// - 기기: localStorage(열쇠·모양은 storage.ts). 언어 자체는 Paraglide가 저장한다. 저장소를 못 쓰면 이번 실행 동안만 기억한다.
// - 화면: <html data-theme>와 주소창 색(<meta name="theme-color">). 첫 화면은 public/theme-init.js가 먼저 걸어 둔다.
//   기기 설정(다크·고대비)이 바뀌면 바로 다시 고른다. 다른 탭에서 바꾸면 그 값을 따른다(storage 이벤트).
// - 계정: 로그인 상태가 되면 accountSync.ts를 불러(동적 import) 맞춘다. tRPC 클라이언트를 첫 화면 묶음에 넣지 않으려고다.
//   계정 요청(맞추기·올리기)은 한 줄로 세워 하나씩 보낸다: 빨리 잇달아 바꿔도 먼저 보낸 값이 나중 값을 덮지 않게.
// - 테마를 고르면 "기기 설정에 맞추기"는 꺼진다. 스위치를 끄면 지금 보이는 테마를 그대로 남긴다(화면이 갑자기 바뀌지 않게).
// - 시세 색(D-442)은 기기에만 저장한다(계정 칸 없음): chooseMarketColors. 화면은 resolveMarketColors(device.marketColors, 언어).
// - 메뉴(nav)·홈(home)은 모양을 모르는 JSON 객체다. 읽기는 쓰는 곳이 한다: 틀은 parseNavigation(device.nav),
//   홈 조각은 parseHome(device.home, 역할). 바꿀 때는 mergeNavigation·mergeHome으로 지금 값에 바꾼 칸만 덮어 만든 값을 넘긴다
//   (chooseNavigation·chooseHome). 그래서 이 파일은 @terra/shared/dashboard를 가져오지 않는다(첫 화면 묶음).
import type { Locale, SettingsObject, Theme } from "@terra/shared";
import { useSyncExternalStore } from "react";
import { getSessionState, subscribe as subscribeSession } from "../auth/session.ts";
import { setLocale } from "../paraglide/runtime.js";
import {
  type DeviceSettings,
  SETTINGS_STORAGE_KEY,
  parseDeviceSettings,
  serializeDeviceSettings,
  storableSettingsObject,
} from "./storage.ts";
import { type SettingsPatch, applyChange } from "./syncRules.ts";
import type { MarketColorChoice } from "./marketColors.ts";
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

const signedInUserId = (): string | null => {
  const session = getSessionState();
  return session.kind === "signed_in" ? session.user.id : null;
};

/** accountSync.ts에 넘기는 기기 설정 읽기·쓰기와 지금 로그인한 사용자(그 조각이 이 파일을 정적으로 가져오지 않게) */
const deviceStore = { get: getDeviceSettings, replace: replaceDeviceSettings, signedInUserId };

const loadAccountSync = () => import("./accountSync.ts");

/**
 * 계정 요청 줄: 앞의 요청(맞추기·올리기)이 끝난 뒤 다음을 보낸다. 실패는 삼킨다("올릴 것" 표시가 남는다).
 * 차례가 왔을 때 그 요청의 사용자가 로그아웃했거나 다른 계정으로 바뀌었으면 보내지 않는다. 쿠키는 보낼 때의 계정 것이라
 * 앞 계정의 바꿈이 지금 계정에 저장되기 때문이다. "올릴 것" 표시는 남고, 지금 계정의 로그인 맞추기가 정한다
 * (그 맞추기는 로그인한 때 줄에 섰으므로 늘 건너뛴 요청 뒤에 돈다).
 */
let accountQueue: Promise<void> = Promise.resolve();
/** 줄에서 차례를 기다리는(아직 보내지 않은) 올리기. 그동안 바꾼 값은 이 올리기가 함께 보낸다 */
let waitingUpload: Promise<void> | null = null;

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = accountQueue.then(task).catch(() => {
    // 조각을 못 불러옴(오프라인 등)·요청 실패: 다음 로그인 때 다시
  });
  accountQueue = run;
  return run;
}

/**
 * 계정에 올린다. 차례가 오면 그때의 "올릴 것"을 모두 보낸다. 보내는 동안 또 바꾸면 끝난 뒤 한 번 더 보낸다.
 * 실패하면 "올릴 것" 표시가 남아 다음 로그인 때 올린다.
 */
function upload(userId: string, timeoutMs?: number): Promise<void> {
  waitingUpload ??= enqueue(async () => {
    waitingUpload = null;
    const sync = await loadAccountSync();
    // 조각을 불러온 뒤(보내기 바로 앞)에 본다: 줄에서 기다린 시간과 조각을 받는 시간 모두에 계정이 바뀔 수 있다
    if (signedInUserId() !== userId) return;
    await sync.uploadPending(deviceStore, userId, timeoutMs);
  });
  return waitingUpload;
}

/** 정한 시간만큼 기다린다 */
const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

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

/** 시세 색 고르기(D-442) — 기기에만 저장한다(계정에 올리지 않는다, "올릴 것" 표시도 없다) */
export function chooseMarketColors(choice: MarketColorChoice): void {
  replaceDeviceSettings({ ...device, marketColors: choice });
}

/** 물류센터 자동 맡기기(D-576) — 기기에만 저장한다(시세 색과 같다). 켜면 운반 명령이 내 운반꾼이 없을 때 같은 도시의 가장 싼 물류센터에 맡긴다 */
export function setAutoHaul(on: boolean): void {
  const next: DeviceSettings = { ...device };
  if (on) next.autoHaul = true;
  else delete next.autoHaul;
  replaceDeviceSettings(next);
}

/** 언어 바꾸기 — 로그인했으면 계정에 올린 뒤(최대 3초, 줄에서 기다리는 시간 포함) Paraglide로 바꾼다(새로고침) */
export async function chooseLocale(locale: Locale): Promise<void> {
  const by = change({ locale });
  if (by !== null) {
    await Promise.race([upload(by, LOCALE_UPLOAD_TIMEOUT_MS), wait(LOCALE_UPLOAD_TIMEOUT_MS)]);
  }
  await setLocale(locale);
}

/**
 * 메뉴·홈 값 바꾸기 — chooseTheme와 같은 길(기기에 저장 → 로그인했으면 계정에 올림).
 * JSON으로 복사해 저장한다(부른 쪽 객체를 나중에 고쳐도 저장값은 그대로, 다시 읽은 값과 같다).
 * 크기 상한(4KB)을 넘거나 JSON으로 바꿀 수 없으면 저장하지 않고 false다(서버도 받지 않는 값이다).
 */
function chooseObject(key: "nav" | "home", value: SettingsObject): boolean {
  const copy = storableSettingsObject(value);
  if (copy === null) return false;
  const by = change(key === "nav" ? { nav: copy } : { home: copy });
  if (by !== null) void upload(by);
  return true;
}

/**
 * 메뉴 설정 바꾸기(ADR 2026-10-29-app-shell 4·5절). 값은 지금 값에 바꾼 칸만 덮어 만든다:
 * `chooseNavigation(mergeNavigation(getSettingsSnapshot().device.nav, 바꾼 칸))` — 더 새 버전이 넣은 칸이 남는다.
 * 저장하지 않았으면(상한을 넘음) false
 */
export function chooseNavigation(nav: SettingsObject): boolean {
  return chooseObject("nav", nav);
}

/**
 * 홈 설정 바꾸기(ADR 2026-10-29-app-shell 5·6절). 값은 홈 조각이 지금 값에 바꾼 칸만 덮어 만든다:
 * `chooseHome(mergeHome(getSettingsSnapshot().device.home, 바꾼 칸))`(@terra/shared/dashboard). 저장하지 않았으면 false.
 * dev·admin이 아닌 계정이 기본값이 아닌 템플릿을 보내면 서버가 그 칸만 기본값으로 바꿔 저장한다(다음 로그인 때 기기에도 온다)
 */
export function chooseHome(home: SettingsObject): boolean {
  return chooseObject("home", home);
}

/** 로그인 상태가 되면(앱을 켰을 때 이미 로그인돼 있던 경우 포함) 계정과 한 번 맞춘다 */
function onSessionChange(): void {
  const userId = signedInUserId();
  if (userId === syncedUser) return;
  syncedUser = userId;
  if (userId === null) return;
  void enqueue(async () => {
    const sync = await loadAccountSync();
    // 기다리는 동안 로그아웃했거나 다른 계정으로 바뀌었으면 맞추지 않는다(다시 로그인하면 새로 줄에 선다)
    if (signedInUserId() !== userId) return;
    await sync.syncAtSignIn(deviceStore, userId);
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
