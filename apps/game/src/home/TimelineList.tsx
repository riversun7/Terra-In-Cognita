// 시간 순서 목록 — 마감 있는 처리할 일을 마감 순서로 세로 줄에 그린다(타임라인 템플릿·다가올 일 카드).
// 점 색은 꾸밈이다(분류 이름이 함께 보인다). 운송 도착·오프라인 24시간 끝처럼 처리할 일이 아닌 "다가올 일"은
// 그 시스템이 카드 제공 함수로 더한다(ADR 2026-10-29-app-shell 6절). 지금은 처리할 일의 마감만 있다.
import type { InboxItem } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { dueIso, dueText, isOverdue } from "./dueText.ts";
import { itemHref } from "./homeView.ts";
import { categoryName, itemTitle } from "./itemText.ts";
import { HomeLink } from "./shellParts.tsx";
import { TodoActions } from "./TodoList.tsx";

interface TimelineListProps {
  readonly items: readonly InboxItem[];
  readonly onQuickAction: (item: InboxItem, action: string) => void;
  /** false면 바로 처리 단추를 그리지 않는다(카드) */
  readonly actions?: boolean;
}

export function TimelineList({ items, onQuickAction, actions = true }: TimelineListProps) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id} className="timeline-item" data-category={item.category}>
          <HomeLink href={itemHref(item)} className="timeline-link">
            {item.deadlineAt === null ? null : (
              <time
                className="timeline-time"
                dateTime={dueIso(item.deadlineAt)}
                data-overdue={isOverdue(item.deadlineAt) ? "true" : undefined}
              >
                {dueText(item.deadlineAt)}
              </time>
            )}
            <span className="todo-title">{itemTitle(item)}</span>
            <span className="todo-meta">
              <span className="todo-category">{categoryName(item.category)}</span>
              {item.preview === true ? <span className="home-sample">{m.home_preview_tag()}</span> : null}
            </span>
          </HomeLink>
          {actions ? <TodoActions item={item} onQuickAction={onQuickAction} /> : null}
        </li>
      ))}
    </ol>
  );
}
