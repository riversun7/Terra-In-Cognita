// 복귀 요약 요청(tRPC summary.get) — 첫 화면의 복귀 요약 문(summaryGate.ts)과 홈이 동적 import()로 부른다.
// tRPC 클라이언트를 첫 화면 묶음에 넣지 않으려고다(ADR 2026-10-29-app-shell 8·11절). 실패는 값으로 돌려준다(문구 키는 net/apiErrors.ts).
// 같은 시안 자료 여부로 동시에 부르면 요청 하나를 함께 기다린다(켤 때의 복귀 요약과 홈의 부관 보고 카드가 같은 틱에 물을 수 있다).
import type { SummaryGetResponse } from "@terra/shared/inbox";
import { api } from "../net/api.ts";
import { apiErrorInfo } from "../net/apiErrors.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";

export type SummaryLoadResult =
  | { readonly ok: true; readonly data: SummaryGetResponse }
  | { readonly ok: false; readonly error: PlainMessageKey; readonly sessionEnded: boolean };

/** 응답이 오지 않으면 끊는 시간 */
const REQUEST_TIMEOUT_MS = 10_000;

const inflight = new Map<boolean, Promise<SummaryLoadResult>>();

export function loadSummary(preview: boolean): Promise<SummaryLoadResult> {
  const existing = inflight.get(preview);
  if (existing) return existing;
  const request = api.summary.get
    .query(preview ? { preview: true } : undefined, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .then(
      (data): SummaryLoadResult => ({ ok: true, data }),
      (error: unknown): SummaryLoadResult => {
        const info = apiErrorInfo(error);
        return { ok: false, error: info.key, sessionEnded: info.sessionEnded };
      },
    )
    .finally(() => {
      inflight.delete(preview);
    });
  inflight.set(preview, request);
  return request;
}
