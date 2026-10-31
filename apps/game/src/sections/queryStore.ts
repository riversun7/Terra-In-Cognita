// 화면 하나의 조회 저장소 — 세력·우편처럼 조회 하나로 그리는 화면이 쓴다(화면을 열 때마다 하나 만든다).
// 홈 자료 저장소(home/homeData.ts)와 같은 원칙이다(ADR 2026-10-29-app-shell 6절 "자료 받기"):
// - 화면 밖 상태를 useSyncExternalStore로 읽는다(효과 안에서 setState하지 않는다).
// - 시안 자료 스위치(inbox/preview.ts, 홈과 같은 하나)가 바뀌면 다시 받는다. 다시 받는 동안 앞 값을 그대로 보인다(깜빡이지 않게).
// - 늦게 온 응답이 새 요청의 답을 덮지 않게 차례 번호를 둔다.
// - 다시 받는 때: 시안 스위치가 바뀔 때, [다시 시도], 화면이 다시 보일 때 60초가 지났으면. 주기 타이머는 두지 않는다.
// - 실패는 값(문구 키)으로 받는다. 로그인이 끝났다는 답이면 세션을 다시 확인한다.
// 이 파일은 순수 저장소(시험 대상)다. 화면 훅은 useScreenQuery.ts.
import { apiErrorInfo } from "../net/apiErrors.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";

/** 조회 결과. 실패도 값으로 받는다(net/homeQueries.ts HomeQueryResult와 같은 모양) */
export type QueryResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: PlainMessageKey; readonly sessionEnded: boolean };

/** 조회가 던진 오류 → 실패 값 */
export function queryFailure(error: unknown): QueryResult<never> {
  const info = apiErrorInfo(error);
  return { ok: false, error: info.key, sessionEnded: info.sessionEnded };
}

/** 조회 요청을 끊는 시간 */
export const SCREEN_QUERY_TIMEOUT_MS = 10_000;
/** 다시 보일 때 다시 받는 기준(홈과 같다) */
export const SCREEN_REFETCH_AFTER_HIDDEN_MS = 60_000;

export type QueryState<T> =
  | { readonly status: "idle"; readonly data: null; readonly error: null }
  | { readonly status: "loading"; readonly data: T | null; readonly error: null }
  | { readonly status: "ready"; readonly data: T; readonly error: null }
  | { readonly status: "failed"; readonly data: T | null; readonly error: PlainMessageKey };

export interface QueryStore<T> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => QueryState<T>;
  /** 시안 여부에 맞춰 받는다(받은 적 없거나 시안 여부가 바뀌었을 때만) */
  readonly ensure: (preview: boolean) => void;
  /** 지금 시안 여부로 다시 받는다 */
  readonly refresh: () => void;
  /** 마지막으로 받기를 시작한 시각(기기 ms). 받은 적 없으면 null */
  readonly lastFetchAt: () => number | null;
}

const THREW: QueryResult<never> = { ok: false, error: "err_unknown", sessionEnded: false };

export function createQueryStore<T>(
  load: (preview: boolean) => Promise<QueryResult<T>>,
  options: { readonly now?: () => number; readonly onSessionEnded?: () => void } = {},
): QueryStore<T> {
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  let state: QueryState<T> = { status: "idle", data: null, error: null };
  let key: boolean | null = null;
  let seq = 0;
  let fetchedAt: number | null = null;

  const emit = (next: QueryState<T>): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  const start = (preview: boolean): void => {
    seq += 1;
    const mine = seq;
    key = preview;
    fetchedAt = now();
    emit({ status: "loading", data: state.data, error: null });
    const finish = (result: QueryResult<T>): void => {
      if (mine !== seq) return;
      if (result.ok) {
        emit({ status: "ready", data: result.data, error: null });
        return;
      }
      emit({ status: "failed", data: state.data, error: result.error });
      if (result.sessionEnded) options.onSessionEnded?.();
    };
    load(preview).then(finish, () => finish(THREW));
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    ensure: (preview) => {
      if (key !== preview) start(preview);
    },
    refresh: () => {
      if (key !== null) start(key);
    },
    lastFetchAt: () => fetchedAt,
  };
}
