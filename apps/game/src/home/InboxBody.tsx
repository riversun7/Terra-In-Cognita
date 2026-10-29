// 처리할 일 몸 — 불러오는 중·비었음·앞 몇 줄 + "처리함에서 n개 더 보기". 조합 템플릿의 위 고정 칸, 처리할 일 카드, 도시 템플릿이 쓴다.
// 받지 못했으면 화면 위의 알림(HomeScreen)이 [다시 시도]와 함께 알리므로 여기서는 비워 둔다(앞 값이 있으면 앞 값을 그린다).
import type { RouteTarget } from "@terra/shared";
import type { InboxItem, InboxListResponse } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { CheckIcon, ChevronRightIcon } from "./cards/icons.tsx";
import type { HomeData } from "./homeData.ts";
import { headItems } from "./homeView.ts";
import { HomeLink } from "./shellParts.tsx";
import { TodoList } from "./TodoList.tsx";
import { formatCount } from "./numbers.ts";

const INBOX_TARGET: RouteTarget = { route: "inbox" };

/** 받은 처리할 일 목록. 아직 없으면(받는 중·실패) null */
export function inboxOf(data: HomeData): InboxListResponse | null {
  return data.inbox.value;
}

/** 받는 중 한 줄 */
export function HomeLoading() {
  return <p className="home-muted">{m.home_loading()}</p>;
}

/** 비었을 때 한 줄(무엇이 언제 보일지만 말한다) */
export function HomeEmpty({ text }: { text: string }) {
  return (
    <p className="home-empty">
      <CheckIcon />
      <span>{text}</span>
    </p>
  );
}

/** 처리함으로 가는 "n개 더 보기" */
export function MoreInInbox({ hidden }: { hidden: readonly InboxItem[] }) {
  return (
    <HomeLink to={INBOX_TARGET} className="home-more">
      <span>{m.home_inbox_more({ count: formatCount(hidden.length) })}</span>
      <ChevronRightIcon />
    </HomeLink>
  );
}

interface InboxBodyProps {
  readonly data: HomeData;
  readonly limit: number;
  readonly actions?: boolean;
  readonly listId?: string | undefined;
}

export function InboxBody({ data, limit, actions = true, listId }: InboxBodyProps) {
  const response = inboxOf(data);
  if (response === null) return data.inbox.status === "failed" ? null : <HomeLoading />;
  if (response.items.length === 0) return <HomeEmpty text={m.card_inbox_empty()} />;
  const { shown, hidden } = headItems(response.items, limit);
  return (
    <>
      <TodoList items={shown} now={response.generatedAt} actions={actions} id={listId} />
      {hidden.length > 0 ? <MoreInInbox hidden={hidden} /> : null}
    </>
  );
}
