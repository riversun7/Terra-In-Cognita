// 홈의 기기 전용 값 — 계정에 올리지 않는다(레일 접힘처럼 보기 편의, ADR 2026-10-29-app-shell 5절 "기기에만 두는 것").
// - 처리할 일 접기(조합 템플릿): localStorage terra.home { v: 1, inboxCollapsed }. 판(v)이 다르거나 깨졌으면 펼친 것으로 읽는다.
// 시안 자료 켜기는 여기에 두지 않는다: 위 띠 종 배지·처리함·복귀 요약과 같은 스위치 하나다(inboxParts.ts의 usePreviewOn, W3 inbox/preview.ts).
// 저장소를 못 쓰면(사파리 개인 정보 보호 모드 등) 이번 실행 동안만 기억한다.
import { useSyncExternalStore } from "react";
import { field } from "../net/json.ts";

const PREFS_KEY = "terra.home";
const PREFS_VERSION = 1;

const listeners = new Set<() => void>();
/** 읽은 값. null = 아직 읽지 않음 */
let collapsed: boolean | null = null;

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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCollapsed(): boolean {
  collapsed ??= readCollapsed();
  return collapsed;
}

/** 화면을 서버에서 그릴 때(시험)는 저장소를 읽지 않는다 */
function getServerCollapsed(): boolean {
  return false;
}

/** 조합 템플릿의 처리할 일을 접었는지 */
export function useInboxCollapsed(): boolean {
  return useSyncExternalStore(subscribe, getCollapsed, getServerCollapsed);
}

export function setInboxCollapsed(value: boolean): void {
  if (getCollapsed() === value) return;
  collapsed = value;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ v: PREFS_VERSION, inboxCollapsed: value }));
  } catch {
    // 이번 실행 동안만
  }
  for (const listener of listeners) listener();
}
