// 홈 자료 조회(tRPC) — 처리할 일 inbox.list, 복귀 요약 summary.get. 홈 카드(dashboard.cards)도 홈(W4)이 여기에 더한다.
// 첫 화면의 처리할 일 저장소(inbox/store.ts)·복귀 요약 문(summary/summaryGate.ts)과 홈 조각이 이 모듈 하나를 동적 import()로 부른다.
// - 모듈(조각)이 하나라서 같은 틱에 부른 조회가 함께 나가 HTTP 요청 하나로 묶인다(httpBatchLink, ADR 2026-10-29-app-shell 6절
//   "홈을 열 때 필요한 조회를 같은 틱에"). 조각이 둘이면 먼저 받은 조각의 조회가 따로 나간다(검토에서 잰 값: 로그인 직후
//   summary.get과 inbox.list가 14ms 차이로 다른 요청이었다).
// - tRPC 클라이언트(net/api.ts)가 첫 화면 묶음에 들어가지 않게 늘 동적으로만 부른다(settings/accountSync.ts와 같은 방식, ADR 37 7·11절).
//   첫 화면 모듈은 이 파일에서 타입만 가져온다(inbox/firstScreen.test.ts가 본다).
// - 실패는 값으로 돌려준다(문구 키는 net/apiErrors.ts).
import type { DashboardCardsResponse } from "@terra/shared/dashboard";
import type { InboxListResponse, SummaryGetResponse } from "@terra/shared/inbox";
import { getSessionState } from "../auth/session.ts";
import type { PlainMessageKey } from "../ui/messageRef.ts";
import { api } from "./api.ts";
import { apiErrorInfo } from "./apiErrors.ts";

/** 조회 결과. 실패도 값으로 받는다 */
export type HomeQueryResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: PlainMessageKey; readonly sessionEnded: boolean };

/** 응답이 오지 않으면 끊는 시간(복귀 요약. 처리할 일은 저장소가 신호로 끊는다) */
const REQUEST_TIMEOUT_MS = 10_000;

function failure(error: unknown): HomeQueryResult<never> {
  const info = apiErrorInfo(error);
  return { ok: false, error: info.key, sessionEnded: info.sessionEnded };
}

/** 처리할 일 목록. signal이 끊기면 실패로 끝난다(저장소가 10초·계정 바뀜에 끊는다) */
export async function loadInbox(
  preview: boolean,
  signal: AbortSignal,
): Promise<HomeQueryResult<InboxListResponse>> {
  try {
    const data = await api.inbox.list.query(preview ? { preview: true } : undefined, { signal });
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

/** 받는 중인 복귀 요약(열쇠: 계정 + 시안 자료 여부) */
const summaryInflight = new Map<string, Promise<HomeQueryResult<SummaryGetResponse>>>();

/**
 * 복귀 요약. 같은 계정·같은 시안 자료 여부로 동시에 부르면 요청 하나를 함께 기다린다(켤 때의 복귀 요약과 홈의 부관 보고 카드가
 * 같은 때 물을 수 있다). 계정을 열쇠에 넣는다: 받는 사이 다른 계정으로 바뀌면 앞 계정의 답을 함께 쓰지 않는다.
 */
export function loadSummary(preview: boolean): Promise<HomeQueryResult<SummaryGetResponse>> {
  const session = getSessionState();
  const key = `${session.kind === "signed_in" ? session.user.id : ""}|${preview ? "preview" : "own"}`;
  const existing = summaryInflight.get(key);
  if (existing) return existing;
  const request = api.summary.get
    .query(preview ? { preview: true } : undefined, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .then((data): HomeQueryResult<SummaryGetResponse> => ({ ok: true, data }), failure)
    .finally(() => {
      summaryInflight.delete(key);
    });
  summaryInflight.set(key, request);
  return request;
}

/** 복귀 요약 확인 기록(summary.ack). 실패해도 화면은 그대로다(다음에 켤 때 같은 요약이 다시 뜰 수 있다) */
export async function ackSummary(until: number): Promise<void> {
  try {
    await api.summary.ack.mutate({ until }, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    // 오프라인·세션 끝 등: 다시 보내지 않는다
  }
}

/** 홈의 서버 카드 상태(dashboard.cards). 모르는 ID·기기 카드는 서버가 빼고 요청 순서대로 돌려준다 */
export async function loadCards(
  ids: readonly string[],
  preview: boolean,
): Promise<HomeQueryResult<DashboardCardsResponse>> {
  try {
    const data = await api.dashboard.cards.query(
      { ids: [...ids], ...(preview ? { preview: true } : {}) },
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}
