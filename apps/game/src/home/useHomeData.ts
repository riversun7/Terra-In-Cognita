// 홈 자료 훅 — 홈을 열 때 저장소(homeData.ts)를 하나 만들고, 고르기가 바뀌면 바뀐 부분만 다시 받는다.
// 다시 받는 때(ADR 2026-10-29-app-shell 6절): 서버 연결이 다시 맺어졌을 때(net/serverLink.ts), 화면이 다시 보일 때(60초 넘음),
// 바로 처리 결과를 받은 뒤(refresh). 주기 타이머는 두지 않는다.
// [임시] 자료 출처는 W3 전 가짜(source/tempSource.ts)다. W3 뒤(꽂는 줄): homeSource를 진짜 출처로 바꾼다(그 파일 머리 주석).
import { useEffect, useState, useSyncExternalStore } from "react";
import { serverLink } from "../net/serverLink.ts";
import { type HomeData, type HomeSource, attachRefetch, createHomeDataStore } from "./homeData.ts";
import type { HomeNeeds } from "./homeView.ts";
import { tempHomeSource } from "./source/tempSource.ts";

/** 홈 자료 출처 — W3 뒤: 처리할 일은 inbox/store.ts, 카드·요약은 api.dashboard.cards·api.summary.get */
const homeSource: HomeSource = tempHomeSource;

function onVisible(listener: () => void): () => void {
  const handle = (): void => {
    if (document.visibilityState === "visible") listener();
  };
  document.addEventListener("visibilitychange", handle);
  return () => document.removeEventListener("visibilitychange", handle);
}

export interface HomeDataHandle {
  readonly data: HomeData;
  /** 지금 고르기로 모두 다시 받는다([다시 시도], 바로 처리 결과 뒤) */
  readonly refresh: () => void;
}

export function useHomeData(needs: HomeNeeds): HomeDataHandle {
  const [store] = useState(() => createHomeDataStore(homeSource));
  const data = useSyncExternalStore(store.subscribe, store.getSnapshot);

  // 고르기가 바뀌면 바뀐 부분만 받는다(같은 고르기면 저장소가 부르지 않는다)
  useEffect(() => {
    store.ensure(needs);
  }, [store, needs]);

  useEffect(
    () =>
      attachRefetch(store, { listen: (listener) => serverLink.listen(listener), onVisible, now: Date.now }),
    [store],
  );

  return { data, refresh: store.refresh };
}
