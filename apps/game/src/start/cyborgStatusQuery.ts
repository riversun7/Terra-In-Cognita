// 사이보그 상태 조회(cyborg.status) — 첫 화면의 길잡이(cyborgGate.ts)가 동적 import()로 부른다(tRPC 클라이언트를 첫 화면 묶음에
// 넣지 않는다). 홈 자료 조회(net/homeQueries.ts)와 조각을 나눴다: 그 조각이 늦거나 멈춰도 길잡이는 따로 답을 받아 화면을 연다
// (처리할 일·복귀 요약이 자기 시간 초과로 실패를 보인다). docs/adr/2026-11-01-first-login-cyborg.md 1절.
import type { CyborgStatusResponse } from "@terra/shared/cyborg";
import { api } from "../net/api.ts";
import { apiErrorInfo } from "../net/apiErrors.ts";

export type CyborgStatusResult =
  | { readonly ok: true; readonly data: CyborgStatusResponse }
  | { readonly ok: false; readonly sessionEnded: boolean };

export async function loadCyborgStatus(signal: AbortSignal): Promise<CyborgStatusResult> {
  try {
    const data = await api.cyborg.status.query(undefined, { signal });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, sessionEnded: apiErrorInfo(error).sessionEnded };
  }
}
