// 처리할 일·복귀 요약(W3)이 줄 부품의 홈 쪽 자리 — 홈은 W3 모듈을 이 파일로만 쓴다(꽂는 곳을 한 곳에 모은다. 화면 틀 W1은
// shellParts.tsx, 계정 설정 W2는 homeSettings.ts). 홈과 처리함 화면이 같은 저장소·같은 문구·같은 시안 자료 스위치를 쓰게 하려는 것이다
// (ADR 2026-10-29-app-shell 6·7·8절: 처리할 일은 위 띠 배지와 같은 저장소, 모르는 종류는 처리함으로, 바로 처리 결과 뒤 다시 받기).
// [임시] W3이 main에 합쳐지기 전에는 ./source/의 대신 것을 가리킨다. 이름·모양·뜻은 W3 가지(work/app-shell-w3, 검토 반영 뒤 커밋 11120e7)와 같다.
// W3 뒤(꽂는 줄): 아래 "./source/…"를 W3 모듈로 바꾸고, ./source/ 폴더와 메시지 키 home_tmp_*를 지운다. 홈의 다른 파일은 고치지 않는다.
//   usePreviewOn·setPreviewOn·isPreviewOn                      → ../inbox/preview.ts
//   useInbox·ensureInbox·refreshInbox·bellCount·InboxState      → ../inbox/store.ts
//   describeItem·inboxItemTarget·CATEGORY_NAMES·isKnownCategory·ItemView → ../inbox/inboxText.ts
//   quickActionsFor·quickActionLabel·QuickActionId              → ../inbox/quickActions.ts
//   SECTION_LABELS·visibleSections·VisibleSection               → ../summary/summaryText.ts
//   apiErrorInfo                                                → ../net/apiErrors.ts
//   HomeQueryResult·loadSummary(동적 import)                    → ../net/homeQueries.ts
//   loadCards(동적 import)                                      → W4가 ../net/homeQueries.ts에 더한다(api.dashboard.cards.query, 실패는 값으로).
//     같은 조각(모듈)이라 같은 틱에 부른 조회와 HTTP 요청 하나로 묶인다(앱 안에서 홈을 다시 열 때: inbox.list + dashboard.cards 한 요청).
//     앱을 켤 때는 처리할 일 저장소·복귀 요약 문이 홈 조각보다 먼저 inbox.list·summary.get을 불러 dashboard.cards가 한 요청 더 나간다
//     (W1·W2·W3과 합친 리허설에서 잼). 첫 화면에 tRPC를 넣지 않게 늘 동적으로 부른다
//   INBOX_TEXT의 home_tmp_* 넷                                  → m.inbox_preview_tag·inbox_preview_notice·inbox_action_preview_done,
//                                                                 그 밖의 알림은 W3 OTHER_GROUP_NAME(m.inbox_group_other)
import type { DashboardCardsResponse } from "@terra/shared/dashboard";
import type { SummaryGetResponse } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import type { HomeQueryResult } from "./source/standInQueries.ts";

export {
  CATEGORY_NAMES,
  SECTION_LABELS,
  apiErrorInfo,
  bellCount,
  describeItem,
  ensureInbox,
  inboxItemTarget,
  isKnownCategory,
  isPreviewOn,
  quickActionLabel,
  quickActionsFor,
  refreshInbox,
  setPreviewOn,
  useInbox,
  usePreviewOn,
  visibleSections,
} from "./source/standIn.ts";
export type { InboxState, ItemView, QuickActionId, VisibleSection } from "./source/standIn.ts";
export type { HomeQueryResult } from "./source/standInQueries.ts";

/** 조회 모듈은 늘 동적으로 받는다(처리할 일 저장소와 같은 조각) */
const loadQueries = () => import("./source/standInQueries.ts");

/** 복귀 요약(부관 보고). 같은 계정·같은 시안 여부로 동시에 부르면 W3이 요청 하나로 묶는다 */
export async function loadSummary(preview: boolean): Promise<HomeQueryResult<SummaryGetResponse>> {
  return (await loadQueries()).loadSummary(preview);
}

/** 홈의 서버 카드 상태(dashboard.cards) */
export async function loadCards(
  ids: readonly string[],
  preview: boolean,
): Promise<HomeQueryResult<DashboardCardsResponse>> {
  return (await loadQueries()).loadCards(ids, preview);
}

/** W3 화면이 쓰는 문구 중 홈도 쓰는 것. 같은 키라서 홈과 처리함 화면의 글이 같다 */
export const INBOX_TEXT = {
  /** 항목마다 "시험 자료" */
  previewTag: m.home_tmp_preview_tag,
  /** 시험 자료를 보고 있다는 안내 줄 */
  previewNotice: m.home_tmp_preview_notice,
  /** 시험 자료의 바로 처리 단추를 눌렀다(명령을 보내지 않았다) */
  previewActionDone: m.home_tmp_action_preview_done,
  /** 이 기기가 모르는 분류(더 새 서버)의 줄을 모은 묶음 */
  otherGroup: m.home_tmp_group_other,
} satisfies Record<string, () => string>;
