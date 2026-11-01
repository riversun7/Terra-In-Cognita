// 아이템 편집기 서버 자료 — 목록(items.list: 요약·분류 자료·고르기 창 자료·판)과 고른 아이템 하나(items.get: 항목 통째·팩 항목·쓰는 곳·
// 권고). 주소의 ?item=<ID>는 목록을 받은 뒤 그 아이템을 바로 받는다. 받은 아이템은 ID를 달아 두어 늦게 온 응답이 다른 아이템을 덮지 않는다.
import {
  ITEM_EDITOR_REASONS,
  type ItemEditorGetResponse,
  type ItemEditorListResponse,
} from "@terra/shared/itemEditor";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { contentErrorOf } from "../content/contentEditorModel.ts";
import { errorText } from "./itemMessages.ts";

export type ItemLoad =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: ItemEditorListResponse }
  | { readonly status: "failed"; readonly message: string };

export interface ItemEditorData {
  readonly load: ItemLoad;
  readonly list: ItemEditorListResponse | null;
  /** 그 아이템을 받았으면 그 응답(다른 아이템 것이면 null) */
  readonly detailOf: (id: string | null) => ItemEditorGetResponse | null;
  readonly reload: () => Promise<ItemEditorListResponse | null>;
  readonly setList: (list: ItemEditorListResponse) => void;
  readonly setDetail: (id: string, data: ItemEditorGetResponse) => void;
  readonly loadDetail: (id: string, onError: (error: unknown) => void) => void;
}

export function useItemEditorData(initialId: string | null): ItemEditorData {
  const [load, setLoad] = useState<ItemLoad>({ status: "loading" });
  const [detail, setDetail] = useState<{ readonly id: string; readonly data: ItemEditorGetResponse } | null>(
    null,
  );
  const initial = useRef(initialId);

  const reload = useCallback(
    (): Promise<ItemEditorListResponse | null> =>
      api.items.list.query().then(
        (list) => {
          setLoad({ status: "ready", list });
          return list;
        },
        (error: unknown) => {
          const info = contentErrorOf(error, ITEM_EDITOR_REASONS);
          if (info.sessionEnded) void refreshSession();
          setLoad({ status: "failed", message: errorText(info.key) });
          return null;
        },
      ),
    [],
  );

  useEffect(() => {
    void reload().then((list) => {
      const id = initial.current;
      initial.current = null;
      if (list && id && list.items.some((row) => row.id === id)) {
        api.items.get.query({ id }).then(
          (data) => setDetail({ id, data }),
          () => undefined,
        );
      }
    });
  }, [reload]);

  return {
    load,
    list: load.status === "ready" ? load.list : null,
    detailOf: (id) => (detail && detail.id === id ? detail.data : null),
    reload,
    setList: (list) => setLoad({ status: "ready", list }),
    setDetail: (id, data) => setDetail({ id, data }),
    loadDetail: (id, onError) => {
      api.items.get.query({ id }).then((data) => setDetail({ id, data }), onError);
    },
  };
}
