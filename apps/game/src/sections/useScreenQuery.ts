// 화면 조회 훅 — 저장소(queryStore.ts)를 화면에 하나 두고, 시안 자료 스위치·다시 보일 때를 건다.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { refreshSession } from "../auth/session.ts";
import { usePreviewOn } from "../inbox/preview.ts";
import {
  type QueryResult,
  type QueryState,
  SCREEN_REFETCH_AFTER_HIDDEN_MS,
  createQueryStore,
} from "./queryStore.ts";

function endSession(): void {
  void refreshSession();
}

/** 화면의 조회. load는 모듈 바깥 함수(바뀌지 않는 값)를 넘긴다 */
export function useScreenQuery<T>(load: (preview: boolean) => Promise<QueryResult<T>>): {
  readonly state: QueryState<T>;
  readonly preview: boolean;
  readonly refresh: () => void;
} {
  const [store] = useState(() => createQueryStore(load, { onSessionEnded: endSession }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const preview = usePreviewOn();

  useEffect(() => {
    store.ensure(preview);
  }, [store, preview]);

  useEffect(() => {
    const handle = (): void => {
      if (document.visibilityState !== "visible") return;
      const last = store.lastFetchAt();
      if (last === null || Date.now() - last > SCREEN_REFETCH_AFTER_HIDDEN_MS) store.refresh();
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, [store]);

  const refresh = useCallback(() => store.refresh(), [store]);
  return { state, preview, refresh };
}
