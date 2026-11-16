// 처리할 일 저장소 — 위 띠 종 배지·메뉴 배지·처리함 화면·홈이 함께 쓰는 목록 하나(ADR 2026-10-29-app-shell 6·7절).
// 첫 화면 묶음에 들어간다. 그래서 요청은 net/homeQueries.ts를 동적 import()로 불러서 한다(tRPC 클라이언트와 종류 표는 이 묶음에 없다.
// @terra/shared/inbox는 타입만 가져온다, firstScreen.test.ts가 본다). 로그인한 뒤에만 받는다.
// - 겹친 요청은 하나로: 받는 중에 또 부르면 같은 요청을 기다린다. refresh()는 끝난 뒤 한 번 더 받는다.
// - 받는 때: 로그인(계정이 바뀜)·시안 자료를 켜고 끔, 서버 연결이 다시 맺어졌을 때(끊긴 뒤 welcome),
//   화면이 다시 보일 때(마지막으로 받은 지 60초 넘음), 화면이 열 때 ensureInbox(), 바로 처리 결과를 받은 뒤 refreshInbox().
//   주기 타이머는 두지 않는다(ADR 37 6절 "자료 받기").
// - 다시 연결됐을 때는 5초 안에 시작한 받기가 있으면(받는 중이거나 막 받음) 다시 받지 않는다. 로그인 직후가 그렇다:
//   계정이 바뀌어 받기를 시작하고, 곧이어 서버 연결도 새 계정으로 다시 맺는다(net/serverLink.ts followIdentity).
// - 응답이 10초 없으면 끊고 실패로 둔다. 요청 조각 받기가 멈춰 load가 신호를 듣지 못해도 저장소가 끝낸다([다시 시도]가 보인다).
// - 저장소는 처음 쓸 때 켜진다(종 배지 등이 useInbox…를 부를 때). 켜진 뒤에는 앱이 끝날 때까지 듣는다.
import type { InboxListResponse } from "@terra/shared/inbox";
import { useSyncExternalStore } from "react";
import { getSessionState, refreshSession } from "../auth/session.ts";
import type { HomeQueryResult } from "../net/homeQueries.ts";
import { serverLink } from "../net/serverLink.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";
import { withoutFolded } from "./folded.ts";
import { isPreviewOn, subscribePreview } from "./preview.ts";

export type InboxStatus = "idle" | "loading" | "ready" | "failed";

export interface InboxState {
  /** 이 자료의 계정. 로그인하지 않았으면 null */
  readonly userId: string | null;
  /** 시안 자료(preview)로 물은 자료인지 */
  readonly preview: boolean;
  readonly status: InboxStatus;
  /** 마지막으로 받은 목록. 다시 받는 중·실패한 뒤에도 남는다(계정·시안 자료가 바뀌면 비운다) */
  readonly data: InboxListResponse | null;
  /** 마지막 실패의 문구 키. 받으면 null */
  readonly error: PlainMessageKey | null;
  /** 마지막으로 받은 시각(기기 시계 ms) */
  readonly receivedAt: number | null;
}

/** 요청 결과. 실패도 값으로 받는다(문구 키는 net/homeQueries.ts가 apiErrors.ts로 고른다) */
export type InboxLoadResult = HomeQueryResult<InboxListResponse>;

export interface InboxStoreDeps {
  /** inbox.list 요청. signal이 끊기면 실패로 끝나야 하지만, 끝나지 않아도 저장소가 끊긴 때 실패로 둔다 */
  load(preview: boolean, signal: AbortSignal): Promise<InboxLoadResult>;
  /** 지금 로그인한 계정과 시안 자료 여부. 로그인하지 않았으면 null */
  viewer(): { readonly userId: string; readonly preview: boolean } | null;
  now(): number;
  /** 서버가 로그인이 끝났다고 했다 */
  onSessionEnded(): void;
}

export interface InboxStore {
  getState(): InboxState;
  subscribe(listener: () => void): () => void;
  /** 계정·시안 자료가 바뀌었는지 보고, 바뀌었으면 비우고 다시 받는다 */
  sync(): void;
  /** 받은 지 maxAgeMs가 지났거나 없으면 받는다. 받는 중이면 그것을 기다린다 */
  ensure(maxAgeMs?: number): Promise<void>;
  /** 지금 상태를 다시 받는다. 받는 중이면 끝난 뒤 한 번 더 */
  refresh(): Promise<void>;
  /** 서버 연결이 끊겼다 / 인사가 끝났다(serverLink) */
  connectionDown(): void;
  connectionReady(): void;
}

