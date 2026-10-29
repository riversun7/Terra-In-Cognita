// 처리할 일 요청(tRPC inbox.list) — 저장소(store.ts)가 동적 import()로 부른다. tRPC 클라이언트를 첫 화면 묶음에 넣지 않으려고다
// (settings/accountSync.ts와 같은 방식, ADR 2026-10-29-app-shell 7절). 실패는 값으로 돌려준다(문구 키는 net/apiErrors.ts).
import { api } from "../net/api.ts";
import { apiErrorInfo } from "../net/apiErrors.ts";
import type { InboxLoadResult } from "./store.ts";

export async function loadInbox(preview: boolean, signal: AbortSignal): Promise<InboxLoadResult> {
  try {
    const data = await api.inbox.list.query(preview ? { preview: true } : undefined, { signal });
    return { ok: true, data };
  } catch (error) {
    const info = apiErrorInfo(error);
    return { ok: false, error: info.key, sessionEnded: info.sessionEnded };
  }
}
