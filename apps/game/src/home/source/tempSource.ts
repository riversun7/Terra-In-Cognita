// [임시] 홈 자료 출처 — W3(처리할 일·복귀 요약 서버·기기 모듈)이 합쳐지기 전에 쓰는 가짜. 응답 모양은 0단계 전송 타입 그대로다
// (@terra/shared/dashboard·@terra/shared/inbox). 서버 규칙을 흉내 낸다:
// - 처리할 일은 비었고(종류 0개), 서버 카드 4장은 모두 not_ready(그 시스템이 아직 없다), 복귀 요약은 show: false.
// - 시안 자료(preview)는 dev·admin만 받는다. 다른 역할이 부르면 서버처럼 FORBIDDEN으로 거절한다(권한 home: preview).
//   시안 자료 표(previewSample.ts)는 켤 때만 따로 받는다(플레이어 묶음에 넣지 않는다).
// W3이 합쳐지면 이 파일과 previewSample.ts를 지우고, homeSource를 진짜 출처로 바꾼다(꽂는 줄, useHomeData.ts):
//   inboxList: W3 inbox/store.ts의 불러오기(위 띠 배지와 같은 저장소, inboxClient.ts를 동적 import)
//   dashboardCards: api.dashboard.cards.query(request) / summaryGet: api.summary.get.query(request)  (net/api.ts, 같은 틱 → 묶음 1번)
import { getSessionState } from "../../auth/session.ts";
import { serverLink } from "../../net/serverLink.ts";
import {
  type CardState,
  type DashboardCardsResponse,
  HOME_CARDS,
  type ServerCardId,
  isCardId,
} from "@terra/shared/dashboard";
import type { InboxListResponse, SummaryGetResponse } from "@terra/shared/inbox";
import { canUseHomeTools } from "../homeView.ts";
import type { HomeSource } from "../homeData.ts";

const EMPTY_COUNTS = { threat: 0, money_survival: 0, stalled: 0, decision: 0, done: 0 } as const;

/** 서버 시각(시간·세션 ADR: 서버 UTC ms). 기기 시계 + 마지막으로 잰 차이 */
const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/** 서버의 권한 거절과 같은 모양(tRPC error.data.code) */
function forbidden(): Error {
  return Object.assign(new Error("FORBIDDEN"), { data: { code: "FORBIDDEN" } });
}

/** 시안 자료를 받을 수 있는 계정인지(서버가 하는 확인을 흉내 낸다) */
function allowPreview(): boolean {
  const session = getSessionState();
  return session.kind === "signed_in" && canUseHomeTools(session.user.roles);
}

function isServerCardId(value: string): value is ServerCardId {
  return isCardId(value) && HOME_CARDS[value].source === "server";
}

const loadSample = () => import("./previewSample.ts");

export const tempHomeSource: HomeSource = {
  async inboxList(request) {
    if (request.preview === true) {
      if (!allowPreview()) throw forbidden();
      const sample = await loadSample();
      return sample.previewInbox(serverNow());
    }
    const empty: InboxListResponse = {
      generatedAt: serverNow(),
      items: [],
      counts: EMPTY_COUNTS,
      badges: {},
    };
    return empty;
  },
  async dashboardCards(request) {
    if (request.preview === true && !allowPreview()) throw forbidden();
    // 시안 자료에서도 사이보그·보유 유닛·자산·세력은 "준비 중"이다(사용자 결정 2). 모르는 ID는 빼고 답한다
    const cards: CardState[] = request.ids.filter(isServerCardId).map((id) => ({ id, status: "not_ready" }));
    const response: DashboardCardsResponse = { cards };
    return response;
  },
  async summaryGet(request) {
    if (request.preview === true) {
      if (!allowPreview()) throw forbidden();
      const sample = await loadSample();
      return sample.previewSummary(serverNow());
    }
    const none: SummaryGetResponse = { show: false, since: null, until: serverNow(), sections: [] };
    return none;
  },
};
