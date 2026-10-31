// 홈 자료 훅 — 처리할 일은 위 띠 종 배지와 같은 저장소(inboxParts.ts의 useInbox, W3 inbox/store.ts)에서, 서버 카드·복귀 요약은
// 홈을 열 때 하나 만드는 저장소(homeData.ts)에서 읽는다. 고르기가 바뀌면 바뀐 부분만 다시 받는다.
// 다시 받는 때(ADR 2026-10-29-app-shell 6절): 서버 연결이 다시 맺어졌을 때, 화면이 다시 보일 때(60초 넘음), [다시 시도].
// 처리할 일 저장소는 그 때를 스스로 듣는다(이 훅은 홈을 열 때 ensureInbox()만 부른다 — 두 번 받지 않게). 주기 타이머는 두지 않는다.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { refreshSession } from "../auth/session.ts";
import { serverLink } from "../net/serverLink.ts";
import { type HomeData, type HomeSource, attachRefetch, createHomeDataStore, inboxPart } from "./homeData.ts";
import type { HomeNeeds } from "./homeView.ts";
import { ensureInbox, loadCards, loadSummary, refreshInbox, useInbox } from "./inboxParts.ts";

/** 홈 자료 출처 — inboxParts.ts의 조회(W3 뒤: net/homeQueries.ts, 같은 조각이라 처리할 일과 같은 틱이면 묶음 1번) */
const homeSource: HomeSource = {
  dashboardCards: loadCards,
  summary: loadSummary,
};

function onVisible(listener: () => void): () => void {
  const handle = (): void => {
    if (document.visibilityState === "visible") listener();
  };
  document.addEventListener("visibilitychange", handle);
  return () => document.removeEventListener("visibilitychange", handle);
}

function endSession(): void {
  void refreshSession();
}

export interface HomeDataHandle {
  readonly data: HomeData;
  /** 지금 고르기로 모두 다시 받는다([다시 시도]) */
  readonly refresh: () => void;
}

export function useHomeData(needs: HomeNeeds): HomeDataHandle {
  const [store] = useState(() => createHomeDataStore(homeSource, { onSessionEnded: endSession }));
  const queries = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const inbox = useInbox();

  // 홈을 열 때: 처리할 일이 없거나 60초가 지났으면 받는다(받는 중이면 그것을 기다린다)
  useEffect(() => {
    void ensureInbox();
  }, []);

  // 고르기가 바뀌면 바뀐 부분만 받는다(같은 고르기면 저장소가 부르지 않는다)
  useEffect(() => {
    store.ensure(needs);
  }, [store, needs]);

  useEffect(
    () =>
      attachRefetch(store, { listen: (listener) => serverLink.listen(listener), onVisible, now: Date.now }),
    [store],
  );

  const inboxView = useMemo(() => inboxPart(inbox), [inbox]);
  const data = useMemo(() => ({ ...queries, inbox: inboxView }), [queries, inboxView]);
  const refresh = useCallback(() => {
    store.refresh();
    void refreshInbox();
  }, [store]);
  return { data, refresh };
}
