// 서버 연결 상태 — 화면(React) 밖에 하나만 둔다(ADR 2026-10-29-app-shell 3절). 전에는 App.tsx의 useState에만 있었다.
// 틀(연결 줄·서버 거절 안내)·홈 카드(연결·성능)·다시 받기가 useConnectionStatus()로 같이 읽는다.
// 연결 자체(접속 인사·시계 차이·다시 연결)는 connection.ts가 한다. 시작은 main.tsx가 한 번 부른다(startConnectionStatus).
import { useSyncExternalStore } from "react";
import { type ConnectOptions, type ConnectionStatus, connect } from "./connection.ts";

/** 이만큼 넘게 연결되지 않으면 연결 줄을 띄운다(ADR 37 3절 "2초 넘게 끊기면") */
export const LOST_NOTICE_DELAY_MS = 2_000;

export interface ConnectionSnapshot {
  readonly status: ConnectionStatus;
  /** 2초 넘게 이어서 연결되지 않았다(처음 연결 중·끊겨 다시 연결 중). 서버 거절은 status로 따로 알린다 */
  readonly lost: boolean;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface ConnectionStoreDeps {
  readonly connect: (onStatus: (status: ConnectionStatus) => void, options?: ConnectOptions) => () => void;
  readonly setTimer: (run: () => void, ms: number) => TimerHandle;
  readonly clearTimer: (handle: TimerHandle) => void;
}

export interface ConnectionStartOptions {
  /** 상태가 바뀔 때마다(저장소를 고친 뒤) */
  readonly onStatus?: (status: ConnectionStatus) => void;
  /** 서버의 welcome을 받을 때마다(다시 연결 포함) */
  readonly onWelcome?: () => void;
}

export interface ConnectionStore {
  readonly start: (options?: ConnectionStartOptions) => void;
  readonly stop: () => void;
  readonly getSnapshot: () => ConnectionSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

/** 연결을 기다리는 상태(처음 연결 중·끊겨 다시 연결 중) */
const isWaiting = (status: ConnectionStatus): boolean =>
  status.kind === "connecting" || status.kind === "disconnected";

export function createConnectionStore(deps: ConnectionStoreDeps): ConnectionStore {
  let snapshot: ConnectionSnapshot = { status: { kind: "connecting" }, lost: false };
  let timer: TimerHandle | null = null;
  let stopConnection: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (next: ConnectionSnapshot): void => {
    if (next.status === snapshot.status && next.lost === snapshot.lost) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const clear = (): void => {
    if (timer === null) return;
    deps.clearTimer(timer);
    timer = null;
  };

  /** 기다리는 상태가 처음 시작될 때부터 센다(끊김 → 다시 연결 중 → 끊김이 이어지면 처음 끊긴 때부터) */
  const armLostTimer = (): void => {
    if (timer !== null || snapshot.lost) return;
    timer = deps.setTimer(() => {
      timer = null;
      if (isWaiting(snapshot.status)) set({ status: snapshot.status, lost: true });
    }, LOST_NOTICE_DELAY_MS);
  };

  const onStatus = (status: ConnectionStatus): void => {
    if (isWaiting(status)) {
      set({ status, lost: snapshot.lost && isWaiting(snapshot.status) });
      armLostTimer();
      return;
    }
    clear();
    set({ status, lost: false });
  };

  return {
    start: (options = {}) => {
      if (stopConnection !== null) return;
      // 처음 연결 중도 센다(서버가 꺼져 있으면 2초 뒤 연결 줄)
      armLostTimer();
      const onWelcome = options.onWelcome;
      stopConnection = deps.connect(
        (status) => {
          onStatus(status);
          options.onStatus?.(status);
        },
        onWelcome === undefined ? {} : { onWelcome },
      );
    },
    stop: () => {
      stopConnection?.();
      stopConnection = null;
      clear();
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const store = createConnectionStore({
  connect,
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (handle) => clearTimeout(handle),
});

/** 앱 시작 때 한 번 부른다(main.tsx). 연결은 로그인과 상관없이 늘 켠다(옛 버전이면 로그인 전에도 새 버전으로 바꾼다) */
export function startConnectionStatus(options?: ConnectionStartOptions): void {
  store.start(options);
}

export function getConnectionSnapshot(): ConnectionSnapshot {
  return store.getSnapshot();
}

export function useConnectionStatus(): ConnectionSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
