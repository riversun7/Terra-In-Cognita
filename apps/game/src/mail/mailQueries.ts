// 우편 조회(tRPC mail.list) — 우편 화면 조각에만 들어간다(지연 로딩). 실패는 값으로 돌려준다.
import type { MailListResponse } from "@terra/shared/mail";
import { api } from "../net/api.ts";
import { type QueryResult, SCREEN_QUERY_TIMEOUT_MS, queryFailure } from "../sections/queryStore.ts";

export async function loadMailList(preview: boolean): Promise<QueryResult<MailListResponse>> {
  try {
    const data = await api.mail.list.query(preview ? { preview: true } : undefined, {
      signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
    });
    return { ok: true, data };
  } catch (error) {
    return queryFailure(error);
  }
}
