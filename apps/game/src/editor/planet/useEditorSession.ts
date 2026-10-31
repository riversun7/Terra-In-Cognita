// 편집기 한 번 열기(행성 하나)의 바깥 것들 — 꺼짐 감지·미리보기 관리자를 만들고 닫을 때 버린다. ADR 38 3·4절.
// React와 상관없는 부품(crashSentinel·previewController)을 화면 수명에 잇기만 한다. 저장은 보관함(useLibraryDocument.ts)이 한다.
// - 꺼짐 감지를 먼저 연다(다른 탭이 살아 있는지 묻느라 비동기): 낮춘 기기 상한으로 미리보기 관리자를 만든다.
// - 상태 읽기는 useStore(useSyncExternalStore)로 한다.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { type CrashSentinel, createCrashSentinel, watchPageLifecycle } from "./crashSentinel.ts";
import { createPreviewController } from "./previewController.ts";
import type { PreviewController } from "./previewTypes.ts";

export interface EditorSession {
  readonly sentinel: CrashSentinel;
  readonly preview: PreviewController;
  /** 지난번에 탭이 꺼진 미리보기 레벨(없으면 null) — 열 때 한 번 알린다 */
  readonly tripped: number | null;
}

/** 행성 하나의 미리보기 세션. 준비될 때까지 null. 행성을 바꾸면 부모가 화면을 새로 만든다(key) */
export function useEditorSession(): EditorSession | null {
  const [session, setSession] = useState<EditorSession | null>(null);
  useEffect(() => {
    let disposed = false;
    let preview: PreviewController | null = null;
    const sentinel = createCrashSentinel();
    const detach = watchPageLifecycle(window, sentinel);
    const ready = (maxLevel: number | null, tripped: number | null): void => {
      if (disposed) return;
      preview = createPreviewController({ deviceMaxLevel: maxLevel, sentinel });
      setSession({ sentinel, preview, tripped });
    };
    sentinel.open().then(
      ({ maxLevel, tripped }) => ready(maxLevel, tripped),
      () => ready(null, null),
    );
    return () => {
      disposed = true;
      detach();
      preview?.dispose();
    };
  }, []);
  return session;
}

interface Store<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

const noop = (): void => undefined;

/** 바깥 상태 읽기(가게가 아직 없으면 null) */
export function useStore<T>(store: Store<T> | null): T | null {
  const subscribe = useCallback(
    (listener: () => void) => (store ? store.subscribe(listener) : noop),
    [store],
  );
  const read = useCallback(() => (store ? store.getSnapshot() : null), [store]);
  return useSyncExternalStore(subscribe, read, read);
}
