// 첫 접속 길잡이 — 사이보그가 없는 계정은 /start(사이보그 만들기)로 보낸다. docs/adr/2026-11-01-first-login-cyborg.md 1절,
// 기획 60 7.1·D-140·D-445 177.
// - 로그인하면 cyborg.status를 한 번 묻는다(계정이 바뀌면 다시). 묻는 동안 막는 주소는 그리지 않는다(홈이 잠깐 보였다 바뀌지 않게).
// - 사이보그가 없으면 아래 예외 밖의 주소를 /start로 바꾼다(replace). 만들면 홈으로.
//   속성 분배(D-450)가 없는 사이보그(프로토콜 5 전에 만든 것)도 같은 예외로 /start에 보낸다 → 분배 단계만 보이고 나누면 홈으로.
//   예외: 설정(언어·테마·로그아웃). dev·admin은 더 관리자·개발자 도구·지도(전체 보기는 지도 안의 개발 도구다).
// - 묻기에 실패하면 막지 않는다(화면들은 사이보그가 없어도 빈 상태로 돈다). 서버가 만들기·읽기 권한을 늘 다시 본다.
// 첫 화면 묶음에 들어간다: 요청은 cyborgStatusQuery.ts를 동적 import()로 부른다(tRPC 클라이언트를 이 묶음에 넣지 않는다).
import type { Role, RouteId } from "@terra/shared";
import type { CharacterLook } from "@terra/shared/characterLook";
import { useEffect, useSyncExternalStore } from "react";
import { refreshSession } from "../auth/session.ts";
import type { CyborgStatusResult } from "./cyborgStatusQuery.ts";

export type CyborgGateState =
  | { readonly status: "idle" }
  | { readonly status: "checking"; readonly userId: string }
  | { readonly status: "none"; readonly userId: string }
  | {
      readonly status: "ready";
      readonly userId: string;
      readonly name: string;
      /** 3D 외형(위 띠 얼굴 초상, cyborg.status look). 옛 2D 칸은 뺐다(D-560 1421) */
      readonly look: CharacterLook | null;
      /** 속성 분배가 없다(한 번 나누러 /start로) */
      readonly elementsPending: boolean;
    }
  /** 묻지 못함 — 막지 않는다 */
  | { readonly status: "unknown"; readonly userId: string };

/** 응답이 오지 않으면 끊는 시간 */
const REQUEST_TIMEOUT_MS = 10_000;

const DEV_TOOLS: ReadonlySet<RouteId> = new Set([
  "admin",
  "dev",
  "dev_planet_editor",
  "dev_star_system",
  "dev_second_map",
  "dev_gpu_bench",
  "map",
  "map_planet",
]);

/** 사이보그가 없어도 여는 주소(D-445 177). 없는 주소(null)는 "없는 화면" 안내라 막지 않는다 */
export function opensWithoutCyborg(id: RouteId | null, roles: readonly Role[]): boolean {
  if (id === null || id === "start" || id === "settings") return true;
  return DEV_TOOLS.has(id) && roles.some((role) => role === "dev" || role === "admin");
}

/** 길잡이가 할 일: /start로 보냄, 홈으로 보냄(만든 뒤 /start), 그대로 */
export function gateRedirect(
  state: CyborgGateState,
  id: RouteId | null,
  roles: readonly Role[],
): "start" | "home" | null {
  const needsStart = state.status === "none" || (state.status === "ready" && state.elementsPending);
  if (needsStart && !opensWithoutCyborg(id, roles)) return "start";
  if (state.status === "ready" && !state.elementsPending && id === "start") return "home";
  return null;
}

/** 지금 주소를 그리지 않고 기다리는지(묻는 중이거나 /start로 보내는 중) */
export function gateHolds(state: CyborgGateState, id: RouteId | null, roles: readonly Role[]): boolean {
  if (opensWithoutCyborg(id, roles) && id !== "start") return false;
  if (state.status === "checking" || state.status === "idle") return true;
  return gateRedirect(state, id, roles) !== null;
}

let state: CyborgGateState = { status: "idle" };
let request = 0;
const listeners = new Set<() => void>();

function set(next: CyborgGateState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** 이 계정의 상태를 (없으면) 묻는다. 같은 계정이면 다시 묻지 않는다(refreshCyborgGate가 다시 묻는다) */
export function ensureCyborgGate(userId: string): void {
  if (state.status !== "idle" && state.userId === userId) return;
  void check(userId);
}

/** 다시 묻는다(만들기 화면이 끝난 뒤 등) */
export function refreshCyborgGate(userId: string): Promise<void> {
  return check(userId);
}

/** 조각 받기 + 조회. 조각이 오지 않거나 실패해도 REQUEST_TIMEOUT_MS 안에 끝난다(그러면 막지 않는다) */
async function fetchStatus(): Promise<CyborgStatusResult> {
  const failed: CyborgStatusResult = { ok: false, sessionEnded: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CyborgStatusResult>((resolve) => {
    timer = setTimeout(() => resolve(failed), REQUEST_TIMEOUT_MS);
  });
  const load = import("./cyborgStatusQuery.ts").then(
    (module) => module.loadCyborgStatus(AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
    () => failed,
  );
  try {
    return await Promise.race([load, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function check(userId: string): Promise<void> {
  request += 1;
  const mine = request;
  if (state.status === "idle" || state.userId !== userId) set({ status: "checking", userId });
  const result = await fetchStatus();
  if (mine !== request) return;
  if (!result.ok) {
    if (result.sessionEnded) void refreshSession();
    set({ status: "unknown", userId });
    return;
  }
  const cyborg = result.data.cyborg;
  set(
    cyborg === null
      ? { status: "none", userId }
      : {
          status: "ready",
          userId,
          name: cyborg.name,
          look: cyborg.look,
          elementsPending: cyborg.elementsPending,
        },
  );
}

/** 만들기가 끝났다(서버가 커밋한 뒤 답했다). 다시 묻지 않고 바로 홈으로 갈 수 있게 */
export function markCyborgCreated(userId: string, name: string, look: CharacterLook): void {
  request += 1;
  set({ status: "ready", userId, name, look, elementsPending: false });
}

/** 속성 분배가 끝났다(서버가 커밋한 뒤 답했다). 다시 묻지 않고 바로 홈으로 */
export function markCyborgElementsSet(userId: string): void {
  if (state.status !== "ready" || state.userId !== userId) return;
  request += 1;
  set({ ...state, elementsPending: false });
}

/** 3D 외형을 한 번 골랐다(서버가 커밋한 뒤 답했다, 질문 961 나): 위 띠 얼굴(3D 초상)을 그 외형으로 바로 바꾼다 */
export function markCyborgAppearance(look: CharacterLook): void {
  if (state.status !== "ready") return;
  request += 1;
  set({ ...state, look });
}

export function getCyborgGate(): CyborgGateState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 로그인한 계정의 길잡이 상태(처음 쓰면 묻는다) */
export function useCyborgGate(userId: string): CyborgGateState {
  const current = useSyncExternalStore(subscribe, getCyborgGate);
  useEffect(() => {
    ensureCyborgGate(userId);
  }, [userId]);
  // 계정이 바뀐 직후(효과 전)에는 앞 계정의 상태를 쓰지 않는다
  if (current.status !== "idle" && current.userId !== userId) return { status: "checking", userId };
  return current;
}

/** 시험용: 처음 상태로 */
export function resetCyborgGateForTest(): void {
  request += 1;
  state = { status: "idle" };
}
