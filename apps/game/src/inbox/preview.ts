// 시안 자료 보기 — dev·admin이 홈 템플릿을 비교할 때 켜는 기기 표시(ADR 2026-10-29-app-shell 6절 "시안 자료", 사용자 결정 2).
// 켜면 처리할 일(inbox.list)·복귀 요약(summary.get)·홈 카드(dashboard.cards)를 preview: true로 묻는다.
// - 켜는 곳은 홈 [편집] 시트다(W4가 setPreviewOn을 부른다). 플레이어에게는 그 칸이 없다.
// - 기기에만 둔다(localStorage, 새로고침 뒤에도 남는다: 켤 때 뜨는 복귀 요약을 시안 자료로 보려면 필요하다).
//   켠 계정 id를 함께 적는다. 다른 계정으로 바뀌거나 역할이 dev·admin이 아니면 꺼진 것으로 본다(플레이어가 403을 받지 않게).
// - 화면 편의일 뿐이다. 서버가 요청마다 권한(home: preview)을 다시 본다.
// 첫 화면 묶음에 들어간다(처리할 일 저장소가 읽는다). 작게 둔다.
import type { Role } from "@terra/shared";
import { useSyncExternalStore } from "react";
import { getSessionState, subscribe as subscribeSession } from "../auth/session.ts";
import type { SessionState } from "../auth/sessionState.ts";

const STORAGE_KEY = "terra.preview";
const MARK_VERSION = 1;

/** 시안 자료를 볼 수 있는 역할(서버 권한 home: preview와 같다. 서버가 기준이다) */
const PREVIEW_ROLES: readonly Role[] = ["dev", "admin"];

/** 저장 값 → 켠 계정 id. 없거나 모양이 다르면 null */
export function parsePreviewMark(raw: string | null): string | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const user: unknown = Reflect.get(value, "user");
  return Reflect.get(value, "v") === MARK_VERSION && typeof user === "string" && user !== "" ? user : null;
}

export function serializePreviewMark(userId: string): string {
  return JSON.stringify({ v: MARK_VERSION, user: userId });
}

/** 켠 계정이 지금 로그인해 있고 dev·admin 역할인지 */
export function previewActive(markUser: string | null, session: SessionState): boolean {
  if (markUser === null || session.kind !== "signed_in" || session.user.id !== markUser) return false;
  return session.user.roles.some((role) => PREVIEW_ROLES.includes(role));
}

const listeners = new Set<() => void>();
/** 저장된 표시(읽은 값). undefined = 아직 읽지 않음 */
let cachedMark: string | null | undefined;
let listening = false;

function readMark(): string | null {
  if (cachedMark !== undefined) return cachedMark;
  try {
    cachedMark = parsePreviewMark(localStorage.getItem(STORAGE_KEY));
  } catch {
    // 저장소를 못 쓰면(사파리 개인 정보 보호 모드 등) 꺼진 것으로
    cachedMark = null;
  }
  return cachedMark;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** 다른 탭에서 바꾸면 따른다 */
function listenStorage(): void {
  if (listening) return;
  listening = true;
  try {
    window.addEventListener("storage", (event) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      cachedMark = undefined;
      notify();
    });
  } catch {
    // window가 없는 환경(시험)
  }
}

/** 지금 시안 자료를 묻는지 */
export function isPreviewOn(): boolean {
  return previewActive(readMark(), getSessionState());
}

/** 시안 자료 표시나 로그인 상태가 바뀌면 부른다 */
export function subscribePreview(listener: () => void): () => void {
  listenStorage();
  listeners.add(listener);
  const stopSession = subscribeSession(listener);
  return () => {
    listeners.delete(listener);
    stopSession();
  };
}

export function usePreviewOn(): boolean {
  return useSyncExternalStore(subscribePreview, isPreviewOn);
}

/** 켜기·끄기(홈 [편집]의 dev·admin 칸). 로그인한 dev·admin만 켤 수 있다. 처리할 일·복귀 요약이 다시 묻는다 */
export function setPreviewOn(on: boolean): void {
  const session = getSessionState();
  const userId = session.kind === "signed_in" ? session.user.id : null;
  const next = on && userId !== null && previewActive(userId, session) ? userId : null;
  if (next === readMark()) return;
  cachedMark = next;
  try {
    if (next === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, serializePreviewMark(next));
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 기억한다
  }
  notify();
}
