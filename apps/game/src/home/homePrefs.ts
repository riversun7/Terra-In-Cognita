// 홈의 기기 전용 값 — 계정에 올리지 않는다(레일 접힘처럼 보기 편의, ADR 2026-10-29-app-shell 5절 "기기에만 두는 것").
// - 처리할 일 접기(조합 템플릿): localStorage terra.home { v: 1, inboxCollapsed }. 판(v)이 다르거나 깨졌으면 펼친 것으로 읽는다.
// - 시안 자료 켜기(dev·admin): sessionStorage terra.home.preview = "1". 탭을 닫으면 꺼진다(켠 채로 잊지 않게, 기술 해석).
//   켜도 서버가 역할을 다시 본다(권한 home: preview). 화면의 가림은 편의다.
// 저장소를 못 쓰면(사파리 개인 정보 보호 모드 등) 이번 실행 동안만 기억한다.
import { useSyncExternalStore } from "react";
import { field } from "../net/json.ts";

const PREFS_KEY = "terra.home";
const PREFS_VERSION = 1;
const PREVIEW_KEY = "terra.home.preview";

/** 값 하나를 저장소와 화면에 잇는 작은 저장소 */
interface FlagStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly get: () => boolean;
  readonly set: (value: boolean) => void;
}

function createFlag(read: () => boolean, write: (value: boolean) => void): FlagStore {
  const listeners = new Set<() => void>();
  let value: boolean | null = null;
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => {
      value ??= read();
      return value;
    },
    set: (next) => {
      if (value === next) return;
      value = next;
      write(next);
      for (const listener of listeners) listener();
    },
  };
}

function readCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw === null) return false;
    const data: unknown = JSON.parse(raw);
    return field(data, "v") === PREFS_VERSION && field(data, "inboxCollapsed") === true;
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ v: PREFS_VERSION, inboxCollapsed: value }));
  } catch {
    // 이번 실행 동안만
  }
}

function readPreview(): boolean {
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

function writePreview(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(PREVIEW_KEY, "1");
    else sessionStorage.removeItem(PREVIEW_KEY);
  } catch {
    // 이번 실행 동안만
  }
}

const collapsed = createFlag(readCollapsed, writeCollapsed);
const preview = createFlag(readPreview, writePreview);

/** 조합 템플릿의 처리할 일을 접었는지 */
export function useInboxCollapsed(): boolean {
  return useSyncExternalStore(collapsed.subscribe, collapsed.get);
}

export function setInboxCollapsed(value: boolean): void {
  collapsed.set(value);
}

/** 시안 자료를 켰는지(이 탭에서). dev·admin이 아니면 홈은 이 값을 보지 않는다 */
export function usePreviewOn(): boolean {
  return useSyncExternalStore(preview.subscribe, preview.get);
}

export function setPreviewOn(value: boolean): void {
  preview.set(value);
}
