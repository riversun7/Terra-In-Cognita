// 시간 순서 목록 — 마감 있는 처리할 일을 마감 순서로 세로 줄에 그린다(타임라인 템플릿·다가올 일 카드).
// 점 색은 꾸밈이다(분류 이름이 함께 보인다). 운송 도착·오프라인 24시간 끝처럼 처리할 일이 아닌 "다가올 일"은
// 그 시스템이 카드 제공 함수로 더한다(ADR 2026-10-29-app-shell 6절). 지금은 처리할 일의 마감만 있다.
// 글·갈 곳·단추는 처리함 화면과 같은 W3 규칙이다(itemView.ts). 맨 위 글자는 남은 시간("3시간 후 마감", 목록을 만든 서버 시각 기준)이다.
import type { InboxItem } from "@terra/shared/inbox";
import { deadlineIso } from "./deadline.ts";
import { CATEGORY_NAMES, INBOX_TEXT, isKnownCategory } from "./inboxParts.ts";
import { homeItemView } from "./itemView.ts";
import { HomeLink } from "./shellParts.tsx";
import { TodoActions, categoryAttr } from "./TodoList.tsx";

interface TimelineListProps {
  readonly items: readonly InboxItem[];
  /** 목록을 만든 서버 시각(generatedAt) */
  readonly now: number;
  /** false면 바로 처리 단추를 그리지 않는다(카드) */
  readonly actions?: boolean;
}

function TimelineRow({ item, now, actions }: { item: InboxItem; now: number; actions: boolean }) {
  const view = homeItemView(item, now);
  const deadline = item.deadlineAt;
  return (
    <li className="timeline-item" data-category={categoryAttr(item, view)}>
      <HomeLink to={view.target} className="timeline-link">
        {view.due === null || deadline === null ? null : (
          <time
            className="timeline-time"
            dateTime={deadlineIso(deadline)}
            data-overdue={view.overdue ? "true" : undefined}
          >
            {view.due}
          </time>
        )}
        <span className="todo-title">{view.title}</span>
        <span className="todo-meta">
          {isKnownCategory(item.category) ? (
            <span className="todo-category">{CATEGORY_NAMES[item.category]()}</span>
          ) : null}
          {view.place === null ? null : (
            <span className="todo-place" translate="no">
              {view.place}
            </span>
          )}
          {view.preview ? <span className="home-sample">{INBOX_TEXT.previewTag()}</span> : null}
        </span>
      </HomeLink>
      {actions ? <TodoActions actions={view.actions} /> : null}
    </li>
  );
}

export function TimelineList({ items, now, actions = true }: TimelineListProps) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <TimelineRow key={item.id} item={item} now={now} actions={actions} />
      ))}
    </ol>
  );
}