/** 화면이 다시 보일 때 다시 받는 기준(마지막으로 받은 뒤) */
export const INBOX_STALE_MS = 60_000;
/** 응답이 오지 않으면 끊는 시간(요청 조각 받기 포함) */
export const INBOX_REQUEST_TIMEOUT_MS = 10_000;
/** 다시 연결됐을 때 이만큼 안에 시작한 받기가 있으면 그 답을 쓴다(로그인 직후 계정이 바뀌어 다시 맺은 연결) */
export const INBOX_RECONNECT_FRESH_MS = 5_000;

const IDLE: InboxState = {
  userId: null,
  preview: false,
  status: "idle",
  data: null,
  error: null,
  receivedAt: null,
};

const TIMED_OUT: InboxLoadResult = { ok: false, error: "err_network", sessionEnded: false };
const LOAD_THREW: InboxLoadResult = { ok: false, error: "err_unknown", sessionEnded: false };

/**
 * 종 배지 = 완료를 뺀 줄 수(묶음은 1줄. 해석: 완료는 "확인할 소식", D-6006). 목록이 없으면 0.
 * 이 기기가 모르는 분류(더 새 서버)의 줄도 센다: 처리함은 그 줄을 "그 밖의 알림"으로 늘 보인다(D-6011, InboxList.tsx)
 */
export function bellCount(data: InboxListResponse | null): number {
  if (data === null) return 0;
  let total = 0;
  for (const [category, count] of Object.entries(data.counts)) {
    if (category !== "done" && Number.isSafeInteger(count) && count > 0) total += count;
  }
  return total;
}

export function createInboxStore(deps: InboxStoreDeps): InboxStore {
  let state: InboxState = IDLE;
  const listeners = new Set<() => void>();
  /** 지금 받는 요청. 계정·시안 자료가 바뀌면 끊고 버린다 */
  let inflight: {
    token: object;
    controller: AbortController;
    done: Promise<void>;
    startedAt: number;
  } | null = null;
  /** 지금 목록(state.data)을 받은 요청을 시작한 시각 */
  let dataStartedAt: number | null = null;
  /** 받는 중에 refresh()가 왔다 → 끝난 뒤 한 번 더 */
  let again: Promise<void> | null = null;
  let againResolve: (() => void) | null = null;
  /** 끊긴 뒤 아직 다시 연결되지 않았다 */
  let missedConnection = false;

  const setState = (next: InboxState): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  const sameViewer = (viewer: ReturnType<InboxStoreDeps["viewer"]>): boolean =>
    viewer === null
      ? state.userId === null
      : state.userId === viewer.userId && state.preview === viewer.preview;

  /** 받는 중인 요청을 끊고 버린다(계정·시안 자료가 바뀜) */
  const dropInflight = (): void => {
    inflight?.controller.abort();
    inflight = null;
    const resolve = againResolve;
    again = null;
    againResolve = null;
    resolve?.();
  };

  /** 받기 시작한다. base: 받는 동안의 상태(계정이 바뀌면 빈 상태에서 시작한다) */
  const start = (preview: boolean, base: InboxState = state): Promise<void> => {
    const token = {};
    const controller = new AbortController();
    const startedAt = deps.now();
    const timer = setTimeout(() => controller.abort(), INBOX_REQUEST_TIMEOUT_MS);
    // 끊기면(10초, 계정이 바뀜) load가 신호를 듣지 않아도 바로 끝낸다. 요청 조각 받기(동적 import)는 신호를 받지 못한다
    const aborted = new Promise<InboxLoadResult>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(TIMED_OUT), { once: true });
    });
    setState({ ...base, status: "loading" });
    const done = Promise.race([
      deps.load(preview, controller.signal).catch((): InboxLoadResult => LOAD_THREW),
      aborted,
    ]).then((result) => {
      clearTimeout(timer);
      // 그사이 계정·시안 자료가 바뀌어 버린 요청이다
      if (inflight?.token !== token) return;
      inflight = null;
      if (result.ok) {
        dataStartedAt = startedAt;
        setState({ ...state, status: "ready", data: result.data, error: null, receivedAt: deps.now() });
      } else {
        setState({ ...state, status: "failed", error: result.error });
        if (result.sessionEnded) deps.onSessionEnded();
      }
      const resolveAgain = againResolve;
      if (resolveAgain === null) return;
      again = null;
      againResolve = null;
      void startFresh().then(resolveAgain);
    });
    inflight = { token, controller, done, startedAt };
    return done;
  };

  /** 지금 계정으로 새로 받는다(없으면 아무것도 하지 않는다) */
  const startFresh = (): Promise<void> => {
    sync();
    if (state.userId === null) return Promise.resolve();
    return inflight?.done ?? start(state.preview);
  };

  function sync(): void {
    const viewer = deps.viewer();
    if (sameViewer(viewer)) return;
    dropInflight();
    dataStartedAt = null;
    if (viewer === null) {
      setState(IDLE);
      return;
    }
    // 빈 상태에서 바로 받는 중으로(듣는 쪽에는 한 번만 알린다)
    void start(viewer.preview, { ...IDLE, userId: viewer.userId, preview: viewer.preview });
  }

  function ensure(maxAgeMs = INBOX_STALE_MS): Promise<void> {
    sync();
    if (state.userId === null) return Promise.resolve();
    if (inflight) return inflight.done;
    const fresh =
      state.status === "ready" && state.receivedAt !== null && deps.now() - state.receivedAt <= maxAgeMs;
    return fresh ? Promise.resolve() : start(state.preview);
  }

  function refresh(): Promise<void> {
    sync();
    if (state.userId === null) return Promise.resolve();
    if (!inflight) return start(state.preview);
    again ??= new Promise<void>((resolve) => {
      againResolve = resolve;
    });
    return again;
  }

  /** 막 시작한 받기가 끊긴 동안의 바뀜을 덮는지(받는 중이거나, 지금 목록을 받은 요청) */
  function recentlyStarted(): boolean {
    const startedAt = inflight ? inflight.startedAt : state.status === "ready" ? dataStartedAt : null;
    return startedAt !== null && deps.now() - startedAt <= INBOX_RECONNECT_FRESH_MS;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync,
    ensure,
    refresh,
    connectionDown() {
      missedConnection = true;
    },
    connectionReady() {
      if (!missedConnection) return;
      missedConnection = false;
      if (recentlyStarted()) return;
      void refresh();
    },
  };
}

