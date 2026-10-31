// 처리할 일 몸 — 불러오는 중·비었음·앞 몇 줄 + "처리함에서 n개 더 보기". 조합 템플릿의 위 고정 칸, 처리할 일 카드, 도시 템플릿이 쓴다.
// 받지 못했으면 화면 위의 알림(HomeScreen)이 [다시 시도]와 함께 알리므로 여기서는 비워 둔다(앞 값이 있으면 앞 값을 그린다).
// "더 보기"에는 가린 줄의 분류별 수를 함께 보인다: 줄 수가 모자란 칸에서도 마감 없는 줄이 많은 분류(멈춤·완료 등)가 보이게
// (ADR 2026-10-29-app-shell 6절 "마감 없는 항목도 빠지지 않는다"의 기술 해석, homeView.ts hiddenCounts).
import type { RouteTarget } from "@terra/shared";
import type { InboxItem, InboxListResponse } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { CategoryIcon, CheckIcon, ChevronRightIcon } from "./cards/icons.tsx";
import type { HomeData } from "./homeData.ts";
import { headItems, hiddenCounts } from "./homeView.ts";
import { CATEGORY_NAMES } from "./inboxParts.ts";
import { formatCount } from "./numbers.ts";
import { HomeLink } from "./shellParts.tsx";
import { TodoList } from "./TodoList.tsx";

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

/** 처리함으로 가는 "n개 더 보기" + 가린 줄의 분류별 수(아이콘 + 이름 + 수) */
export function MoreInInbox({ hidden }: { hidden: readonly InboxItem[] }) {
  const counts = hiddenCounts(hidden);
  return (
    <HomeLink to={INBOX_TARGET} className="home-more">
      <span className="home-more-text">
        <span>{m.home_inbox_more({ count: formatCount(hidden.length) })}</span>
        <ChevronRightIcon />
      </span>
      {counts.length > 0 ? (
        <span className="home-more-counts">
          {counts.map(({ category, count }) => (
            <span key={category} className="home-count-chip" data-category={category}>
              <CategoryIcon category={category} />
              <span>
                {m.home_category_count({ category: CATEGORY_NAMES[category](), count: formatCount(count) })}
              </span>
            </span>
          ))}
        </span>
      ) : null}
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
