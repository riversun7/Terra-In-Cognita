// 부관 보고 카드 — 복귀 요약 줄과 앞 처리할 일을 말풍선으로(ADR 2026-10-29-app-shell 6절). 답 단추는 처리할 일 칸에서 누른다.
// 2×1은 말풍선 둘(요약 2줄 + 처리할 일 1줄), 2×2는 넷까지. 보일 것이 없으면 "보고할 일이 없습니다".
import type { CardSize } from "@terra/shared/dashboard";
import { m } from "../../paraglide/messages.js";
import { BriefConversation, summaryRows } from "../BriefConversation.tsx";
import type { CardBodyProps } from "../homeTypes.ts";
import { HomeEmpty, HomeLoading, inboxItemsOf } from "../InboxBody.tsx";

const LIMITS: { readonly [S in CardSize]: { summary: number; items: number } } = {
  "1x1": { summary: 1, items: 1 },
  "2x1": { summary: 2, items: 1 },
  "2x2": { summary: 4, items: 3 },
};

export function BriefingCardBody({ data, size, onQuickAction }: CardBodyProps) {
  const items = inboxItemsOf(data);
  const summary = data.summary.value;
  const waiting = data.inbox.status === "loading" || data.summary.status === "loading";
  if (items === null && summary === null) return waiting ? <HomeLoading /> : null;
  const limit = LIMITS[size];
  const shown = (items ?? []).slice(0, limit.items);
  if (shown.length === 0 && summaryRows(summary).length === 0) {
    return waiting ? <HomeLoading /> : <HomeEmpty text={m.card_briefing_empty()} />;
  }
  return (
    <BriefConversation
      summary={summary}
      summaryRowLimit={limit.summary}
      items={shown}
      onQuickAction={onQuickAction}
      actions={false}
    />
  );
}
