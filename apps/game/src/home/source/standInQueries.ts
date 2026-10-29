// [임시] 홈 자료 조회의 대신 것 — W3(처리할 일·복귀 요약 서버)이 합쳐지기 전에 쓰는 가짜. 따로 된 조각으로 동적 import()한다
// (W3의 net/homeQueries.ts와 같은 자리·같은 이름: 첫 화면 묶음에 tRPC 클라이언트를 넣지 않는다). 응답은 0단계 전송 타입 그대로다.
// 서버 규칙을 흉내 낸다(W3 apps/server/src/trpc/inbox.ts·summary.ts·dashboard.ts):
// - 실제 계정: 처리할 일은 비었고(제공 함수 0개), 서버 카드 4장은 모두 not_ready, 복귀 요약은 show: false.
// - 시안 자료(preview)는 dev·admin만 받는다. 다른 역할은 FORBIDDEN, 로그인하지 않았으면 UNAUTHORIZED(문구 키는 W3 net/apiErrors.ts와 같다).
//   시안 자료 표(previewSample.ts)는 켤 때만 따로 받는다(플레이어 묶음에 넣지 않는다).
// - 실패는 값으로 돌려준다(W3 HomeQueryResult). W3 뒤에는 이 파일·standIn.ts·previewSample.ts를 지운다.
import type { Role } from "@terra/shared";
import {
  type CardState,
  type DashboardCardsResponse,
  HOME_CARDS,
  type ServerCardId,
  isCardId,
} from "@terra/shared/dashboard";
import type { InboxListResponse, SummaryGetResponse } from "@terra/shared/inbox";
import { getSessionState } from "../../auth/session.ts";
import { serverLink } from "../../net/serverLink.ts";
import type { PlainMessageKey } from "../../ui/messageRef.ts";

/** 조회 결과. 실패도 값으로 받는다(W3 net/homeQueries.ts HomeQueryResult) */
export type HomeQueryResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: PlainMessageKey; readonly sessionEnded: boolean };

const PREVIEW_ROLES: readonly Role[] = ["dev", "admin"];
const EMPTY_COUNTS = { threat: 0, money_survival: 0, stalled: 0, decision: 0, done: 0 } as const;

const UNAUTHORIZED: HomeQueryResult<never> = {
  ok: false,
  error: "auth_notice_session_ended",
  sessionEnded: true,
};
const FORBIDDEN: HomeQueryResult<never> = { ok: false, error: "admin_err_forbidden", sessionEnded: false };

/** 서버 시각(시간·세션 ADR: 서버 UTC ms). 기기 시계 + 마지막으로 잰 차이 */
const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/** 서버의 권한 확인을 흉내 낸다: 로그인 → 시안 자료면 dev·admin. 통과하면 null */
function refuse(preview: boolean): HomeQueryResult<never> | null {
  const session = getSessionState();
  if (session.kind !== "signed_in") return UNAUTHORIZED;
  if (preview && !session.user.roles.some((role) => PREVIEW_ROLES.includes(role))) return FORBIDDEN;
  return null;
}

function isServerCardId(value: string): value is ServerCardId {
  return isCardId(value) && HOME_CARDS[value].source === "server";
}

const loadSample = () => import("./previewSample.ts");

/** inbox.list({ preview? }) */
export async function loadInbox(preview: boolean): Promise<HomeQueryResult<InboxListResponse>> {
  const refused = refuse(preview);
  if (refused !== null) return refused;
  if (preview) return { ok: true, data: (await loadSample()).previewInbox(serverNow()) };
  return { ok: true, data: { generatedAt: serverNow(), items: [], counts: EMPTY_COUNTS, badges: {} } };
}

/** summary.get({ preview? }) */
export async function loadSummary(preview: boolean): Promise<HomeQueryResult<SummaryGetResponse>> {
  const refused = refuse(preview);
  if (refused !== null) return refused;
  if (preview) return { ok: true, data: (await loadSample()).previewSummary(serverNow()) };
  return { ok: true, data: { show: false, since: null, until: serverNow(), sections: [] } };
}

/** dashboard.cards({ ids, preview? }) — 시안 자료에서도 네 카드는 "준비 중"이다(사용자 결정 2). 모르는 ID·기기 카드는 빼고 요청 순서대로 */
export async function loadCards(
  ids: readonly string[],
  preview: boolean,
): Promise<HomeQueryResult<DashboardCardsResponse>> {
  const refused = refuse(preview);
  if (refused !== null) return refused;
  const cards: CardState[] = ids.filter(isServerCardId).map((id) => ({ id, status: "not_ready" }));
  return { ok: true, data: { cards } };
}