// ── 앱에 하나 ────────────────────────────────────────────────

const loadQueries = () => import("../net/homeQueries.ts");

const store = createInboxStore({
  async load(preview, signal) {
    try {
      const queries = await loadQueries();
      const result = await queries.loadInbox(preview, signal);
      // 이 기기에서 접은 줄([기다림] — folded.ts)은 뺀다
      return result.ok ? { ...result, data: withoutFolded(result.data) } : result;
    } catch {
      // 조각을 받지 못함(오프라인, 배포 뒤 옛 조각)
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

/** 처음 쓸 때 한 번: 로그인·시안 자료·서버 연결·화면 보임을 듣는다 */
function startInbox(): void {
  if (started) return;
  started = true;
  // 로그인 상태가 바뀔 때도 불린다(subscribePreview가 세션도 듣는다)
  subscribePreview(() => store.sync());
  serverLink.listen((event) => {
    if (event.kind === "down") store.connectionDown();
    else if (event.kind === "ready") store.connectionReady();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void store.ensure(INBOX_STALE_MS);
  });
  store.sync();
}

function subscribeInbox(listener: () => void): () => void {
  startInbox();
  return store.subscribe(listener);
}

function getInboxState(): InboxState {
  return store.getState();
}

/** 처리할 일 상태 전체(처리함 화면·홈) */
export function useInbox(): InboxState {
  return useSyncExternalStore(subscribeInbox, getInboxState);
}

/** 위 띠 종 배지의 수(완료를 뺀 줄 수). 0이면 배지를 그리지 않는다 */
export function useInboxBellCount(): number {
  return useSyncExternalStore(subscribeInbox, () => bellCount(store.getState().data));
}

const NO_BADGES: InboxListResponse["badges"] = {};

/** 메뉴 항목 배지(서버가 보낸 badges: 메뉴 항목 ID → 줄 수). 모르는 항목 ID는 그리는 쪽이 건너뛴다 */
export function useInboxMenuBadges(): InboxListResponse["badges"] {
  return useSyncExternalStore(subscribeInbox, () => store.getState().data?.badges ?? NO_BADGES);
}

/** 화면을 열 때: 없거나 60초가 지났으면 받는다(받는 중이면 그것을 기다린다) */
export function ensureInbox(): Promise<void> {
  startInbox();
  return store.ensure(INBOX_STALE_MS);
}

/** 지금 상태를 다시 받는다([다시 시도], 바로 처리 결과를 받은 뒤) */
export function refreshInbox(): Promise<void> {
  startInbox();
  return store.refresh();
}
