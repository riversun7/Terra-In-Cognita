// 홈 자료 서비스 — tRPC 맥락의 home(처리할 일·복귀 요약·서버 카드). ADR 2026-10-29-app-shell 6·7·8절.
// 앱을 만들 때 한 번 만든다(trpc/createContext.ts의 createContextFactory). 제공 함수·사건 출처·카드 제공 함수 목록은
// 각 모듈의 create…가 정한다. 지금은 모두 0개라 DB를 받지 않는다. 시스템이 생겨 DB·월드가 필요하면 여기로 넘긴다.
import { collectInbox, checkProviders, createInboxProviders } from "../inbox/registry.ts";
import type { InboxAccount } from "../inbox/types.ts";
import type { QueryPool } from "../world/persist/load.ts";
import { EMPTY_SUMMARY_BACKEND, type SummaryBackend, collectSummary } from "../summary/summary.ts";
import type { HomeServices, Viewer } from "../trpc/context.ts";
import { createServerCardProviders, loadDashboardCards } from "./cards.ts";

const accountOf = (viewer: Viewer): InboxAccount => ({ userId: viewer.id, roles: viewer.roles });

/**
 * summary: 복귀 요약 자료(DB·월드가 있을 때 app.ts가 만든다, src/world/summarySources.ts).
 * pool: 처리할 일 제공 함수가 읽는 DB(웨이브 예고 wave_incoming, DB가 있을 때)
 */
export function createHomeServices(
  options: { summary?: SummaryBackend | undefined; pool?: QueryPool | undefined } = {},
): HomeServices {
  const inboxProviders = createInboxProviders({ pool: options.pool });
  checkProviders(inboxProviders);
  const summary = options.summary ?? EMPTY_SUMMARY_BACKEND;
  const cardProviders = createServerCardProviders();
  return {
    inbox: (viewer, query) => collectInbox(inboxProviders, accountOf(viewer), query.now, query.preview),
    summary: (viewer, query) => collectSummary(summary, accountOf(viewer), query.now, query.preview),
    ackSummary: (viewer, until, now) => summary.ack(viewer.id, until, now),
    // 시안 자료에서도 서버 카드는 "준비 중"이라 preview는 권한 확인에만 쓴다(trpc/dashboard.ts)
    cards: (viewer, ids, query) => loadDashboardCards(cardProviders, ids, accountOf(viewer), query.now),
  };
}
