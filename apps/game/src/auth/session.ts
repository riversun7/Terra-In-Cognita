// 로그인 상태 — 화면(React) 밖에 하나만 둔다. 화면은 useSession()으로 읽는다.
// - 앱을 켤 때 GET /api/auth/get-session으로 확인한다.
// - 다시 보일 때·다시 온라인이 될 때(30분에 1번까지) 또 확인한다. 서버가 이때 세션을 연장하고 쿠키를 새로 준다.
//   tRPC 응답으로는 쿠키를 새로 줄 수 없어서 연장은 이 요청이 맡는다(작업 기록 28-2100-auth-server).
// - 로그아웃: POST /api/auth/sign-out(JSON {}, 같은 출처).
// 세션 토큰은 HttpOnly 쿠키에만 있다. 이 코드는 토큰을 읽지도 저장하지도 않는다.
import { AUTH_SESSION_PATHS } from "@terra/shared";
import { useSyncExternalStore } from "react";
import {
  type SessionCheck,
  SESSION_RECHECK_MS,
  type SessionState,
  isStaff,
  nextSessionState,
  shouldRecheck,
  toSessionCheck,
} from "./sessionState.ts";

let state: SessionState = { kind: "loading" };
const listeners = new Set<() => void>();
let lastCheckedAt: number | null = null;
let inflight: Promise<SessionState> | undefined;
let started = false;

function setState(next: SessionState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionState(): SessionState {
  return state;
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSessionState);
}

/** 운영진(gm·admin·dev)에게만 보이는 화면인가 — 지도 성능 판 등(sessionState.ts isStaff) */
export function useStaffView(): boolean {
  return isStaff(useSession());
}

async function fetchSession(): Promise<SessionCheck> {
  try {
    const response = await fetch(AUTH_SESSION_PATHS.getSession, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const body: unknown = await response.json().catch(() => undefined);
    return toSessionCheck(response.status, body);
  } catch {
    // 서버에 닿지 못함(오프라인, 서버 재시작 중)
    return { kind: "failed" };
  }
}

/** 지금 세션을 확인한다. 동시에 여러 번 불러도 요청은 하나다 */
export function refreshSession(): Promise<SessionState> {
  inflight ??= fetchSession()
    .then((check) => {
      lastCheckedAt = Date.now();
      setState(nextSessionState(state, check));
      return state;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

/** 로그아웃. 실패하면 false(로그인 상태 그대로) */
export async function signOut(): Promise<boolean> {
  let ok = false;
  try {
    const response = await fetch(AUTH_SESSION_PATHS.signOut, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "{}",
    });
    ok = response.ok;
  } catch {
    return false;
  }
  if (!ok) {
    // 이미 세션이 없으면 서버는 400을 준다. 그때는 로그아웃된 것이다
    const after = await refreshSession();
    return after.kind === "signed_out";
  }
  lastCheckedAt = Date.now();
  setState({ kind: "signed_out", reason: "signed_out" });
  return true;
}

/** 서버와 다시 연결됐을 때(WebSocket welcome) — 처음 확인을 못 한 채면 다시 해 본다(서버가 다시 켜진 뒤 등) */
export function retrySessionIfUnavailable(): void {
  if (state.kind === "unavailable") void refreshSession();
}

/** 오래됐으면 다시 확인한다(화면이 보일 때만) */
function recheckIfStale(): void {
  if (document.visibilityState !== "visible") return;
  if (shouldRecheck(lastCheckedAt, Date.now())) void refreshSession();
}

/** 앱 시작 때 한 번 부른다(main.tsx) */
export function startSession(): void {
  if (started) return;
  started = true;
  void refreshSession();
  document.addEventListener("visibilitychange", recheckIfStale);
  window.addEventListener("online", () => {
    // 처음 확인이 실패한 채라면 바로 다시 해 본다
    if (state.kind === "unavailable") void refreshSession();
    else recheckIfStale();
  });
  // 화면을 켜 둔 채 오래 쓸 때(데스크톱)도 연장되게
  setInterval(recheckIfStale, SESSION_RECHECK_MS);
}
