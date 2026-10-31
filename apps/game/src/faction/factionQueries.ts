// 세력 화면 조회(tRPC faction.overview) — 세력 화면 조각에만 들어간다(지연 로딩). 실패는 값으로 돌려준다.
import type { FactionOverviewResponse } from "@terra/shared/faction";
import { api } from "../net/api.ts";
import { type QueryResult, SCREEN_QUERY_TIMEOUT_MS, queryFailure } from "../sections/queryStore.ts";

export async function loadFactionOverview(preview: boolean): Promise<QueryResult<FactionOverviewResponse>> {
  try {
    const data = await api.faction.overview.query(preview ? { preview: true } : undefined, {
      signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
    });
    return { ok: true, data };
  } catch (error) {
    return queryFailure(error);
  }
}
