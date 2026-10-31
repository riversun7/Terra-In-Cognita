// 편집기 한 번 열기(행성 하나)의 바깥 것들 — 꺼짐 감지·서버 초안 동기화·미리보기 관리자를 만들고 닫을 때 버린다.
// ADR 38 3·4·9절. React와 상관없는 부품(crashSentinel·draftSync·previewController)을 화면 수명에 잇기만 한다.
// - 꺼짐 감지를 먼저 연다(다른 탭이 살아 있는지 묻느라 비동기): 낮춘 기기 상한으로 미리보기 관리자를 만든다.
// - 초안 동기화는 바로 읽기 시작한다. 닫을 때 기다리는 자동 저장은 보내고(flush) 버린다: 저장 안 된 변경을 잃지 않게.
// - 상태 읽기는 useStore(useSyncExternalStore)로 한다.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../../net/api.ts";
import { type CrashSentinel, createCrashSentinel, watchPageLifecycle } from "./crashSentinel.ts";
import { type DraftApi, createDraftClient } from "./draftClient.ts";
import { type DraftSync, createDraftSync } from "./draftSync.ts";
import type { DraftDocument } from "./editorModel.ts";
import { createPreviewController } from "./previewController.ts";
import type { PreviewController } from "./previewTypes.ts";

export interface EditorSession {
  readonly sentinel: CrashSentinel;
  readonly sync: DraftSync;
  readonly preview: PreviewController;
  /** 지난번에 탭이 꺼진 미리보기 레벨(없으면 null) — 열 때 한 번 알린다 */
  readonly tripped: number | null;
}

/** tRPC 초안 호출(planetEditor.drafts.*) */
const trpcDraftApi: DraftApi = {
  get: (input) => api.planetEditor.drafts.get.query(input),
  revisions: (input) => api.planetEditor.drafts.revisions.query(input),
  save: (input) => api.planetEditor.drafts.save.mutate(input),
  restore: (input) => api.planetEditor.drafts.restore.mutate(input),
  remove: (input) => api.planetEditor.drafts.remove.mutate(input),
};

/** 행성 하나의 편집 세션. 준비될 때까지 null. planetId·fallback이 바뀌면 새로 만든다 */
export function useEditorSession(planetId: string, fallback: DraftDocument): EditorSession | null {
  const [session, setSession] = useState<EditorSession | null>(null);
  useEffect(() => {
    let disposed = false;
    let preview: PreviewController | null = null;
    const sentinel = createCrashSentinel();
    const sync = createDraftSync({ planetId, client: createDraftClient(trpcDraftApi), fallback });
    sync.start();
    const detach = watchPageLifecycle(window, sentinel);
    const ready = (maxLevel: number | null, tripped: number | null): void => {
      if (disposed) return;
      preview = createPreviewController({ deviceMaxLevel: maxLevel, sentinel });
      setSession({ sentinel, sync, preview, tripped });
    };
    sentinel.open().then(
      ({ maxLevel, tripped }) => ready(maxLevel, tripped),
      () => ready(null, null),
    );
    return () => {
      disposed = true;
      detach();
      preview?.dispose();
      void sync.flush().finally(() => sync.dispose());
    };
  }, [planetId, fallback]);
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
