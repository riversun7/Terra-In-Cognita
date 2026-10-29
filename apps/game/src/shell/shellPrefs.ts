// 화면 틀의 사람별 설정 — 메뉴 설정(nav: 배치·메뉴 순서)과 중간 폭 레일 접힘(ADR 2026-10-29-app-shell 4·5절, D-265).
// - 레일 접힘은 이 기기에만 둔다(localStorage terra.shell). 저장소를 못 쓰면 이번 실행 동안만 기억한다.
// - 메뉴 설정: 계정 설정 넓히기(W2)가 합쳐지기 전에는 @terra/shared 기본값에서 시작해 이번 실행 동안만 기억한다.
//   [W2 뒤에 바꿀 곳 — 이 파일 안에서만] 읽기: useSettings().device.nav를 parseNavigation으로,
//   쓰기: chooseNavigation(mergeNavigation(원래 값, 바꾼 칸)). 원래 값(모양을 모르는 JSON)에 바꾼 칸만 덮어 써서
//   더 새 버전이 넣은 칸과 모르는 항목 ID가 남는다.
import {
  type NavigationPatch,
  type NavigationSettings,
  mergeNavigation,
  parseNavigation,
} from "@terra/shared";
import { useSyncExternalStore } from "react";

/** 기기 저장 열쇠(틀 전용). 판이 바뀌면 v를 올린다 */
export const SHELL_STORAGE_KEY = "terra.shell";

interface ShellDevicePrefs {
  /** 중간 폭에서 레일을 펼쳤는지(기본: 접음) */
  readonly railExpanded: boolean;
}

function readDevicePrefs(): ShellDevicePrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SHELL_STORAGE_KEY) ?? "null");
    const expanded = typeof raw === "object" && raw !== null ? Reflect.get(raw, "railExpanded") : undefined;
    return { railExpanded: expanded === true };
  } catch {
    // 저장소를 못 쓰거나(사파리 개인 정보 보호 모드) 모양이 틀림: 기본값
    return { railExpanded: false };
  }
}

interface Snapshot {
  /** 저장된 nav 원래 값(모양을 모르는 JSON). 쓰기는 이 값에 바꾼 칸만 덮어 쓴다 */
  readonly rawNav: unknown;
  readonly nav: NavigationSettings;
  readonly device: ShellDevicePrefs;
}

const listeners = new Set<() => void>();
let snapshot: Snapshot | null = null;

function current(): Snapshot {
  snapshot ??= { rawNav: undefined, nav: parseNavigation(undefined), device: readDevicePrefs() };
  return snapshot;
}

function set(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getNavigation = (): NavigationSettings => current().nav;
const getRailExpanded = (): boolean => current().device.railExpanded;

/** 메뉴 설정(배치·메뉴 순서). 모르는 항목 ID는 그대로 들어 있다 — 그릴 때 navMenuItems·visibleTabs로 거른다 */
export function useNavigation(): NavigationSettings {
  return useSyncExternalStore(subscribe, getNavigation);
}

/** 메뉴 설정을 바꾼다(설정 화면 "메뉴" 칸). 바꿀 때마다 바로 저장한다(되돌리기는 [기본값으로]) */
export function changeNavigation(patch: NavigationPatch): void {
  const now = current();
  const rawNav = mergeNavigation(now.rawNav, patch);
  set({ ...now, rawNav, nav: parseNavigation(rawNav) });
}

export function useRailExpanded(): boolean {
  return useSyncExternalStore(subscribe, getRailExpanded);
}

export function setRailExpanded(railExpanded: boolean): void {
  const now = current();
  if (now.device.railExpanded === railExpanded) return;
  const device = { ...now.device, railExpanded };
  try {
    localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify({ v: 1, ...device }));
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 기억한다
  }
  set({ ...now, device });
}
