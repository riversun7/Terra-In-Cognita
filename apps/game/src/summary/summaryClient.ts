// 복귀 요약 요청(tRPC summary.get) — 첫 화면의 복귀 요약 문(summaryGate.ts)과 홈이 동적 import()로 부른다.
// tRPC 클라이언트를 첫 화면 묶음에 넣지 않으려고다(ADR 2026-10-29-app-shell 8·11절). 실패는 값으로 돌려준다(문구 키는 net/apiErrors.ts).
// 같은 계정·같은 시안 자료 여부로 동시에 부르면 요청 하나를 함께 기다린다(켤 때의 복귀 요약과 홈의 부관 보고 카드가
// 같은 때 물을 수 있다). 계정을 열쇠에 넣는다: 받는 사이 다른 계정으로 바뀌면 앞 계정의 답을 함께 쓰지 않는다.
import type { SummaryGetResponse } from "@terra/shared/inbox";
import { getSessionState } from "../auth/session.ts";
import { api } from "../net/api.ts";
import { apiErrorInfo } from "../net/apiErrors.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";

export type SummaryLoadResult =
  | { readonly ok: true; readonly data: SummaryGetResponse }
  | { readonly ok: false; readonly error: PlainMessageKey; readonly sessionEnded: boolean };

/** 응답이 오지 않으면 끊는 시간 */
const REQUEST_TIMEOUT_MS = 10_000;

const inflight = new Map<string, Promise<SummaryLoadResult>>();

export function loadSummary(preview: boolean): Promise<SummaryLoadResult> {
  const session = getSessionState();
  const key = `${session.kind === "signed_in" ? session.user.id : ""}|${preview ? "preview" : "own"}`;
  const existing = inflight.get(key);
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
      inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}
