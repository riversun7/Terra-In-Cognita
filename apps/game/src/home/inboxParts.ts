// 처리할 일·복귀 요약(W3)이 줄 부품의 홈 쪽 자리 — 홈은 W3 모듈을 이 파일로만 쓴다. 홈과 처리함 화면이 같은 저장소·같은 문구·
// 같은 시안 자료 스위치를 쓰게 하려는 것이다(ADR 2026-10-29-app-shell 6·7·8절: 처리할 일은 위 띠 배지와 같은 저장소,
// 모르는 종류는 처리함으로, 바로 처리 결과 뒤 다시 받기).
import type { DashboardCardsResponse } from "@terra/shared/dashboard";
import type { SummaryGetResponse } from "@terra/shared/inbox";
import { OTHER_GROUP_NAME } from "../inbox/inboxText.ts";
import type { HomeQueryResult } from "../net/homeQueries.ts";
import { m } from "../paraglide/messages.js";

export { CATEGORY_NAMES, describeItem, inboxItemTarget, isKnownCategory } from "../inbox/inboxText.ts";
export type { ItemView } from "../inbox/inboxText.ts";
export { isPreviewOn, setPreviewOn, usePreviewOn } from "../inbox/preview.ts";
export { quickActionLabel, quickActionsFor } from "../inbox/quickActions.ts";
export type { QuickActionId } from "../inbox/quickActions.ts";
export { bellCount, ensureInbox, refreshInbox, useInbox } from "../inbox/store.ts";
export type { InboxState } from "../inbox/store.ts";
export { apiErrorInfo } from "../net/apiErrors.ts";
export type { HomeQueryResult } from "../net/homeQueries.ts";
export { SECTION_LABELS, visibleSections } from "../summary/summaryText.ts";
export type { VisibleSection } from "../summary/summaryText.ts";

/**
 * 조회 모듈은 늘 동적으로 받는다(처리할 일 저장소와 같은 조각: 같은 틱의 조회가 요청 하나로 묶인다. 첫 화면에 tRPC를 넣지 않는다).
 * 앱을 켤 때는 처리할 일·복귀 요약이 홈 조각보다 먼저 나가서 dashboard.cards가 한 요청 더다(리허설에서 잼)
 */
const loadQueries = () => import("../net/homeQueries.ts");

/** 복귀 요약(부관 보고). 같은 계정·같은 시안 여부로 동시에 부르면 요청 하나를 함께 기다린다 */
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
  previewTag: m.inbox_preview_tag,
  /** 시험 자료를 보고 있다는 안내 줄 */
  previewNotice: m.inbox_preview_notice,
  /** 시험 자료의 바로 처리 단추를 눌렀다(명령을 보내지 않았다) */
  previewActionDone: m.inbox_action_preview_done,
  /** 이 기기가 모르는 분류(더 새 서버)의 줄을 모은 묶음 */
  otherGroup: OTHER_GROUP_NAME,
} satisfies Record<string, () => string>;
