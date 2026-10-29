// 다가올 일 카드 — 마감 있는 처리할 일을 마감 순서로(ADR 2026-10-29-app-shell 6절). 2×1은 3줄, 2×2는 6줄. 바로 처리는 처리할 일 칸에서 한다.
import type { CardSize } from "@terra/shared/dashboard";
import { m } from "../../paraglide/messages.js";
import type { CardBodyProps } from "../homeTypes.ts";
import { headItems, upcomingItems } from "../homeView.ts";
import { HomeEmpty, HomeLoading, MoreInInbox, inboxItemsOf } from "../InboxBody.tsx";
import { TimelineList } from "../TimelineList.tsx";

const ROWS: { readonly [S in CardSize]: number } = { "1x1": 2, "2x1": 3, "2x2": 6 };

export function TimelineCardBody({ data, size, onQuickAction }: CardBodyProps) {
  const items = inboxItemsOf(data);
  if (items === null) return data.inbox.status === "failed" ? null : <HomeLoading />;
  const upcoming = upcomingItems(items);
  if (upcoming.length === 0) return <HomeEmpty text={m.card_timeline_empty()} />;
  const { shown, rest } = headItems(upcoming, ROWS[size]);
  return (
    <>
      <TimelineList items={shown} onQuickAction={onQuickAction} actions={false} />
      {rest > 0 ? <MoreInInbox count={rest} /> : null}
    </>
  );
}
