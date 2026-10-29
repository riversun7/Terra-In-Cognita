// 복귀 요약을 물을 때 — 로그인한 계정이 정해질 때(앱을 켤 때·로그인)와 30분 넘게 숨겼다가 다시 볼 때(ADR 2026-10-29-app-shell 8절, D-6014).
// 30분은 PWA의 "켤 때" 기준과 같다(pwa/updatePolicy.ts의 숨김·보임 규칙을 그대로 쓴다).
// 보일지(show)는 서버가 정한다. show면 그 계정의 요약을 두고 ReturnSummary.tsx가 대화상자를 띄운다. 닫으면 지운다.
// 확인 기록(summary.ack)은 아직 없다(첫 사건 출처와 함께 만든다). 그래서 닫은 요약은 다음에 켤 때 다시 뜰 수 있다.
// 첫 화면 묶음에 들어간다. 요청은 net/homeQueries.ts를 동적 import()로 불러서 한다(처리할 일 저장소와 같은 조각이라 같은 틱의
// 조회가 HTTP 요청 하나로 묶인다). 묻기는 10초를 넘기면 그만둔다(조각 받기가 멈춰도 다음 물을 때 다시 묻게).
import type { SummaryGetResponse } from "@terra/shared/inbox";
import { useSyncExternalStore } from "react";
import { getSessionState, refreshSession, subscribe as subscribeSession } from "../auth/session.ts";
import { isPreviewOn } from "../inbox/preview.ts";
import type { HomeQueryResult } from "../net/homeQueries.ts";
import { INITIAL_VISIBILITY, type VisibilityTracker, onHidden, onVisible } from "../pwa/updatePolicy.ts";

export type SummaryLoadResult = HomeQueryResult<SummaryGetResponse>;

/** 묻기(요청 조각 받기 + 요청)를 기다리는 시간. 넘으면 이번에는 띄우지 않는다 */
export const SUMMARY_ASK_TIMEOUT_MS = 10_000;

const TIMED_OUT: SummaryLoadResult = { ok: false, error: "err_network", sessionEnded: false };
const LOAD_THREW: SummaryLoadResult = { ok: false, error: "err_unknown", sessionEnded: false };

/** load를 ms까지만 기다린다. load가 끝나지 않거나(조각 받기가 멈춤) 던져도 실패 값으로 끝난다 */
function settleWithin(load: Promise<SummaryLoadResult>, ms: number): Promise<SummaryLoadResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SummaryLoadResult>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([load.catch((): SummaryLoadResult => LOAD_THREW), timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** 띄울 요약과 그 계정 */
export interface PendingSummary {
  readonly userId: string;
  readonly summary: SummaryGetResponse;
}

export interface SummaryGateDeps {
  load(preview: boolean): Promise<SummaryLoadResult>;
  /** 지금 로그인한 계정과 시안 자료 여부. 로그인하지 않았으면 null */
  viewer(): { readonly userId: string; readonly preview: boolean } | null;
  now(): number;
  /** 서버가 로그인이 끝났다고 했다 */
  onSessionEnded(): void;
}

export interface SummaryGate {
  getPending(): PendingSummary | null;
  subscribe(listener: () => void): () => void;
  /** 로그인 상태가 바뀌었을 수 있다: 새 계정이면 묻는다, 로그아웃이면 지운다 */
  sessionChanged(): void;
  hidden(): void;
  visible(): void;
  /** [확인]·Esc·숫자 눌러 이동 */
  dismiss(): void;
}

export function createSummaryGate(deps: SummaryGateDeps): SummaryGate {
  let pending: PendingSummary | null = null;
  /** 이 실행에서 마지막으로 물은 계정(같은 계정이면 로그인 상태를 다시 확인해도 다시 묻지 않는다) */
  let askedFor: string | null = null;
  /** 묻는 중인 계정 */
  let asking: string | null = null;
  let visibility: VisibilityTracker = INITIAL_VISIBILITY;
  const listeners = new Set<() => void>();

  const setPending = (next: PendingSummary | null): void => {
    if (next === pending) return;
    pending = next;
    for (const listener of listeners) listener();
  };

  async function ask(): Promise<void> {
    const viewer = deps.viewer();
    if (viewer === null || asking === viewer.userId) return;
    asking = viewer.userId;
    const result = await settleWithin(deps.load(viewer.preview), SUMMARY_ASK_TIMEOUT_MS);
    if (asking === viewer.userId) asking = null;
    // 그사이 다른 계정으로 바뀌었거나 로그아웃했다
    if (deps.viewer()?.userId !== viewer.userId) return;
    if (result.ok) {
      if (result.data.show) setPending({ userId: viewer.userId, summary: result.data });
    } else if (result.sessionEnded) {
      deps.onSessionEnded();
    }
  }

  return {
    getPending: () => pending,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sessionChanged() {
      const userId = deps.viewer()?.userId ?? null;
      if (userId === askedFor) return;
      askedFor = userId;
      if (pending !== null && pending.userId !== userId) setPending(null);
      if (userId !== null) void ask();
    },
    hidden() {
      visibility = onHidden(visibility, deps.now());
    },
    visible() {
      const outcome = onVisible(visibility, deps.now());
      visibility = outcome.next;
      if (outcome.resumed) void ask();
    },
    dismiss() {
      setPending(null);
    },
  };
}

// ── 앱에 하나 ────────────────────────────────────────────────

const gate = createSummaryGate({
  async load(preview) {
    try {
      const queries = await import("../net/homeQueries.ts");
      return await queries.loadSummary(preview);
    } catch {
      // 조각을 받지 못함(오프라인 등): 이번에는 띄우지 않는다
      return { ok: false, error: "err_network", sessionEnded: false };
    }
  },
  viewer() {
    const session = getSessionState();
    return session.kind === "signed_in" ? { userId: session.user.id, preview: isPreviewOn() } : null;
  },
  now: () => Date.now(),
  onSessionEnded: () => void refreshSession(),
});

let started = false;

/** 처음 그릴 때 한 번(ReturnSummary가 부른다): 로그인 상태·화면 숨김을 듣는다 */
function startGate(): void {
  if (started) return;
  started = true;
  subscribeSession(() => gate.sessionChanged());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") gate.hidden();
    else gate.visible();
  });
  gate.sessionChanged();
}

function subscribeGate(listener: () => void): () => void {
  startGate();
  return gate.subscribe(listener);
}

/** 띄울 복귀 요약. 없으면 null */
export function useReturnSummary(): PendingSummary | null {
  return useSyncExternalStore(subscribeGate, () => gate.getPending());
}

/** 복귀 요약을 닫는다(대화상자가 닫혔다) */
export function dismissReturnSummary(): void {
  gate.dismiss();
}
